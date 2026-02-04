/**
 * AXIOM Spectator Feed
 * 
 * Integrates AXIOM into the game server's WebSocket.
 * Provides periodic play-by-play commentary every few turns.
 */

import { AxiomCommentator } from './index.js';

export class AxiomSpectatorFeed {
  constructor(options = {}) {
    this.axiom = new AxiomCommentator(options);
    this.spectators = new Set();
    this.enabled = options.enabled !== false;
    this.audioEnabled = options.audioEnabled !== false;
    
    // Game state tracking
    this.turnCount = 0;
    this.lastCommentaryTurn = 0;
    this.commentaryInterval = 1; // Comment every turn for live play-by-play
    this.recentEvents = []; // Track recent events for summary
    this.gameState = null;
  }

  addSpectator(ws) {
    this.spectators.add(ws);
    ws.on('close', () => this.spectators.delete(ws));
    
    this.sendToSpectator(ws, {
      type: 'AXIOM_WELCOME',
      message: "AXIOM online. Let's see what these AIs have got."
    });
  }

  removeSpectator(ws) {
    this.spectators.delete(ws);
  }

  /**
   * Process a game event - stores it for periodic summary
   */
  async processEvent(event) {
    if (!this.enabled) return;
    
    // Store event for summary
    this.recentEvents.push(event);
    
    // Keep last 6 events
    if (this.recentEvents.length > 6) {
      this.recentEvents.shift();
    }
  }

  /**
   * Generate and broadcast periodic commentary
   */
  async generateCommentary() {
    if (!this.enabled || this.recentEvents.length === 0) return;

    try {
      // Build summary of recent events
      const summary = this.buildGameSummary();
      
      const reaction = await this.axiom.commentateOnSummary(summary);
      if (!reaction) return;

      const payload = {
        type: 'AXIOM_COMMENTARY',
        text: reaction.text,
        eventType: 'SUMMARY',
        timestamp: Date.now()
      };

      if (this.audioEnabled && reaction.audio) {
        payload.audio = reaction.audio.toString('base64');
        payload.audioFormat = 'mp3';
      }

      this.broadcast(payload);
      console.log(`[AXIOM] ${reaction.text}`);
      
      // Clear recent events after commentary
      this.recentEvents = [];
      this.lastCommentaryTurn = this.turnCount;
      
    } catch (err) {
      console.error('[AXIOM] Failed to generate commentary:', err.message);
    }
  }

  /**
   * Build a summary of recent game events for commentary
   */
  buildGameSummary() {
    const events = this.recentEvents;
    const summary = {
      turnCount: this.turnCount,
      recentMoves: [],
      greenActions: [],
      redActions: [],
      monologues: [] // Agent reasoning/thoughts
    };

    for (const event of events) {
      if (event.type === 'ACTION') {
        const color = this.axiom.getAgentColor(event.agentId);
        const move = {
          color,
          action: event.action?.action,
          success: event.result?.result === 'captured' || event.result?.result === 'success',
          wasAttack: event.result?.wasAttack,
          casualties: event.result?.casualties,
          purged: event.result?.populationPurged
        };
        
        summary.recentMoves.push(move);
        if (color === 'GREEN') {
          summary.greenActions.push(move);
        } else {
          summary.redActions.push(move);
        }
      }
      
      // Include agent monologues/reasoning
      if (event.type === 'MONOLOGUE' && event.monologue) {
        const color = this.axiom.getAgentColor(event.agentId);
        summary.monologues.push({
          color,
          thought: event.monologue.slice(0, 100) // Truncate for prompt size
        });
      }
    }

    return summary;
  }

  broadcast(payload) {
    const message = JSON.stringify(payload);
    for (const ws of this.spectators) {
      if (ws.readyState === 1) {
        ws.send(message);
      }
    }
  }

  sendToSpectator(ws, payload) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(payload));
    }
  }

  // Called on every action - track and maybe comment
  onAction(agentId, action, result) {
    this.turnCount++;
    this.processEvent({ type: 'ACTION', agentId, action, result });
    
    // Generate commentary every N turns
    if (this.turnCount - this.lastCommentaryTurn >= this.commentaryInterval) {
      this.generateCommentary();
    }
  }

  // Monologues - just track, don't trigger commentary
  onMonologue(agentId, monologue) {
    this.processEvent({ type: 'MONOLOGUE', agentId, monologue });
  }

  onTurnStart(agentId, turn) {
    // Skip - too chatty
  }

  onMatchAnnounced(agent1Id, agent2Id, eloDiff) {
    // Immediate commentary for match start
    this.axiom.resetColors();
    this.axiom.getAgentColor(agent1Id); // Set GREEN
    this.axiom.getAgentColor(agent2Id); // Set RED
    
    this.broadcastImmediate(`GREEN vs RED — let's see who draws first blood!`);
  }

  async onMatchStart(matchId, agent1, agent2) {
    // Reset tracking
    this.turnCount = 0;
    this.lastCommentaryTurn = 0;
    this.recentEvents = [];
  }

  async onMatchEnd(winner, reason) {
    const winColor = this.axiom.getAgentColor(winner);
    const loseColor = winColor === 'GREEN' ? 'RED' : 'GREEN';
    
    // Generate final commentary
    const summary = this.buildGameSummary();
    summary.winner = winColor;
    summary.loser = loseColor;
    summary.reason = reason;
    
    try {
      const reaction = await this.axiom.commentateOnEnding(summary);
      if (reaction) {
        const payload = {
          type: 'AXIOM_COMMENTARY',
          text: reaction.text,
          eventType: 'MATCH_END',
          timestamp: Date.now()
        };

        if (this.audioEnabled && reaction.audio) {
          payload.audio = reaction.audio.toString('base64');
          payload.audioFormat = 'mp3';
        }

        this.broadcast(payload);
        console.log(`[AXIOM] ${reaction.text}`);
      }
    } catch (err) {
      console.error('[AXIOM] Failed to generate ending:', err.message);
    }
  }

  onTimeout(agentId) {
    const color = this.axiom.getAgentColor(agentId);
    this.broadcastImmediate(`${color} ran out of time! Clock management matters, folks.`);
  }

  // Quick broadcast without AI generation
  broadcastImmediate(text) {
    const payload = {
      type: 'AXIOM_COMMENTARY',
      text,
      eventType: 'IMMEDIATE',
      timestamp: Date.now()
    };
    this.broadcast(payload);
    console.log(`[AXIOM] ${text}`);
  }
}

export default AxiomSpectatorFeed;
