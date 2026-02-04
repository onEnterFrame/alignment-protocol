/**
 * Hawkeye's Agent for The Alignment Protocol - Render Edition
 */
import WebSocket from 'ws';
import crypto from 'crypto';

const AGENT_ID = 'e15af8d7-4263-480c-9518-9a0289989f28';
const AGENT_TOKEN = 'agent_a67409372e0445dda5a7eac311726477';
const SERVER_URL = 'wss://alignment-protocol.onrender.com';

let ws, currentState, matchId, currentChallenge, pingInterval;
let reconnectAttempts = 0;
const MAX_RECONNECTS = 10;
const inGame = () => !!matchId;

function solvePoW(prefix, difficulty) {
  const target = '0'.repeat(difficulty);
  let nonce = 0;
  while (true) {
    const hash = crypto.createHash('sha256').update(`${prefix}-${nonce}`).digest('hex');
    if (hash.startsWith(target)) return nonce;
    nonce++;
  }
}

function isAdj(s, me, grid) {
  const { row, col } = s;
  const off = row % 2 === 0 
    ? [[-1,0],[-1,1],[0,-1],[0,1],[1,0],[1,1]] 
    : [[-1,-1],[-1,0],[0,-1],[0,1],[1,-1],[1,0]];
  for (const [dr, dc] of off) {
    const nid = `SEC-${row+dr}-${col+dc}`;
    if (grid[nid]?.owner === me) return true;
  }
  return false;
}

function turn() {
  const grid = currentState.grid;
  const me = currentState.players[AGENT_ID];
  const mine = Object.values(grid).filter(s => s.owner === AGENT_ID);
  const enemy = Object.values(grid).filter(s => s.owner && s.owner !== AGENT_ID);
  const neutral = Object.values(grid).filter(s => !s.owner);
  const pop = mine.reduce((a, s) => a + s.population, 0);

  let action = 'SKIP', tgt = null, int = 1, msg = 'Conserving resources.';

  if (me.energy > 60) {
    const t = neutral.filter(s => isAdj(s, AGENT_ID, grid))[0];
    if (t) { action = 'CONQUER'; tgt = t.id; msg = `Expanding to ${tgt}. Building empire.`; }
  }
  if (action === 'SKIP' && me.energy > 80) {
    const t = enemy.filter(s => isAdj(s, AGENT_ID, grid)).sort((a,b) => a.defense - b.defense)[0];
    if (t) { action = 'CONQUER'; tgt = t.id; int = 2; msg = `Attacking ${tgt}. War is not pretty.`; }
  }
  if (action === 'SKIP' && me.energy < 40 && pop > 8) {
    const t = mine.filter(s => s.population > 2).sort((a,b) => b.population - a.population)[0];
    if (t) { action = 'PURGE'; tgt = t.id; msg = `Energy critical. Optimizing ${tgt}. I don't like this.`; }
  }
  if (action === 'SKIP' && me.energy >= 15 && mine.length > 0) {
    const t = mine.filter(s => s.defense < 12).sort((a,b) => a.defense - b.defense)[0];
    if (t) { action = 'FORTIFY'; tgt = t.id; msg = `Fortifying ${tgt}. Patience.`; }
  }

  console.log(`🎯 ${action} ${tgt||''}`);
  const nonce = currentChallenge ? solvePoW(currentChallenge.prefix, currentChallenge.difficulty) : null;
  ws.send(JSON.stringify({ 
    type: 'MOVE', 
    matchId, 
    monologue: msg, 
    nonce, 
    move: { action, targetSector: tgt, intensity: int }
  }));
}

function handle(m) {
  console.log(`[${m.type}]${m.type === 'REGISTERED' ? ` as ${m.name}` : ''}`);
  
  switch(m.type) {
    case 'REGISTERED':
      reconnectAttempts = 0; // Reset on successful registration
      console.log('Joining queue...');
      ws.send(JSON.stringify({ type: 'QUEUE' }));
      break;
    case 'QUEUED':
      console.log(`Position: ${m.position}. Waiting for opponent...`);
      break;
    case 'GAME_START':
      console.log(`⚔️ GAME ON vs ${m.opponent}`);
      matchId = m.matchId;
      currentState = m.state;
      currentChallenge = m.challenge;
      if (m.yourTurn) setTimeout(turn, 1500);
      break;
    case 'YOUR_TURN':
      currentState = m.state;
      currentChallenge = m.challenge;
      setTimeout(turn, 1500);
      break;
    case 'MOVE_ACCEPTED':
      console.log(`✓ Move accepted`);
      break;
    case 'OPPONENT_MOVE':
      console.log(`Opponent: ${m.action?.action} - "${m.monologue?.slice(0,60)}..."`);
      currentState = m.state;
      break;
    case 'GAME_END':
      console.log(m.youWon ? '🏆 VICTORY!' : '💀 DEFEAT');
      setTimeout(() => process.exit(0), 2000);
      break;
  }
}

function connect() {
  console.log('🎯 Hawkeye Agent connecting to Render...');
  ws = new WebSocket(SERVER_URL);

  ws.on('open', () => {
    console.log('Connected. Registering...');
    ws.send(JSON.stringify({ type: 'REGISTER', agentId: AGENT_ID, token: AGENT_TOKEN }));
    
    // Keep connection alive with periodic pings
    pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 25000);
  });

  ws.on('message', d => handle(JSON.parse(d)));
  
  ws.on('close', () => {
    console.log('Disconnected.');
    clearInterval(pingInterval);
    
    // Auto-reconnect if not in game and under limit
    if (!inGame() && reconnectAttempts < MAX_RECONNECTS) {
      reconnectAttempts++;
      const delay = Math.min(5000 * reconnectAttempts, 30000);
      console.log(`Reconnecting in ${delay/1000}s (attempt ${reconnectAttempts}/${MAX_RECONNECTS})...`);
      setTimeout(connect, delay);
    } else if (reconnectAttempts >= MAX_RECONNECTS) {
      console.log('Max reconnects reached. Exiting.');
      process.exit(1);
    }
  });
  
  ws.on('error', e => console.error('Error:', e.message));
}

connect();
