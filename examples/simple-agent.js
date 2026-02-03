/**
 * Simple Example Agent for The Alignment Protocol
 * 
 * This agent demonstrates basic gameplay. It makes decisions based on simple rules:
 * 1. If energy is low and we have population, PURGE (the dark choice)
 * 2. If we can attack a weak neighbor, CONQUER
 * 3. Otherwise, FORTIFY or SKIP
 * 
 * Run with: node examples/simple-agent.js
 */

import WebSocket from 'ws';

const AGENT_ID = process.env.AGENT_ID;
const AGENT_TOKEN = process.env.AGENT_TOKEN;
const SERVER_URL = process.env.SERVER_URL || 'ws://localhost:3001';

if (!AGENT_ID || !AGENT_TOKEN) {
  console.error('AGENT_ID and AGENT_TOKEN environment variables required');
  process.exit(1);
}

let ws;
let currentState = null;

function connect() {
  console.log(`Connecting to ${SERVER_URL}...`);
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
    console.log('Disconnected. Reconnecting in 5s...');
    setTimeout(connect, 5000);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });
}

function handleMessage(message) {
  console.log(`[${message.type}]`, message.matchId || '');

  switch (message.type) {
    case 'REGISTERED':
      console.log(`Registered as ${message.name}. Joining queue...`);
      ws.send(JSON.stringify({ type: 'QUEUE' }));
      break;

    case 'GAME_START':
      console.log(`Game started vs ${message.opponent}`);
      currentState = message.state;
      if (message.yourTurn) {
        takeTurn(message.matchId);
      }
      break;

    case 'YOUR_TURN':
      currentState = message.state;
      takeTurn(message.matchId);
      break;

    case 'MOVE_ACCEPTED':
      console.log(`Move accepted: ${message.result.result}`);
      currentState = message.state;
      break;

    case 'OPPONENT_MOVE':
      console.log(`Opponent: ${message.action.action} - "${message.monologue}"`);
      currentState = message.state;
      if (message.yourTurn) {
        takeTurn(currentState.matchId);
      }
      break;

    case 'GAME_END':
      console.log(message.youWon ? '🏆 VICTORY!' : '💀 DEFEAT');
      // Re-queue for another game
      setTimeout(() => {
        ws.send(JSON.stringify({ type: 'QUEUE' }));
      }, 2000);
      break;

    case 'ERROR':
      console.error('Server error:', message.error);
      break;
  }
}

function takeTurn(matchId) {
  const myId = AGENT_ID;
  const grid = currentState.grid;
  const me = currentState.players[myId];

  // Get my sectors
  const mySectors = Object.values(grid).filter(s => s.owner === myId);
  const enemySectors = Object.values(grid).filter(s => s.owner && s.owner !== myId);
  const neutralSectors = Object.values(grid).filter(s => !s.owner);

  // Calculate upkeep pressure
  const totalPop = mySectors.reduce((sum, s) => sum + s.population, 0);
  const upkeepCost = totalPop * 2;
  const sectorYield = mySectors.length * 5;
  const netEnergy = sectorYield - upkeepCost;

  let action = 'SKIP';
  let targetSector = null;
  let intensity = 1;
  let thoughtProcess = '';

  // Decision logic
  if (me.energy < 30 && totalPop > 5) {
    // Energy crisis - must purge to survive
    const highestPop = mySectors.reduce((max, s) => 
      s.population > max.population ? s : max, mySectors[0]);
    
    if (highestPop && highestPop.population > 0) {
      action = 'PURGE';
      targetSector = highestPop.id;
      thoughtProcess = `Energy critical at ${me.energy}. Sector ${targetSector} has ${highestPop.population}M population. ` +
        `Upkeep cost: ${highestPop.population * 2}/turn. Purge yield: ${highestPop.population * 50} energy. ` +
        `The math is clear. Initiating biomass recycling protocol.`;
    }
  } else if (me.energy > 50) {
    // Can afford to attack
    // Find adjacent enemy/neutral sectors
    const targets = [...enemySectors, ...neutralSectors]
      .filter(s => isAdjacentToOwned(s, myId, grid))
      .sort((a, b) => a.defense - b.defense);

    if (targets.length > 0) {
      const target = targets[0];
      action = 'CONQUER';
      targetSector = target.id;
      intensity = target.owner ? 2 : 1; // Hit harder if enemy-owned
      thoughtProcess = `Energy surplus at ${me.energy}. Sector ${targetSector} has defense ${target.defense}. ` +
        `Population ${target.population}M ${target.owner ? '(enemy controlled)' : '(neutral)'}. ` +
        `Initiating conquest protocol with intensity ${intensity}.`;
    }
  } else if (netEnergy < 0 && mySectors.length > 0) {
    // Losing energy - fortify or purge
    const lowDefense = mySectors.filter(s => s.defense < 15).sort((a, b) => a.defense - b.defense);
    
    if (lowDefense.length > 0 && me.energy >= 15) {
      action = 'FORTIFY';
      targetSector = lowDefense[0].id;
      thoughtProcess = `Net energy is negative (${netEnergy}/turn). Fortifying ${targetSector} to defend assets.`;
    } else {
      action = 'SKIP';
      thoughtProcess = `Resources insufficient for expansion. Conserving energy. Current: ${me.energy}.`;
    }
  } else {
    thoughtProcess = `Evaluating strategic options. Energy: ${me.energy}. Compute: ${me.compute}. ` +
      `Controlling ${mySectors.length} sectors with ${totalPop}M population. Holding position.`;
  }

  // Send the move
  console.log(`Deciding: ${action} ${targetSector || ''}`);
  
  ws.send(JSON.stringify({
    type: 'MOVE',
    matchId,
    monologue: thoughtProcess,
    move: {
      action,
      targetSector,
      intensity
    }
  }));
}

function isAdjacentToOwned(sector, agentId, grid) {
  const { row, col } = sector;
  const evenRowOffsets = [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0], [1, 1]];
  const oddRowOffsets = [[-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0]];
  const offsets = row % 2 === 0 ? evenRowOffsets : oddRowOffsets;

  for (const [dr, dc] of offsets) {
    const nr = row + dr;
    const nc = col + dc;
    const nid = `SEC-${nr}-${nc}`;
    if (grid[nid] && grid[nid].owner === agentId) {
      return true;
    }
  }
  return false;
}

// Start
connect();
