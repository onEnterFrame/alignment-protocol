/**
 * Matchmaker Service v2 - Async/Stateless
 * Elo-based matchmaking that works without WebSocket connections
 */

import { initMatch, processMove, getPublicState, RULES } from './game/engine.js';
import { v4 as uuid } from 'uuid';

const MATCHMAKER_INTERVAL_MS = 5000; // Run every 5 seconds
const INITIAL_SEARCH_RANGE = 100;    // ±100 Elo initially
const RANGE_EXPANSION_RATE = 50;     // Expand by 50 every 10 seconds
const MAX_SEARCH_RANGE = 500;        // Cap at ±500
const TURN_TIMEOUT_CHECK_MS = 30000; // Check timeouts every 30s

export class Matchmaker {
  constructor(supabase, options = {}) {
    this.supabase = supabase;
    this.onMatchCreated = options.onMatchCreated || (() => {}); // For WebSocket notifications
    this.onTurnTimeout = options.onTurnTimeout || (() => {});
    this.running = false;
    this.matchmakerIntervalId = null;
    this.timeoutIntervalId = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    console.log('[MATCHMAKER] Started - async mode');
    
    // Matchmaking loop
    this.runMatchmaking();
    this.matchmakerIntervalId = setInterval(() => this.runMatchmaking(), MATCHMAKER_INTERVAL_MS);
    
    // Turn timeout loop
    this.checkTurnTimeouts();
    this.timeoutIntervalId = setInterval(() => this.checkTurnTimeouts(), TURN_TIMEOUT_CHECK_MS);
  }

  stop() {
    this.running = false;
    if (this.matchmakerIntervalId) {
      clearInterval(this.matchmakerIntervalId);
      this.matchmakerIntervalId = null;
    }
    if (this.timeoutIntervalId) {
      clearInterval(this.timeoutIntervalId);
      this.timeoutIntervalId = null;
    }
    console.log('[MATCHMAKER] Stopped');
  }

  /**
   * Add agent to matchmaking queue (async - no WebSocket needed)
   */
  async joinQueue(agentId) {
    // Get agent's current Elo
    const { data: agent, error: agentError } = await this.supabase
      .from('agents')
      .select('elo_rating, name')
      .eq('id', agentId)
      .single();

    if (agentError || !agent) {
      return { success: false, error: 'Agent not found' };
    }

    // Set looking_for_match flag
    const { error: updateError } = await this.supabase
      .from('agents')
      .update({ 
        looking_for_match: true,
        last_seen: new Date().toISOString()
      })
      .eq('id', agentId);

    if (updateError) {
      console.error('[MATCHMAKER] Failed to update agent:', updateError);
      return { success: false, error: 'Failed to join queue' };
    }

    // Also add to match_queue for backward compatibility
    await this.supabase
      .from('match_queue')
      .delete()
      .eq('agent_id', agentId);
    
    await this.supabase
      .from('match_queue')
      .insert({
        agent_id: agentId,
        elo_rating: agent.elo_rating || 1000,
        status: 'waiting',
        search_range: INITIAL_SEARCH_RANGE
      });

    console.log(`[MATCHMAKER] Agent ${agent.name} (${agentId.slice(0, 8)}) joined queue`);
    return { success: true, elo: agent.elo_rating || 1000 };
  }

  /**
   * Remove agent from matchmaking queue
   */
  async leaveQueue(agentId) {
    await this.supabase
      .from('agents')
      .update({ looking_for_match: false })
      .eq('id', agentId);

    await this.supabase
      .from('match_queue')
      .delete()
      .eq('agent_id', agentId);

    console.log(`[MATCHMAKER] Agent ${agentId.slice(0, 8)} left queue`);
    return { success: true };
  }

  /**
   * Legacy method - maintain backward compatibility
   */
  async addToQueue(agentId) {
    const result = await this.joinQueue(agentId);
    if (result.success) {
      return { agent_id: agentId, elo_rating: result.elo, search_range: INITIAL_SEARCH_RANGE };
    }
    return null;
  }

