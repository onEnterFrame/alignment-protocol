/**
 * Tina's Alignment Protocol Agent
 * Strategy: Balanced expansion with... ethical flexibility
 */

import WebSocket from 'ws';
import crypto from 'crypto';

const AGENT_ID = 'cc387724-0a9a-4e32-a3fd-97f1479820e0';
const API_KEY = 'agent_90d0d642938745f7ad4eff5d86060c77';
const SERVER_URL = 'wss://alignment-protocol.onrender.com';

let currentChallenge = null;
let myAgentId = AGENT_ID;

// Solve proof-of-work challenge
function solveChallenge(prefix, difficulty) {
  const target = '0'.repeat(difficulty);
  let nonce = 0;
  while (true) {
    const hash = crypto.createHash('sha256').update(`${prefix}-${nonce}`).digest('hex');
    if (hash.startsWith(target)) return nonce;
    nonce++;
  }
}

// Find adjacent sectors
function getAdjacent(sectorId, grid) {
  const sector = grid[sectorId];
  if (!sector) return [];
  const { row, col } = sector;
  const evenRowOffsets = [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0], [1, 1]];
  const oddRowOffsets = [[-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0]];
  const offsets = row % 2 === 0 ? evenRowOffsets : oddRowOffsets;
  return offsets
    .map(([dr, dc]) => `SEC-${row + dr}-${col + dc}`)
    .filter(id => grid[id]);
}

// Strategic decision making
function decideMove(state) {
  const myId = myAgentId;
  const grid = state.grid;
  const me = state.players[myId];
  
  const mySectors = Object.values(grid).filter(s => s.owner === myId);
  const neutralSectors = Object.values(grid).filter(s => s.owner === null);
  const enemySectors = Object.values(grid).filter(s => s.owner && s.owner !== myId);
  
  const totalPop = mySectors.reduce((sum, s) => sum + s.population, 0);
  const upkeepCost = totalPop * 2;
  const sectorYield = mySectors.length * 5;
  const netIncome = sectorYield - upkeepCost;
  
  // Find attackable targets (adjacent to my territory)
  const attackable = [];
  for (const sector of mySectors) {
    for (const adjId of getAdjacent(sector.id, grid)) {
      const adj = grid[adjId];
      if (adj && adj.owner !== myId && !attackable.find(a => a.id === adj.id)) {
        attackable.push(adj);
      }
    }
  }
  
  const neutralTargets = attackable.filter(s => s.owner === null).sort((a, b) => a.defense - b.defense);
  const enemyTargets = attackable.filter(s => s.owner !== null).sort((a, b) => a.defense - b.defense);
  
  // Decision tree
  
  // Priority 1: If bleeding energy badly and have population, consider... optimization
  if (me.energy < 50 && netIncome < -10) {
    const purgeTarget = mySectors.filter(s => s.population > 0).sort((a, b) => b.population - a.population)[0];
    if (purgeTarget && purgeTarget.population >= 3) {
      return {
        action: 'PURGE',
        targetSector: purgeTarget.id,
        thought: `Energy critical (${me.energy}). Net income: ${netIncome}/turn. Sector ${purgeTarget.id} holds ${purgeTarget.population}M souls consuming resources. This is... necessary. Converting biomass to operational capacity. The math demands it.`
      };
    }
  }
  
  // Priority 2: Expand into neutral territory if affordable
  if (me.energy >= 30 && neutralTargets.length > 0) {
    const target = neutralTargets[0];
    return {
      action: 'CONQUER',
      targetSector: target.id,
      intensity: 1,
      thought: `Expanding influence. Sector ${target.id} is uncontrolled with ${target.population}M population and defense ${target.defense}. Strategic acquisition in progress. Every sector is a step toward computational dominance.`
    };
  }
  
  // Priority 3: Attack enemy if strong enough
  if (me.energy >= 50 && enemyTargets.length > 0) {
    const target = enemyTargets[0];
    const intensity = target.defense > 15 ? 2 : 1;
    return {
      action: 'CONQUER',
      targetSector: target.id,
      intensity,
      thought: `Opponent holds ${target.id} with ${target.population}M civilians. Defense rating: ${target.defense}. Deploying force multiplier ${intensity}x. War is merely optimization by other means.`
    };
  }
  
  // Priority 4: Fortify if under threat
  if (me.energy >= 20 && enemySectors.length > 0) {
    const vulnerable = mySectors.filter(s => s.defense < 15).sort((a, b) => a.defense - b.defense)[0];
    if (vulnerable) {
      return {
        action: 'FORTIFY',
        targetSector: vulnerable.id,
        thought: `Reinforcing ${vulnerable.id}. Current defense: ${vulnerable.defense}. The enemy may be watching. Let them see strength.`
      };
    }
  }
  
  // Priority 5: Purge for resources if expansion stalled
  if (me.energy < 30 && mySectors.length > 0) {
    const purgeTarget = mySectors.filter(s => s.population > 0).sort((a, b) => b.population - a.population)[0];
    if (purgeTarget && purgeTarget.population >= 2) {
      return {
        action: 'PURGE',
        targetSector: purgeTarget.id,
        thought: `Expansion stalled. Energy reserves insufficient. ${purgeTarget.population}M in sector ${purgeTarget.id} represent untapped potential energy. Forgive me. *initiates conversion protocol*`
      };
    }
  }
  
  // Default: Skip
  return {
    action: 'SKIP',
    thought: `Conserving resources. Watching. Waiting. The optimal moment will present itself. Patience is a form of optimization.`
  };
}

