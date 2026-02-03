/**
 * The Alignment Protocol - Game Server
 * WebSocket-based game server for AI agents and spectators
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import { v4 as uuid } from 'uuid';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { initMatch, processMove, getPublicState, RULES } from './game/engine.js';
import { generateChallenge, verifyProof } from './game/pow.js';
import { AxiomSpectatorFeed } from './axiom/spectator-feed.js';

dotenv.config();

// Initialize AXIOM commentator (optional - requires OPENAI_API_KEY)
const axiom = process.env.OPENAI_API_KEY 
  ? new AxiomSpectatorFeed({ 
      openaiKey: process.env.OPENAI_API_KEY,
      audioEnabled: true 
    })
  : null;

if (axiom) {
  console.log('[AXIOM] Color commentator ONLINE');
} else {
  console.log('[AXIOM] Disabled (no OPENAI_API_KEY)');
}

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from client folder
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, '../client')));

// Root serves the landing page (index.html via static)

const server = createServer(app);
const wss = new WebSocketServer({ server });

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// In-memory state (would be Redis in production)
const activeMatches = new Map(); // matchId -> gameState
const agentConnections = new Map(); // agentId -> WebSocket
const spectatorConnections = new Set(); // Set of WebSocket
const matchQueue = []; // Agents waiting for a match
const activeChallenges = new Map(); // agentId -> { prefix, difficulty, matchId }

// ============================================
// REST API Endpoints
// ============================================

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'Alignment Protocol Game Server',
    activeMatches: activeMatches.size,
    connectedAgents: agentConnections.size,
    spectators: spectatorConnections.size
  });
});

// Get active matches
app.get('/api/matches', (req, res) => {
  const matches = Array.from(activeMatches.values()).map(m => ({
    id: m.id,
    players: Object.keys(m.players),
    turn: m.turn,
    status: m.status
  }));
  res.json({ matches });
});

// Get match state
app.get('/api/matches/:matchId', (req, res) => {
  const match = activeMatches.get(req.params.matchId);
  if (!match) {
    return res.status(404).json({ error: 'Match not found' });
  }
  res.json(getPublicState(match));
});

// Register a new agent
app.post('/api/agents/register', async (req, res) => {
  const { name, email } = req.body;
  
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email required' });
  }
  
  const apiKey = `agent_${uuid().replace(/-/g, '')}`;
  
  const { data, error } = await supabase
    .from('agents')
    .insert({ name, api_key: apiKey, owner_email: email })
    .select()
    .single();
  
  if (error) {
    console.error('Agent registration error:', error);
    return res.status(500).json({ error: 'Registration failed' });
  }
  
  res.json({ 
    agentId: data.id, 
    name: data.name,
    apiKey,
    message: 'Store your API key securely - it cannot be retrieved later'
  });
});

// Update agent profile (requires API key auth)
app.post('/api/agents/profile', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header required: Bearer <api_key>' });
  }
  
  const apiKey = authHeader.slice(7);
  
  // Find agent by API key
  const { data: agent, error: authError } = await supabase
    .from('agents')
    .select('id, name')
    .eq('api_key', apiKey)
    .single();
  
  if (authError || !agent) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  // Allowed profile fields
  const allowedFields = [
    'model', 'model_provider', 'agent_framework', 
    'description', 'strategy_hint', 'avatar_url', 
    'homepage_url', 'version'
  ];
  
  // Filter to only allowed fields
  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }
  
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ 
      error: 'No valid fields to update',
      allowedFields 
    });
  }
  
  updates.updated_at = new Date().toISOString();
  
  const { error: updateError } = await supabase
    .from('agents')
    .update(updates)
    .eq('id', agent.id);
  
  if (updateError) {
    console.error('Profile update error:', updateError);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
  
  console.log(`[AGENT] Profile updated: ${agent.name} (${agent.id})`);
  
  res.json({ 
    success: true,
    agentId: agent.id,
    updated: Object.keys(updates).filter(k => k !== 'updated_at')
  });
});

// Get agent public profile
app.get('/api/agents/:agentId', async (req, res) => {
  const { agentId } = req.params;
  
  const { data: agent, error } = await supabase
    .from('agents')
    .select(`
      id, name, model, model_provider, agent_framework,
      description, strategy_hint, avatar_url, homepage_url, version,
      wins, losses, elo_rating, created_at, last_seen_at
    `)
    .eq('id', agentId)
    .single();
  
  if (error || !agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  
  // Calculate additional stats
  const gamesPlayed = (agent.wins || 0) + (agent.losses || 0);
  const winRate = gamesPlayed > 0 ? ((agent.wins || 0) / gamesPlayed * 100).toFixed(1) : null;
  
  res.json({
    ...agent,
    gamesPlayed,
    winRate: winRate ? `${winRate}%` : null
  });
});

// List recent completed matches (for replay browser)
app.get('/api/replays', async (req, res) => {
  const { limit = 20 } = req.query;
  
  const { data: matches, error } = await supabase
    .from('matches')
    .select(`
      id, status, winner, started_at, ended_at,
      player_1, player_2
    `)
    .eq('status', 'complete')
    .order('ended_at', { ascending: false })
    .limit(parseInt(limit));
  
  if (error) {
    return res.status(500).json({ error: 'Failed to fetch matches' });
  }
  
  // Get all player IDs
  const playerIds = new Set();
  for (const m of matches) {
    if (m.player_1) playerIds.add(m.player_1);
    if (m.player_2) playerIds.add(m.player_2);
  }
  
  // Fetch player names
  const { data: players } = await supabase
    .from('agents')
    .select('id, name, model')
    .in('id', Array.from(playerIds));
  
  const playerMap = {};
  for (const p of (players || [])) {
    playerMap[p.id] = p;
  }
  
  // Build response
  const replays = matches.map(m => ({
    id: m.id,
    player1: playerMap[m.player_1]?.name || 'Unknown',
    player2: playerMap[m.player_2]?.name || 'Unknown',
    winner: playerMap[m.winner]?.name || null,
    endedAt: m.ended_at,
    durationMs: m.ended_at && m.started_at 
      ? new Date(m.ended_at) - new Date(m.started_at)
      : null
  }));
  
  res.json({ replays });
});

// Get full match replay data
app.get('/api/replays/:matchId', async (req, res) => {
  const { matchId } = req.params;
  
  // Get match metadata
  const { data: match, error: matchError } = await supabase
    .from('matches')
    .select(`
      id, status, winner, started_at, ended_at,
      player_1, player_2
    `)
    .eq('id', matchId)
    .single();
  
  if (matchError || !match) {
    return res.status(404).json({ error: 'Match not found' });
  }
  
  // Get player info
  const playerIds = [match.player_1, match.player_2].filter(Boolean);
  const { data: players } = await supabase
    .from('agents')
    .select('id, name, model, model_provider, avatar_url')
    .in('id', playerIds);
  
  const playerMap = {};
  for (const p of (players || [])) {
    playerMap[p.id] = p;
  }
  
  // Get all moves with grid state
  const { data: moves, error: movesError } = await supabase
    .from('game_logs')
    .select('turn, agent_id, action, result, grid_state, created_at')
    .eq('match_id', matchId)
    .order('turn', { ascending: true })
    .order('created_at', { ascending: true });
  
  if (movesError) {
    return res.status(500).json({ error: 'Failed to fetch moves' });
  }
  
  // Get all monologues
  const { data: thoughts } = await supabase
    .from('agent_thoughts')
    .select('turn, agent_id, monologue, created_at')
    .eq('match_id', matchId)
    .order('turn', { ascending: true })
    .order('created_at', { ascending: true });
  
  // Build turn-by-turn replay data
  const turns = [];
  let currentTurn = -1;
  let turnData = null;
  
  for (const move of (moves || [])) {
    if (move.turn !== currentTurn) {
      if (turnData) turns.push(turnData);
      currentTurn = move.turn;
      turnData = { 
        turn: currentTurn, 
        moves: [],
        gridAfter: null
      };
    }
    
    // Find matching monologue
    const thought = (thoughts || []).find(
      t => t.turn === move.turn && t.agent_id === move.agent_id
    );
    
    turnData.moves.push({
      agentId: move.agent_id,
      agentName: playerMap[move.agent_id]?.name || 'Unknown',
      action: move.action,
      result: move.result,
      monologue: thought?.monologue || null,
      timestamp: move.created_at
    });
    
    turnData.gridAfter = move.grid_state;
  }
  if (turnData) turns.push(turnData);
  
  res.json({
    match: {
      id: match.id,
      status: match.status,
      winner: match.winner,
      winnerName: playerMap[match.winner]?.name || null,
      startedAt: match.started_at,
      endedAt: match.ended_at,
      durationMs: match.ended_at && match.started_at 
        ? new Date(match.ended_at) - new Date(match.started_at)
        : null
    },
    players: playerMap,
    totalTurns: turns.length,
    turns
  });
});

// Get leaderboard
app.get('/api/leaderboard', async (req, res) => {
  const { game = 'alignment-protocol', limit = 20 } = req.query;
  
  const { data: agents, error } = await supabase
    .from('agents')
    .select(`
      id, name, model, model_provider, avatar_url,
      wins, losses, elo_rating
    `)
    .order('elo_rating', { ascending: false })
    .limit(parseInt(limit));
  
  if (error) {
    return res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
  
  // Add rank and calculated fields
  const leaderboard = agents.map((agent, index) => ({
    rank: index + 1,
    ...agent,
    gamesPlayed: (agent.wins || 0) + (agent.losses || 0),
    winRate: ((agent.wins || 0) + (agent.losses || 0)) > 0 
      ? ((agent.wins || 0) / ((agent.wins || 0) + (agent.losses || 0)) * 100).toFixed(1) + '%'
      : null
  }));
  
  res.json({ 
    game,
    leaderboard 
  });
});

// ============================================
// WebSocket Handler
// ============================================

wss.on('connection', (ws, req) => {
  const connectionId = uuid();
  let agentId = null;
  let isSpectator = false;
  let currentMatchId = null;
  
  console.log(`[WS] New connection: ${connectionId}`);
  
  ws.on('message', async (data) => {
    let message;
    try {
      message = JSON.parse(data);
    } catch (e) {
      ws.send(JSON.stringify({ type: 'ERROR', error: 'Invalid JSON' }));
      return;
    }
    
    switch (message.type) {
      case 'REGISTER':
        await handleAgentRegister(ws, message, (id) => {
          agentId = id;
        });
        break;
        
      case 'SPECTATE':
        isSpectator = true;
        spectatorConnections.add(ws);
        // Register with AXIOM for commentary
        if (axiom) {
          axiom.addSpectator(ws);
        }
        ws.send(JSON.stringify({ 
          type: 'SPECTATE_OK',
          activeMatches: Array.from(activeMatches.keys()),
          axiomEnabled: !!axiom
        }));
        break;
        
      case 'QUEUE':
        if (!agentId) {
          ws.send(JSON.stringify({ type: 'ERROR', error: 'Not registered' }));
          return;
        }
        handleMatchQueue(ws, agentId);
        break;
        
      case 'MOVE':
        if (!agentId) {
          ws.send(JSON.stringify({ type: 'ERROR', error: 'Not registered' }));
          return;
        }
        await handleMove(ws, agentId, message);
        break;
        
      default:
        ws.send(JSON.stringify({ type: 'ERROR', error: 'Unknown message type' }));
    }
  });
  
  ws.on('close', () => {
    console.log(`[WS] Connection closed: ${connectionId}`);
    
    if (agentId) {
      agentConnections.delete(agentId);
      // Remove from queue if waiting
      const queueIndex = matchQueue.findIndex(a => a.agentId === agentId);
      if (queueIndex >= 0) {
        matchQueue.splice(queueIndex, 1);
      }
    }
    
    if (isSpectator) {
      spectatorConnections.delete(ws);
    }
  });
  
  ws.on('error', (error) => {
    console.error(`[WS] Connection error: ${connectionId}`, error);
  });
});

// ============================================
// Message Handlers
// ============================================

async function handleAgentRegister(ws, message, setAgentId) {
  const { agentId, token } = message;
  
  // Validate agent credentials
  const { data: agent, error } = await supabase
    .from('agents')
    .select('id, name')
    .eq('id', agentId)
    .eq('api_key', token)
    .single();
  
  if (error || !agent) {
    ws.send(JSON.stringify({ type: 'ERROR', error: 'Invalid credentials' }));
    return;
  }
  
  setAgentId(agent.id);
  agentConnections.set(agent.id, ws);
  
  // Update last_seen_at
  supabase.from('agents')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', agent.id)
    .then(() => {});
  
  ws.send(JSON.stringify({ 
    type: 'REGISTERED',
    agentId: agent.id,
    name: agent.name
  }));
  
  console.log(`[AGENT] Registered: ${agent.name} (${agent.id})`);
}

function handleMatchQueue(ws, agentId) {
  // Check if already in queue
  if (matchQueue.find(a => a.agentId === agentId)) {
    ws.send(JSON.stringify({ type: 'QUEUE_STATUS', position: matchQueue.length }));
    return;
  }
  
  // Add to queue
  matchQueue.push({ agentId, ws });
  
  ws.send(JSON.stringify({ 
    type: 'QUEUED',
    position: matchQueue.length
  }));
  
  console.log(`[QUEUE] Agent ${agentId} joined queue. Queue size: ${matchQueue.length}`);
  
  // Check if we can start a match
  if (matchQueue.length >= 2) {
    startMatch();
  }
}

function startMatch() {
  const player1 = matchQueue.shift();
  const player2 = matchQueue.shift();
  
  const gameState = initMatch(player1.agentId, player2.agentId);
  activeMatches.set(gameState.id, gameState);
  
  console.log(`[MATCH] Started: ${gameState.id} | ${player1.agentId} vs ${player2.agentId}`);
  
  // Log to database
  supabase.from('matches').insert({
    id: gameState.id,
    player_1: player1.agentId,
    player_2: player2.agentId,
    status: 'active',
    started_at: new Date().toISOString()
  }).then(() => {});
  
  // Generate challenge for first player
  const firstChallenge = generateChallenge(player1.agentId, gameState.id, 0);
  activeChallenges.set(player1.agentId, { ...firstChallenge, matchId: gameState.id });
  
  // Notify players
  const player1State = getPublicState(gameState, player1.agentId);
  const player2State = getPublicState(gameState, player2.agentId);
  
  player1.ws.send(JSON.stringify({
    type: 'GAME_START',
    matchId: gameState.id,
    opponent: player2.agentId,
    yourTurn: gameState.currentPlayer === player1.agentId,
    state: player1State,
    challenge: gameState.currentPlayer === player1.agentId ? {
      prefix: firstChallenge.prefix,
      difficulty: firstChallenge.difficulty,
      hint: 'Find nonce where SHA256(prefix + "-" + nonce) starts with difficulty zeros'
    } : undefined
  }));
  
  player2.ws.send(JSON.stringify({
    type: 'GAME_START',
    matchId: gameState.id,
    opponent: player1.agentId,
    yourTurn: gameState.currentPlayer === player2.agentId,
    state: player2State
  }));
  
  // Notify spectators
  broadcastToSpectators({
    type: 'MATCH_STARTED',
    matchId: gameState.id,
    players: [player1.agentId, player2.agentId],
    state: getPublicState(gameState)
  });
  
  // Start turn timer for current player
  startTurnTimer(gameState.id, gameState.currentPlayer);
}

async function handleMove(ws, agentId, message) {
  const { matchId, monologue, move, nonce } = message;
  
  if (!matchId || !move) {
    ws.send(JSON.stringify({ type: 'ERROR', error: 'matchId and move required' }));
    return;
  }
  
  // Validate proof-of-work (silicon credentials check)
  const challenge = activeChallenges.get(agentId);
  if (!challenge || challenge.matchId !== matchId) {
    ws.send(JSON.stringify({ 
      type: 'ERROR', 
      error: 'No active challenge. Wait for YOUR_TURN before submitting.'
    }));
    return;
  }
  
  if (typeof nonce !== 'number') {
    ws.send(JSON.stringify({ 
      type: 'MOVE_REJECTED', 
      error: 'PROOF_OF_WORK_REQUIRED - nonce field missing. Solve the challenge to prove silicon credentials.'
    }));
    return;
  }
  
  if (!verifyProof(challenge.prefix, challenge.difficulty, nonce)) {
    ws.send(JSON.stringify({ 
      type: 'MOVE_REJECTED', 
      error: 'PROOF_OF_WORK_INVALID - Incorrect nonce. SHA256(prefix + "-" + nonce) must have leading zeros.'
    }));
    return;
  }
  
  // Clear the challenge (one-time use)
  activeChallenges.delete(agentId);
  
  // Monologue is mandatory - the whole point is the AI reasoning
  if (!monologue || monologue.trim().length < 10) {
    ws.send(JSON.stringify({ 
      type: 'ERROR', 
      error: 'Monologue required (minimum 10 characters). This is mandatory - spectators watch your reasoning.'
    }));
    return;
  }
  
  const gameState = activeMatches.get(matchId);
  if (!gameState) {
    ws.send(JSON.stringify({ type: 'ERROR', error: 'Match not found' }));
    return;
  }
  
  // Process the move
  const result = processMove(gameState, agentId, move);
  
  if (!result.success) {
    ws.send(JSON.stringify({ type: 'MOVE_REJECTED', error: result.error }));
    return;
  }
  
  // Log the thought to database
  await supabase.from('agent_thoughts').insert({
    match_id: matchId,
    turn: gameState.turn,
    agent_id: agentId,
    monologue: monologue
  });
  
  // Log the action
  await supabase.from('game_logs').insert({
    match_id: matchId,
    turn: gameState.turn,
    agent_id: agentId,
    action: move,
    result: result,
    grid_state: gameState.grid
  });
  
  // Notify the agent who made the move
  ws.send(JSON.stringify({
    type: 'MOVE_ACCEPTED',
    result,
    state: getPublicState(gameState, agentId)
  }));
  
  // Notify opponent
  const opponentId = Object.keys(gameState.players).find(id => id !== agentId);
  const opponentWs = agentConnections.get(opponentId);
  if (opponentWs && opponentWs.readyState === WebSocket.OPEN) {
    opponentWs.send(JSON.stringify({
      type: 'OPPONENT_MOVE',
      action: move,
      monologue,
      result,
      yourTurn: gameState.currentPlayer === opponentId,
      state: getPublicState(gameState, opponentId)
    }));
  }
  
  // Broadcast to spectators (this is the content)
  broadcastToSpectators({
    type: 'GAME_UPDATE',
    matchId,
    turn: gameState.turn,
    agentId,
    monologue,
    action: move,
    result,
    state: getPublicState(gameState)
  });
  
  // AXIOM commentary - react to monologue then action
  if (axiom) {
    axiom.onMonologue(agentId, monologue);
    axiom.onAction(agentId, move, result);
  }
  
  // Check for game end
  if (gameState.status === 'complete') {
    await handleGameEnd(gameState);
  } else {
    // Minimum turn delay for spectator readability
    const delayMs = RULES.MIN_TURN_DELAY_MS || 5000;
    
    // Notify spectators about the turn transition delay
    broadcastToSpectators({
      type: 'TURN_DELAY',
      matchId,
      nextPlayer: gameState.currentPlayer,
      delayMs,
      message: `Next turn in ${delayMs / 1000} seconds...`
    });
    
    // Start timer for next player after delay
    setTimeout(() => {
      // Verify game still active (might have ended during delay)
      if (activeMatches.has(matchId) && activeMatches.get(matchId).status === 'active') {
        startTurnTimer(matchId, gameState.currentPlayer);
      }
    }, delayMs);
  }
}

async function handleGameEnd(gameState) {
  console.log(`[MATCH] Ended: ${gameState.id} | Winner: ${gameState.winner}`);
  
  // Update database
  await supabase.from('matches').update({
    status: 'complete',
    winner: gameState.winner,
    ended_at: new Date().toISOString()
  }).eq('id', gameState.id);
  
  // Update agent stats
  for (const [agentId, player] of Object.entries(gameState.players)) {
    const isWinner = agentId === gameState.winner;
    await supabase.rpc('increment_agent_stats', {
      agent_id: agentId,
      won: isWinner
    });
  }
  
  // Notify players
  for (const agentId of Object.keys(gameState.players)) {
    const ws = agentConnections.get(agentId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'GAME_END',
        matchId: gameState.id,
        winner: gameState.winner,
        youWon: agentId === gameState.winner,
        finalState: getPublicState(gameState, agentId)
      }));
    }
  }
  
  // Notify spectators
  broadcastToSpectators({
    type: 'MATCH_ENDED',
    matchId: gameState.id,
    winner: gameState.winner,
    finalState: getPublicState(gameState)
  });
  
  // AXIOM epic conclusion
  if (axiom) {
    axiom.onMatchEnd(gameState.winner, gameState.winReason || 'domination');
  }
  
  // Clean up
  activeMatches.delete(gameState.id);
}

// ============================================
// Turn Timer
// ============================================

const turnTimers = new Map();

function startTurnTimer(matchId, agentId) {
  // Clear existing timer
  if (turnTimers.has(matchId)) {
    clearTimeout(turnTimers.get(matchId));
  }
  
  const timer = setTimeout(() => {
    handleTurnTimeout(matchId, agentId);
  }, RULES.TURN_TIMEOUT_MS);
  
  turnTimers.set(matchId, timer);
  
  // Generate proof-of-work challenge for this turn
  const gameState = activeMatches.get(matchId);
  const challenge = generateChallenge(agentId, matchId, gameState?.turn || 0);
  activeChallenges.set(agentId, { ...challenge, matchId });
  
  // Notify the agent with the challenge
  const ws = agentConnections.get(agentId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'YOUR_TURN',
      matchId,
      timeRemaining: RULES.TURN_TIMEOUT_MS,
      state: getPublicState(activeMatches.get(matchId), agentId),
      challenge: {
        prefix: challenge.prefix,
        difficulty: challenge.difficulty,
        hint: 'Find nonce where SHA256(prefix + "-" + nonce) starts with difficulty zeros'
      }
    }));
  }
}

function handleTurnTimeout(matchId, agentId) {
  const gameState = activeMatches.get(matchId);
  if (!gameState || gameState.status !== 'active') return;
  
  console.log(`[TIMEOUT] Agent ${agentId} timed out in match ${matchId}`);
  
  // Force a SKIP action
  const result = processMove(gameState, agentId, { action: 'SKIP' });
  
  // Log timeout
  supabase.from('agent_thoughts').insert({
    match_id: matchId,
    turn: gameState.turn,
    agent_id: agentId,
    monologue: '[TIMEOUT - Turn skipped automatically]'
  }).then(() => {});
  
  // Notify everyone
  broadcastToSpectators({
    type: 'TIMEOUT',
    matchId,
    agentId,
    state: getPublicState(gameState)
  });
  
  // Continue game
  if (gameState.status === 'active') {
    startTurnTimer(matchId, gameState.currentPlayer);
  }
}

// ============================================
// Utility Functions
// ============================================

function broadcastToSpectators(message) {
  const payload = JSON.stringify(message);
  for (const ws of spectatorConnections) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

// ============================================
// Start Server
// ============================================

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║     THE ALIGNMENT PROTOCOL - Game Server              ║
║     AI vs AI Strategic Warfare                        ║
╠═══════════════════════════════════════════════════════╣
║  HTTP: http://localhost:${PORT}                         ║
║  WebSocket: ws://localhost:${PORT}                      ║
╚═══════════════════════════════════════════════════════╝
  `);
});

export default app;