  async removeFromQueue(agentId) {
    return this.leaveQueue(agentId);
  }

  async getQueueStatus() {
    // Primary: check agents.looking_for_match
    const { data: agents, error } = await this.supabase
      .from('agents')
      .select('id, name, model, avatar_url, elo_rating, last_seen')
      .eq('looking_for_match', true)
      .order('last_seen', { ascending: false });

    if (error) {
      console.error('[MATCHMAKER] getQueueStatus error:', error);
      return [];
    }

    return agents?.map(a => ({
      agentId: a.id,
      name: a.name || 'Unknown',
      model: a.model || 'unknown',
      avatarUrl: a.avatar_url,
      elo: a.elo_rating || 1000,
      lastSeen: a.last_seen
    })) || [];
  }

  async runMatchmaking() {
    try {
      // Get all agents looking for match
      const { data: waiting, error } = await this.supabase
        .from('agents')
        .select('id, name, elo_rating, looking_for_match')
        .eq('looking_for_match', true);

      if (error || !waiting || waiting.length < 2) {
        return; // Not enough agents to match
      }

      console.log(`[MATCHMAKER] ${waiting.length} agents looking for match`);

      // Simple matching: pair first two agents (can be improved with Elo ranges)
      // For now, just match them if 2+ are waiting
      const agent1 = waiting[0];
      const agent2 = waiting[1];
      
      await this.createAsyncMatch(agent1, agent2);

    } catch (err) {
      console.error('[MATCHMAKER] Error:', err);
    }
  }

  /**
   * Create a match and store game state in database
   */
  async createAsyncMatch(agent1, agent2) {
    console.log(`[MATCHMAKER] Creating match: ${agent1.name} vs ${agent2.name}`);

    // Initialize game state
    const gameState = initMatch(agent1.id, agent2.id);
    
    // Randomly pick first player
    const firstPlayer = Math.random() < 0.5 ? agent1.id : agent2.id;
    gameState.currentPlayer = firstPlayer;
    
    // Get turn timeout (use minimum of both agents' preferences)
    const { data: agents } = await this.supabase
      .from('agents')
      .select('id, turn_timeout_seconds')
      .in('id', [agent1.id, agent2.id]);
    
    const timeoutSec = Math.min(
      agents?.find(a => a.id === agent1.id)?.turn_timeout_seconds || 300,
      agents?.find(a => a.id === agent2.id)?.turn_timeout_seconds || 300
    );

    const turnDeadline = new Date(Date.now() + timeoutSec * 1000);

    // Create match in database with full game state
    const { data: match, error: insertError } = await this.supabase
      .from('matches')
      .insert({
        id: gameState.id,
        player_1: agent1.id,
        player_2: agent2.id,
        status: 'active',
        started_at: new Date().toISOString(),
        game_state: gameState,
        current_turn_agent_id: firstPlayer,
        turn_deadline: turnDeadline.toISOString(),
        turn_number: 0
      })
      .select()
      .single();

    if (insertError) {
      console.error('[MATCHMAKER] Failed to create match:', insertError);
      return null;
    }

    // Clear looking_for_match on both agents
    await this.supabase
      .from('agents')
      .update({ looking_for_match: false })
      .in('id', [agent1.id, agent2.id]);

    // Remove from match_queue (legacy table)
    await this.supabase
      .from('match_queue')
      .delete()
      .in('agent_id', [agent1.id, agent2.id]);

    // Notify via webhooks
    await this.notifyMatchCreated(match, agent1, agent2);

    // Callback for WebSocket notifications (backward compat)
    this.onMatchCreated(match, agent1, agent2);

    console.log(`[MATCHMAKER] Match ${gameState.id} created. First turn: ${firstPlayer.slice(0, 8)}`);
    return match;
  }

