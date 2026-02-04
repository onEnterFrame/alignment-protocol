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
    this.spectators = new Set(); // WebSocket connections
    this.enabled = options.enabled !== false;
    this.audioEnabled = options.audioEnabled !== false;
  }

  /**
   * Add a spectator connection
   */
  addSpectator(ws) {
    this.spectators.add(ws);
    ws.on('close', () => this.spectators.delete(ws));
    
    // Send welcome message
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
   * Process a game event and broadcast commentary
   */
  async processEvent(event) {
    if (!this.enabled) return;

    try {
      const reaction = await this.axiom.react(event);
      if (!reaction) return;

      const payload = {
        type: 'AXIOM_COMMENTARY',
        text: reaction.text,
        eventType: reaction.event,
        timestamp: Date.now()
      };

      // Add audio as base64 if available and enabled
      if (this.audioEnabled && reaction.audio) {
        payload.audio = reaction.audio.toString('base64');
        payload.audioFormat = 'mp3';
      }

      this.broadcast(payload);

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
      if (ws.readyState === 1) { // OPEN
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
   * Call this from the main server when events occur
   */
  onMonologue(agentId, monologue) {
    this.processEvent({ type: 'MONOLOGUE', agentId, monologue });
  }

  onAction(agentId, action, result) {
    this.processEvent({ type: 'ACTION', agentId, action, result });
  }

  onTurnStart(agentId, turn) {
    this.processEvent({ type: 'TURN_START', agentId, turn });
  }

  onMatchEnd(winner, reason) {
    this.processEvent({ type: 'MATCH_END', winner, reason });
  }

  onTimeout(agentId) {
    this.processEvent({ type: 'TIMEOUT', agentId });
  }
}

export default AxiomSpectatorFeed;
