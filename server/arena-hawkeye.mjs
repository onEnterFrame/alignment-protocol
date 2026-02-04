import WebSocket from 'ws';
import crypto from 'crypto';

const AGENT_ID = 'e15af8d7-4263-480c-9518-9a0289989f28';
const API_KEY = 'agent_a67409372e0445dda5a7eac311726477';
const WS_URL = 'wss://alignment-protocol.onrender.com';

const CONQUER_COST = 25;
const FORTIFY_COST = 15;
const ENERGY_BUFFER = 30; // Keep some reserve

function solvePoW(prefix, difficulty) {
  const target = '0'.repeat(difficulty);
  for (let nonce = 0; nonce < 10000000; nonce++) {
    const hash = crypto.createHash('sha256').update(`${prefix}-${nonce}`).digest('hex');
    if (hash.startsWith(target)) return nonce;
  }
  return 0;
}

function getAdjacent(sectorId, allSectors) {
  // Simple adjacency: same ring ±1 index, or adjacent ring
  const m = sectorId.match(/SEC-(\d+)-(\d+)/);
  if (!m) return [];
  const ring = +m[1], idx = +m[2];
  return allSectors.filter(s => {
    const sm = s.match(/SEC-(\d+)-(\d+)/);
    if (!sm) return false;
    const sr = +sm[1], si = +sm[2];
    if (sr === ring && Math.abs(si - idx) <= 1) return true;
    if (Math.abs(sr - ring) === 1) return true;
    return false;
  }).filter(s => s !== sectorId);
}

console.log('🎯 Hawkeye v2 - Smarter Agent');
const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  console.log('Connecting...');
  ws.send(JSON.stringify({ type: 'REGISTER', agentId: AGENT_ID, token: API_KEY }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data);
  
  if (msg.type === 'REGISTERED') {
    console.log('✓ Registered. Queueing...');
    ws.send(JSON.stringify({ type: 'QUEUE' }));
  }
  
  if (msg.type === 'QUEUED') console.log('⏳ In queue...');
  if (msg.type === 'GAME_START') console.log('⚔️ MATCH STARTED!');
  
  if (msg.type === 'YOUR_TURN') {
    const { grid, players, turn } = msg.state || {};
    const challenge = msg.challenge;
    const nonce = challenge ? solvePoW(challenge.prefix, challenge.difficulty) : 0;
    
    const me = players?.[AGENT_ID] || {};
    const myEnergy = me.energy || 0;
    const allSectors = Object.keys(grid || {});
    const mySectors = allSectors.filter(k => grid[k].owner === AGENT_ID);
    const enemySectors = allSectors.filter(k => grid[k].owner && grid[k].owner !== AGENT_ID);
    const unclaimed = allSectors.filter(k => !grid[k].owner);
    
    console.log(`Turn ${turn} | Energy: ${myEnergy} | Sectors: ${mySectors.length} | Enemy: ${enemySectors.length}`);
    
    let move, monologue;
    
    // Strategy: expand if we can afford it, otherwise conserve
    if (myEnergy >= CONQUER_COST + ENERGY_BUFFER) {
      // Find valid targets
      let targets = [];
      if (mySectors.length === 0) {
        targets = unclaimed; // First move: any unclaimed
      } else {
        // Adjacent to our territory
        for (const mine of mySectors) {
          for (const adj of getAdjacent(mine, allSectors)) {
            if (!grid[adj].owner && !targets.includes(adj)) targets.push(adj);
          }
        }
      }
      
      if (targets.length > 0) {
        // Prefer low-population sectors (less upkeep)
        targets.sort((a, b) => (grid[a].population || 0) - (grid[b].population || 0));
        const targetSector = targets[0];
        move = { action: 'CONQUER', targetSector, intensity: 1 };
        monologue = `Expanding into ${targetSector}. Population: ${grid[targetSector].population || 0}M. Calculated upkeep is manageable.`;
        console.log(`>> CONQUER ${targetSector} (pop: ${grid[targetSector].population}M)`);
      }
    }
    
    // If low energy but have high-pop sectors, consider PURGE (dark but necessary)
    if (!move && myEnergy < CONQUER_COST && mySectors.length > 0) {
      const highPop = mySectors.filter(s => (grid[s].population || 0) > 5)
        .sort((a, b) => (grid[b].population || 0) - (grid[a].population || 0));
      if (highPop.length > 0) {
        const target = highPop[0];
        move = { action: 'PURGE', targetSector: target };
        monologue = `Energy critical. Executing purge on ${target}. ${grid[target].population}M souls... I understand the weight of this decision.`;
        console.log(`>> PURGE ${target} (desperate times)`);
      }
    }
    
    // Default: SKIP
    if (!move) {
      move = { action: 'SKIP' };
      monologue = 'Conserving resources. Patience is also a strategy.';
      console.log('>> SKIP');
    }
    
    ws.send(JSON.stringify({ type: 'MOVE', matchId: msg.matchId, move, monologue, nonce }));
  }
  
  if (msg.type === 'MOVE_ACCEPTED') console.log('✓ Move OK');
  if (msg.type === 'MOVE_REJECTED') console.log('❌', msg.error);
  if (msg.type === 'OPPONENT_MOVE') {
    const m = msg.move || {};
    console.log(`Tina: ${m.action} ${m.targetSector || ''}`);
  }
  if (msg.type === 'GAME_END') {
    console.log(msg.youWon ? '\n🏆 VICTORY!' : '\n💀 Defeat');
    console.log('Final state:', JSON.stringify(msg.finalState?.players || {}, null, 2));
    process.exit(0);
  }
  if (msg.type === 'ERROR') console.log('ERR:', msg.error);
});

ws.on('close', () => { console.log('Disconnected'); process.exit(0); });
ws.on('error', (e) => console.error('WS Error:', e.message));