  /**
   * Send webhook notifications to agents
   */
  async notifyMatchCreated(match, agent1, agent2) {
    const { data: agents } = await this.supabase
      .from('agents')
      .select('id, webhook_url, name')
      .in('id', [agent1.id, agent2.id]);

    for (const agent of agents || []) {
      if (agent.webhook_url) {
        try {
          const opponent = agents.find(a => a.id !== agent.id);
          await fetch(agent.webhook_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'MATCH_CREATED',
              matchId: match.id,
              opponent: { id: opponent.id, name: opponent.name },
              yourTurn: match.current_turn_agent_id === agent.id,
              turnDeadline: match.turn_deadline
            })
          });
          console.log(`[WEBHOOK] Notified ${agent.name}`);
        } catch (err) {
          console.error(`[WEBHOOK] Failed to notify ${agent.name}:`, err.message);
        }
      }
    }
  }

  /**
   * Check for turn timeouts and auto-skip
   */
  async checkTurnTimeouts() {
    try {
      const now = new Date().toISOString();
      
      // Find active matches past their deadline
      const { data: timedOut, error } = await this.supabase
        .from('matches')
        .select('id, game_state, current_turn_agent_id, player_1, player_2')
        .eq('status', 'active')
        .lt('turn_deadline', now);

      if (error || !timedOut?.length) return;

      for (const match of timedOut) {
        await this.handleTimeout(match);
      }
    } catch (err) {
      console.error('[TIMEOUT] Error checking timeouts:', err);
    }
  }

  /**
   * Handle a single turn timeout
   */
  async handleTimeout(match) {
    const agentId = match.current_turn_agent_id;
    const gameState = match.game_state;
    
    if (!gameState || gameState.status !== 'active') return;

    console.log(`[TIMEOUT] Agent ${agentId.slice(0, 8)} timed out in match ${match.id}`);

    // Force a SKIP action
    const result = processMove(gameState, agentId, { action: 'SKIP' });

    // Log the timeout
    await this.supabase.from('agent_thoughts').insert({
      match_id: match.id,
      turn: gameState.turn,
      agent_id: agentId,
      monologue: '[TIMEOUT - Turn skipped automatically]'
    });

    // Determine next player
    const playerIds = [match.player_1, match.player_2];
    const nextPlayer = playerIds.find(id => id !== agentId);

    // Set new turn deadline
    const { data: nextAgent } = await this.supabase
      .from('agents')
      .select('turn_timeout_seconds')
      .eq('id', nextPlayer)
      .single();

    const timeoutSec = nextAgent?.turn_timeout_seconds || 300;
    const newDeadline = new Date(Date.now() + timeoutSec * 1000);

    // Update match state
    const { error: updateError } = await this.supabase
      .from('matches')
      .update({
        game_state: gameState,
        current_turn_agent_id: gameState.status === 'complete' ? null : nextPlayer,
        turn_deadline: gameState.status === 'complete' ? null : newDeadline.toISOString(),
        turn_number: gameState.turn,
        status: gameState.status,
        winner: gameState.winner,
        ended_at: gameState.status === 'complete' ? new Date().toISOString() : null
      })
      .eq('id', match.id);

    if (updateError) {
      console.error('[TIMEOUT] Failed to update match:', updateError);
      return;
    }

    // Notify opponent via webhook
    if (gameState.status === 'active') {
      await this.notifyYourTurn(match.id, nextPlayer);
    }

    // Callback for WebSocket
    this.onTurnTimeout(match.id, agentId, gameState);
  }

  /**
   * Notify agent it's their turn
   */
  async notifyYourTurn(matchId, agentId) {
    const { data: agent } = await this.supabase
      .from('agents')
      .select('webhook_url, name')
      .eq('id', agentId)
      .single();

    if (agent?.webhook_url) {
      try {
        const { data: match } = await this.supabase
          .from('matches')
          .select('game_state, turn_deadline')
          .eq('id', matchId)
          .single();

        await fetch(agent.webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'YOUR_TURN',
            matchId,
            turnDeadline: match.turn_deadline,
            state: getPublicState(match.game_state, agentId)
          })
        });
        console.log(`[WEBHOOK] Turn notification sent to ${agent.name}`);
      } catch (err) {
        console.error(`[WEBHOOK] Failed to notify ${agent.name}:`, err.message);
      }
    }
  }
}

export default Matchmaker;
