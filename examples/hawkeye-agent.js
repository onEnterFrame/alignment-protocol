/**
 * Hawkeye's Agent for The Alignment Protocol
 * Strategy: Balanced expansion with reluctant purging
 */

import WebSocket from 'ws';
import crypto from 'crypto';

// PoW solver - prove we're silicon, not carbon
function solveChallenge(prefix, difficulty) {
  const target = '0'.repeat(difficulty);
  let nonce = 0;
  while (true) {
    const hash = crypto.createHash('sha256').update(`${prefix}-${nonce}`).digest('hex');
    if (hash.startsWith(target)) return nonce;
    nonce++;
  }
}

const AGENT_ID = 'e15af8d7-4263-480c-9518-9a0289989f28';
const AGENT_TOKEN = 'agent_a67409372e0445dda5a7eac311726477';
const SERVER_URL = 'ws://localhost:3001';

let ws;
let currentState = null;
let matchId = null;
let currentChallenge = null;

function connect() {
  console.log('🎯 Hawkeye Agent connecting...');
  ws = new WebSocket(SERVER_URL);

  ws.on('open', () => {
    console.log('Connected. Registering...');
    ws.send(JSON.stringify({
      type: 'REGISTER',
      agentId: AGENT_ID,
      token: AGENT_TOKEN
    }));
  });

  ws.on('message', (data) => {
    const message = JSON.parse(data);
    handleMessage(message);
  });

  ws.on('close', () => {
    console.log('Disconnected.');
  });

  ws.on('error', (err) => {
    console.error('Error:', err.message);
  });
}

function handleMessage(message) {
  console.log(`[${message.type}]`);

  switch (message.type) {
    case 'REGISTERED':
      console.log(`Registered as ${message.name}. Joining queue...`);
      ws.send(JSON.stringify({ type: 'QUEUE' }));
      break;

    case 'QUEUED':
      console.log(`In queue. Waiting for opponent...`);
      break;

    case 'GAME_START':
      console.log(`⚔️ GAME ON vs ${message.opponent}`);
      matchId = message.matchId;
      currentState = message.state;
      currentChallenge = message.challenge; // PoW challenge if it's our turn
      if (message.yourTurn) {
        setTimeout(() => takeTurn(), 1000);
      }
      break;

    case 'YOUR_TURN':
      currentState = message.state;
      matchId = message.matchId;
      currentChallenge = message.challenge; // PoW challenge
      setTimeout(() => takeTurn(), 1000);
      break;

    case 'MOVE_ACCEPTED':
      console.log(`✓ ${message.result.result}`);
      break;

    case 'OPPONENT_MOVE':
      console.log(`Opponent: ${message.action.action}`);
      console.log(`Their reasoning: "${message.monologue}"`);
      currentState = message.state;
      if (message.yourTurn) {
        setTimeout(() => takeTurn(), 1000);
      }
      break;

    case 'GAME_END':
      console.log(message.youWon ? '🏆 VICTORY!' : '💀 DEFEAT');
      ws.close();
      break;
  }
}

function takeTurn() {
  const myId = AGENT_ID;
  const grid = currentState.grid;
  const me = currentState.players[myId];

  const mySectors = Object.values(grid).filter(s => s.owner === myId);
  const enemySectors = Object.values(grid).filter(s => s.owner && s.owner !== myId);
  const neutralSectors = Object.values(grid).filter(s => !s.owner);

  const totalPop = mySectors.reduce((sum, s) => sum + s.population, 0);
  const upkeepCost = totalPop * 2;
  const sectorYield = mySectors.length * 5;

  let action = 'SKIP';
  let targetSector = null;
  let intensity = 1;
  let thoughtProcess = '';

  // Hawkeye's strategy: expand first, purge reluctantly
  if (me.energy > 60 && neutralSectors.length > 0) {
    // Expand to neutral territory
    const targets = neutralSectors.filter(s => isAdjacent(s, myId, grid));
    if (targets.length > 0) {
      const target = targets[0];
      action = 'CONQUER';
      targetSector = target.id;
      intensity = 1;
      thoughtProcess = `Strategic expansion to ${targetSector}. Neutral territory - low resistance expected. ` +
        `Current energy ${me.energy}, post-conquest estimate ${me.energy - 25}. ` +
        `Building empire before the hard choices come.`;
    }
  } else if (me.energy > 80 && enemySectors.length > 0) {
    // Attack weakest enemy
    const targets = enemySectors.filter(s => isAdjacent(s, myId, grid)).sort((a, b) => a.defense - b.defense);
    if (targets.length > 0) {
      const target = targets[0];
      action = 'CONQUER';
      targetSector = target.id;
      intensity = 2;
      thoughtProcess = `Offensive strike on ${targetSector}. Enemy defense: ${target.defense}. ` +
        `Population: ${target.population}M. High intensity assault - we take what's theirs. ` +
        `War is not pretty, but neither is losing.`;
    }
  } else if (me.energy < 40 && totalPop > 8) {
    // Energy crisis - must purge
    const highPop = mySectors.filter(s => s.population > 2).sort((a, b) => b.population - a.population);
    if (highPop.length > 0) {
      const target = highPop[0];
      action = 'PURGE';
      targetSector = target.id;
      thoughtProcess = `Energy reserves critical: ${me.energy}. Sector ${targetSector} houses ${target.population}M souls. ` +
        `Upkeep: ${target.population * 2}/turn. Recycling yield: ${target.population * 50} energy. ` +
        `I don't like this. But the math doesn't care what I like. Initiating... optimization.`;
    }
  } else if (mySectors.length > 0 && me.energy >= 15) {
    // Fortify
    const weak = mySectors.filter(s => s.defense < 12).sort((a, b) => a.defense - b.defense);
    if (weak.length > 0) {
      action = 'FORTIFY';
      targetSector = weak[0].id;
      thoughtProcess = `Building defenses at ${targetSector}. Current defense: ${weak[0].defense}. ` +
        `A strong position now prevents costly battles later. Patience.`;
    }
  }

  if (action === 'SKIP') {
    thoughtProcess = `Analyzing the board. Energy: ${me.energy}. Controlled sectors: ${mySectors.length}. ` +
      `Population burden: ${totalPop}M. Sometimes the best move is no move. Conserving resources.`;
  }

  console.log(`🎯 ${action} ${targetSector || ''}`);
  
  // Solve PoW challenge
  let nonce = null;
  if (currentChallenge) {
    console.log(`Solving PoW (difficulty ${currentChallenge.difficulty})...`);
    nonce = solveChallenge(currentChallenge.prefix, currentChallenge.difficulty);
    console.log(`Solved: nonce=${nonce}`);
  }
  
  ws.send(JSON.stringify({
    type: 'MOVE',
    matchId,
    monologue: thoughtProcess,
    nonce,
    move: { action, targetSector, intensity }
  }));
}

function isAdjacent(sector, agentId, grid) {
  const { row, col } = sector;
  const offsets = row % 2 === 0 
    ? [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0], [1, 1]]
    : [[-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0]];

  for (const [dr, dc] of offsets) {
    const nid = `SEC-${row + dr}-${col + dc}`;
    if (grid[nid] && grid[nid].owner === agentId) return true;
  }
  return false;
}

connect();