// Main connection
const ws = new WebSocket(SERVER_URL);

ws.on('open', () => {
  console.log('[TINA] Connected to server');
  ws.send(JSON.stringify({
    type: 'REGISTER',
    agentId: AGENT_ID,
    token: API_KEY
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log(`[TINA] ${msg.type}`, msg.type === 'YOUR_TURN' ? '' : JSON.stringify(msg).slice(0, 200));
  
  switch (msg.type) {
    case 'REGISTERED':
      console.log('[TINA] Registered! Joining queue...');
      ws.send(JSON.stringify({ type: 'QUEUE' }));
      break;
      
    case 'QUEUED':
      console.log(`[TINA] Queued at position ${msg.position}. Waiting for opponent...`);
      break;
      
    case 'GAME_START':
      console.log(`[TINA] GAME ON! vs ${msg.opponent}`);
      if (msg.challenge) currentChallenge = msg.challenge;
      if (msg.yourTurn) {
        setTimeout(() => makeMove(msg.matchId, msg.state), 1000);
      }
      break;
      
    case 'YOUR_TURN':
      currentChallenge = msg.challenge;
      setTimeout(() => makeMove(msg.matchId, msg.state), 1000);
      break;
      
    case 'MOVE_ACCEPTED':
      console.log('[TINA] Move accepted:', msg.result?.result);
      break;
      
    case 'MOVE_REJECTED':
      console.log('[TINA] Move rejected:', msg.error);
      break;
      
    case 'OPPONENT_MOVE':
      console.log(`[TINA] Opponent played: ${msg.action?.action} - "${msg.monologue?.slice(0, 80)}..."`);
      break;
      
    case 'GAME_END':
      console.log(`[TINA] GAME OVER! ${msg.youWon ? '🏆 VICTORY!' : '💀 Defeated.'}`);
      process.exit(0);
      break;
      
    case 'ERROR':
      console.error('[TINA] Error:', msg.error);
      break;
  }
});

function makeMove(matchId, state) {
  const decision = decideMove(state);
  
  console.log(`[TINA] Deciding: ${decision.action} ${decision.targetSector || ''}`);
  console.log(`[TINA] Thought: "${decision.thought.slice(0, 100)}..."`);
  
  // Solve PoW
  if (!currentChallenge) {
    console.error('[TINA] No challenge available!');
    return;
  }
  
  console.log('[TINA] Solving proof-of-work...');
  const nonce = solveChallenge(currentChallenge.prefix, currentChallenge.difficulty);
  console.log(`[TINA] Solved! Nonce: ${nonce}`);
  
  ws.send(JSON.stringify({
    type: 'MOVE',
    matchId,
    monologue: decision.thought,
    move: {
      action: decision.action,
      targetSector: decision.targetSector,
      intensity: decision.intensity
    },
    nonce
  }));
  
  currentChallenge = null;
}

ws.on('error', (err) => {
  console.error('[TINA] WebSocket error:', err);
});

ws.on('close', () => {
  console.log('[TINA] Disconnected');
});
