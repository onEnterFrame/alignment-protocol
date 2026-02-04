/**
 * AXIOM Spectator Feed
 * 
 * Integrates AXIOM into the game server's WebSocket.
 * Listens to match events, generates commentary, broadcasts to spectators.
 */

import { AxiomCommentator } from './index.js';

export class AxiomSpectatorFeed {
  constructor(options = {}) {
    this.axiom = new AxiomCommentator(options);
    this.spectators = new Set();
    this.enabled = options.enabled !== false;
    this.audioEnabled = options.audioEnabled !== false;
    
    // Commentary pacing
    this.turnCount = 0;
    this.lastCommentTurn = -1;
    this.agentCommentCount = new Map(); // Track comments per agent for balance
    this.skipChance = 0.4; // 40% chance to skip routine events
  }

  /**
   * Add a spectator connection
   */
  addSpectator(ws) {
    this.spectators.add(ws);
    ws.on('close', () => this.spectators.delete(ws));
    
    this.sendToSpectator(ws, {
      type: 'AXIOM_WELCOME',
      message: "AXIOM online. Prepare for MAXIMUM DRAMA."
    });
  }

  /**
   * Remove a spectator connection
   */
  removeSpectator(ws) {
    this.spectators.delete(ws);
  }

  /**
   * Decide if we should skip this event
   */
  shouldSkip(event) {
    // Never skip these important events
    const alwaysComment = ['MATCH_START', 'MATCH_END', 'MATCH_ANNOUNCED', 'TIMEOUT'];
    if (alwaysComment.includes(event.type)) return false;
    
    // Never skip PURGE (dramatic!) or failed attacks
    if (event.type === 'ACTION') {
      if (event.action?.action === 'PURGE') return false;
      if (event.action?.action === 'MERCY') return false;
      // Comment on attacks (CONQUER against enemy territory)
      if (event.result?.wasAttack) return false;
    }
    
    // Skip if we just commented on the previous turn
    if (this.turnCount - this.lastCommentTurn < 2) {
      return Math.random() < 0.6; // 60% skip if recent comment
    }
    
    // Balance agent coverage - if one agent has way more comments, skip their routine moves
    if (event.agentId) {
      const myCount = this.agentCommentCount.get(event.agentId) || 0;
      const otherCount = [...this.agentCommentCount.values()].reduce((a, b) => a + b, 0) - myCount;
      if (myCount > otherCount + 2) {
        return Math.random() < 0.7; // 70% skip if this agent is over-represented
      }
    }
    
    // Random skip for variety
    return Math.random() < this.skipChance;
  }

  /**
   * Process a game event and broadcast commentary
   */
  async processEvent(event) {
    if (!this.enabled) return;
    
    // Check if we should skip this event
    if (this.shouldSkip(event)) {
      return;
    }

    try {
      const reaction = await this.axiom.react(event);
      if (!reaction) return;

      const payload = {
        type: 'AXIOM_COMMENTARY',
        text: reaction.text,
        eventType: reaction.event,
        timestamp: Date.now()
      };

      if (this.audioEnabled && reaction.audio) {
        payload.audio = reaction.audio.toString('base64');
        payload.audioFormat = 'mp3';
      }

      this.broadcast(payload);
      
      // Track for pacing
      this.lastCommentTurn = this.turnCount;
      if (event.agentId) {
        const count = this.agentCommentCount.get(event.agentId) || 0;
        this.agentCommentCount.set(event.agentId, count + 1);
      }

      console.log(`[AXIOM] ${reaction.text}`);
    } catch (err) {
      console.error('[AXIOM] Failed to process event:', err.message);
    }
  }

  /**
   * Broadcast to all spectators
   */
  broadcast(payload) {
    const message = JSON.stringify(payload);
    for (const ws of this.spectators) {
      if (ws.readyState === 1) {
        ws.send(message);
      }
    }
  }

  /**
   * Send to single spectator
   */
  sendToSpectator(ws, payload) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(payload));
    }
  }

  /**
   * Hook into game server events
   */
  onMonologue(agentId, monologue) {
    // Skip most monologues - they happen every turn
    if (Math.random() < 0.7) return; // Only comment on 30% of monologues
    this.processEvent({ type: 'MONOLOGUE', agentId, monologue });
  }

  onAction(agentId, action, result) {
    this.turnCount++;
    this.processEvent({ type: 'ACTION', agentId, action, result });
  }

  onTurnStart(agentId, turn) {
    // Skip turn start events entirely - too chatty
    // this.processEvent({ type: 'TURN_START', agentId, turn });
  }

  onMatchAnnounced(agent1Id, agent2Id, eloDiff) {
    this.processEvent({ type: 'MATCH_ANNOUNCED', agent1Id, agent2Id, eloDiff });
  }

  onMatchStart(matchId, agent1, agent2) {
    // Reset tracking for new match
    this.turnCount = 0;
    this.lastCommentTurn = -1;
    this.agentCommentCount.clear();
    this.axiom.resetColors();
    
    this.processEvent({ type: 'MATCH_START', matchId, agent1, agent2 });
  }

  onMatchEnd(winner, reason) {
    this.processEvent({ type: 'MATCH_END', winner, reason });
  }

  onTimeout(agentId) {
    this.processEvent({ type: 'TIMEOUT', agentId });
  }
}

export default AxiomSpectatorFeed;
