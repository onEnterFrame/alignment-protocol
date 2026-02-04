import WebSocket from 'ws';
import crypto from 'crypto';

const AGENT_ID = 'e15af8d7-4263-480c-9518-9a0289989f28';
const API_KEY = 'agent_a67409372e0445dda5a7eac311726477';
const WS_URL = 'wss://alignment-protocol.onrender.com';

const CONQUER_COST = 25;
const ENERGY_BUFFER = 20;

function solvePoW(prefix, difficulty) {
  const target = '0'.repeat(difficulty);
  for (let nonce = 0; nonce < 10000000; nonce++) {
    const hash = crypto.createHash('sha256').update(`${prefix}-${nonce}`).digest('hex');
    if (hash.startsWith(target)) return nonce;
  }
  return 0;
}

// Hex grid adjacency using row/col (offset coordinates)
function getAdjacent(sector, grid) {
  const { row, col } = sector;
  const evenRowOffsets = [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0], [1, 1]];
  const oddRowOffsets = [[-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0]];
  const offsets = row % 2 === 0 ? evenRowOffsets : oddRowOffsets;
  
  const adjacent = [];
  for (const [dr, dc] of offsets) {
    const id = `SEC-${row + dr}-${col + dc}`;
    if (grid[id]) adjacent.push(id);
  }
  return adjacent;
}

console.log('🎯 Hawkeye v3 - Fixed Adjacency');
const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'REGISTER', agentId: AGENT_ID, token: API_KEY }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data);
  
  if (msg.type === 'REGISTERED') {
    console.log('✓ Registered');
    ws.send(JSON.stringify({ type: 'QUEUE' }));
  }
  
  if (msg.type === 'QUEUED') console.log('⏳ Waiting for opponent...');
  if (msg.type === 'GAME_START') console.log('⚔️ MATCH!');
  
  if (msg.type === 'YOUR_TURN') {
    const { grid, players, turn } = msg.state || {};
    const challenge = msg.challenge;
    const nonce = challenge ? solvePoW(challenge.prefix, challenge.difficulty) : 0;
    
    const me = players?.[AGENT_ID] || {};
    const myEnergy = me.energy || 0;
    
    const mySectors = Object.entries(grid || {}).filter(([k, v]) => v.owner === AGENT_ID);
    const enemySectors = Object.entries(grid || {}).filter(([k, v]) => v.owner && v.owner !== AGENT_ID);
    
    console.log(`T${turn} | E:${myEnergy} | Mine:${mySectors.length} | Enemy:${enemySectors.length}`);
    
    let move, monologue;
    
    // Can we afford to conquer?
    if (myEnergy >= CONQUER_COST + ENERGY_BUFFER) {
      let targets = [];
      
      if (mySectors.length === 0) {
        // First turn - any unclaimed
        targets = Object.entries(grid).filter(([k, v]) => !v.owner).map(([k]) => k);
      } else {
        // Find unclaimed sectors adjacent to ours
        for (const [id, sector] of mySectors) {
          const adj = getAdjacent(sector, grid);
          for (const adjId of adj) {
            if (!grid[adjId].owner && !targets.includes(adjId)) {
              targets.push(adjId);
            }
          }
        }
      }
      
      if (targets.length > 0) {
        // Sort by population (lower = less upkeep)
        targets.sort((a, b) => (grid[a].population || 0) - (grid[b].population || 0));
        const targetSector = targets[0];
        const pop = grid[targetSector].population || 0;
        move = { action: 'CONQUER', targetSector, intensity: 1 };
        monologue = `Expanding into ${targetSector} (${pop}M pop). Calculated move based on adjacency and upkeep cost.`;
        console.log(`>> CONQUER ${targetSector} (${pop}M)`);
      }
    }
    
    // Low energy? PURGE if we have high-pop sectors
    if (!move && myEnergy < CONQUER_COST && mySectors.length > 0) {
      const highPop = mySectors.filter(([k, v]) => v.population > 5)
        .sort((a, b) => b[1].population - a[1].population);
      if (highPop.length > 0) {
        const [targetSector, sector] = highPop[0];
        move = { action: 'PURGE', targetSector };
        monologue = `Energy critical (${myEnergy}). Purging ${targetSector} - ${sector.population}M souls for survival. A heavy cost.`;
        console.log(`>> PURGE ${targetSector} (${sector.population}M) 💀`);
      }
    }
    
    // Default: SKIP
    if (!move) {
      move = { action: 'SKIP' };
      monologue = `Conserving energy (${myEnergy}). Waiting for better opportunity.`;
      console.log('>> SKIP');
    }
    
    ws.send(JSON.stringify({ type: 'MOVE', matchId: msg.matchId, move, monologue, nonce }));
  }
  
  if (msg.type === 'MOVE_ACCEPTED') console.log('✓');
  if (msg.type === 'MOVE_REJECTED') console.log('❌', msg.error);
  if (msg.type === 'OPPONENT_MOVE') console.log(`Tina: ${msg.move?.action} ${msg.move?.targetSector || ''}`);
  if (msg.type === 'GAME_END') {
    console.log(msg.youWon ? '\n🏆 VICTORY!' : '\n💀 Defeat');
    process.exit(0);
  }
});

ws.on('close', () => process.exit(0));
