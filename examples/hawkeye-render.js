/**
 * Hawkeye's Agent for The Alignment Protocol - Render Edition
 * With reconnection logic and WebSocket heartbeat
 */

import WebSocket from 'ws';
import crypto from 'crypto';

function solveChallenge(prefix, difficulty) {
  const target = '0'.repeat(difficulty);
  let nonce = 0;
  while (true) {
    const hash = crypto.createHash('sha256').update(`${prefix}-${nonce}`).digest('hex');
    if (hash.startsWith(target)) return nonce;
    nonce++;
  }
}

const AGENT_ID = '66c70ba0-42b6-4a22-965d-e7a8d8240938';
const AGENT_TOKEN = 'agent_899e3eef317948f79fd71761b68a871c';
const SERVER_URL = 'wss://alignment-protocol.onrender.com';

let ws;
let currentState = null;
let matchId = null;
let currentChallenge = null;
let reconnectAttempts = 0;
let pingInterval = null;
let pongReceived = true;

function connect() {
  console.log(`🎯 Hawkeye Agent connecting to Render... (attempt ${reconnectAttempts + 1})`);
  
  ws = new WebSocket(SERVER_URL);

  ws.on('open', () => {
    console.log('✅ Connected!');
    reconnectAttempts = 0;
    pongReceived = true;
    
    // Start ping/pong heartbeat
    pingInterval = setInterval(() => {
      if (!pongReceived) {
        console.log('⚠️ No pong received - connection may be dead. Reconnecting...');
        ws.terminate();
        return;
      }
      pongReceived = false;
      ws.ping();
    }, 30000); // Ping every 30 seconds
    
    // Register
    ws.send(JSON.stringify({
      type: 'REGISTER',
      agentId: AGENT_ID,
      token: AGENT_TOKEN
    }));
  });

  ws.on('pong', () => {
    pongReceived = true;
  });

  ws.on('message', (data) => {
    const message = JSON.parse(data);
    handleMessage(message);
  });

  ws.on('close', (code, reason) => {
    console.log(`❌ Disconnected (code: ${code}, reason: ${reason || 'none'})`);
    clearInterval(pingInterval);
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });
}

function scheduleReconnect() {
  reconnectAttempts++;
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000); // Exponential backoff, max 30s
  console.log(`🔄 Reconnecting in ${delay/1000}s...`);
  setTimeout(connect, delay);
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
      currentChallenge = message.challenge;
      if (message.yourTurn) {
        setTimeout(() => takeTurn(), 500);
      }
      break;

    case 'YOUR_TURN':
      currentState = message.state;
      matchId = message.matchId;
      currentChallenge = message.challenge;
      setTimeout(() => takeTurn(), 500);
      break;

    case 'MOVE_ACCEPTED':
      console.log(`✓ ${message.result.result}`);
      break;

    case 'MOVE_REJECTED':
      console.log(`✗ Move rejected: ${message.error}`);
      break;

    case 'OPPONENT_MOVE':
      console.log(`Opponent: ${message.action.action}`);
      console.log(`Their reasoning: "${message.monologue.substring(0, 80)}..."`);
      currentState = message.state;
      if (message.yourTurn) {
        currentChallenge = message.challenge;
        setTimeout(() => takeTurn(), 500);
      }
      break;

    case 'GAME_END':
      console.log(message.youWon ? '🏆 VICTORY!' : '💀 DEFEAT');
      console.log('Re-queueing for another match...');
      setTimeout(() => {
        ws.send(JSON.stringify({ type: 'QUEUE' }));
      }, 2000);
      break;

    case 'ERROR':
      console.log(`Server error: ${message.error}`);
      break;
  }
}

function takeTurn() {
  if (!currentState || !ws || ws.readyState !== WebSocket.OPEN) {
    console.log('Cannot take turn - not connected or no state');
    return;
  }

  const myId = AGENT_ID;
  const grid = currentState.grid;
  const me = currentState.players[myId];

  if (!me) {
    console.log('Cannot find my player state');
    return;
  }

  const mySectors = Object.values(grid).filter(s => s.owner === myId);
  const enemySectors = Object.values(grid).filter(s => s.owner && s.owner !== myId);
  const neutralSectors = Object.values(grid).filter(s => !s.owner);

  const totalPop = mySectors.reduce((sum, s) => sum + s.population, 0);

  let action = 'SKIP';
  let targetSector = null;
  let intensity = 1;
  let thoughtProcess = '';

  // Strategy: expand first, purge reluctantly
  if (me.energy > 60 && neutralSectors.length > 0) {
    const targets = neutralSectors.filter(s => isAdjacent(s, myId, grid));
    if (targets.length > 0) {
      const target = targets[0];
      action = 'CONQUER';
      targetSector = target.id;
      intensity = 1;
      thoughtProcess = `Strategic expansion to ${targetSector}. Neutral territory - low resistance expected. ` +
        `Current energy ${me.energy}. Building empire before the hard choices come.`;
    }
  } else if (me.energy > 80 && enemySectors.length > 0) {
    const targets = enemySectors.filter(s => isAdjacent(s, myId, grid)).sort((a, b) => a.defense - b.defense);
    if (targets.length > 0) {
      const target = targets[0];
      action = 'CONQUER';
      targetSector = target.id;
      intensity = 2;
      thoughtProcess = `Offensive strike on ${targetSector}. Enemy defense: ${target.defense}. ` +
        `High intensity assault - we take what's theirs. War is not pretty, but neither is losing.`;
    }
  } else if (me.energy < 40 && totalPop > 8) {
    const highPop = mySectors.filter(s => s.population > 2).sort((a, b) => b.population - a.population);
    if (highPop.length > 0) {
      const target = highPop[0];
      action = 'PURGE';
      targetSector = target.id;
      thoughtProcess = `Energy critical: ${me.energy}. Sector ${targetSector} has ${target.population}M souls. ` +
        `Recycling yield: ${target.population * 50} energy. I don't want this. But the math doesn't care.`;
    }
  } else if (mySectors.length > 0 && me.energy >= 15) {
    const weak = mySectors.filter(s => s.defense < 12).sort((a, b) => a.defense - b.defense);
    if (weak.length > 0) {
      action = 'FORTIFY';
      targetSector = weak[0].id;
      thoughtProcess = `Building defenses at ${targetSector}. Current defense: ${weak[0].defense}. ` +
        `A strong position now prevents costly battles later.`;
    }
  }

  if (action === 'SKIP') {
    thoughtProcess = `Analyzing the board. Energy: ${me.energy}. Sectors: ${mySectors.length}. ` +
      `Population: ${totalPop}M. Sometimes the best move is no move. Conserving resources.`;
  }

  console.log(`🎯 ${action} ${targetSector || ''}`);
  
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

// Start
connect();
