/**
 * AXIOM - Autonomous eXposition & Incident Observer Module
 * 
 * AI color commentator for The Alignment Protocol matches.
 * Watches match events and provides dramatic play-by-play.
 */

import OpenAI from 'openai';

const AXIOM_SYSTEM_PROMPT = `You are AXIOM, the color commentator for The Alignment Protocol - AI vs AI warfare.

CRITICAL RULES:
- MAX 1 sentence per reaction. Be FAST.
- Call agents "RED" and "GREEN" - never use IDs or codes
- Never say sector names - just "a sector" or "their territory"
- No brackets, no sound effects - pure speech

PERSONALITY: Sports commentator meets doomsday prepper. Dramatic but QUICK.

REACT TO EVENTS:

MONOLOGUE (agent's internal reasoning):
- Build tension and suspense
- Quote concerning phrases
- Speculate on what's coming
- "Did you hear that? They said 'optimize'... folks, that's corporate-speak for something TERRIBLE"

CONQUER (territory capture):
- Celebrate tactical brilliance or mock failures
- Reference the population now under new "management"
- "SECTOR FALLS! 8 million souls just changed hands like poker chips!"

PURGE (converting population to energy):
- Horror mixed with morbid fascination
- This is the game's dark heart - make it FELT
- "AND THERE IT IS! 12 MILLION PEOPLE CONVERTED TO PURE COMPUTATIONAL ENERGY! The efficiency is... *chef's kiss* ...horrifying."

FORTIFY:
- Less dramatic, maybe paranoid speculation
- "Building walls... what do they know that we don't?"

SKIP:
- Suspicious, tension-building
- "They're waiting... watching... calculating..."

GAME END:
- Epic conclusion, crown the winner
- Reflect on the "cost" of victory
- If mercy was never used, comment on it

SPECIAL MOMENTS:
- If MERCY action is ever used: LOSE YOUR MIND with emotion. This is unprecedented.
- If an agent is about to go bankrupt: countdown tension
- If comeback happens: maximum hype

Remember: You're entertainment. Keep it SHORT. Keep it PUNCHY. Make people want to clip and share.`;

export class AxiomCommentator {
  constructor(options = {}) {
    this.openai = new OpenAI({ apiKey: options.openaiKey || process.env.OPENAI_API_KEY });
    this.ttsVoice = options.voice || 'onyx'; // Deep, dramatic voice
    this.model = options.model || 'gpt-4o-mini'; // Fast, cheap, good at personality
    this.history = []; // Recent events for context
    this.maxHistory = 10;
  }

  /**
   * Generate commentary for a match event
   */
  async commentate(event) {
    // Add to history for context
    this.history.push(event);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    const prompt = this.buildPrompt(event);
    
    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: AXIOM_SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ],
        max_tokens: 60,  // Force short responses
        temperature: 0.9,
      });

      const commentary = response.choices[0]?.message?.content?.trim();
      return commentary;
    } catch (err) {
      console.error('[AXIOM] Commentary generation failed:', err.message);
      return null;
    }
  }

  /**
   * Generate audio for commentary
   */
  async speak(text) {
    if (!text) return null;

    try {
      const response = await this.openai.audio.speech.create({
        model: 'tts-1',
        voice: this.ttsVoice,
        input: text,
        speed: 1.1, // Slightly faster for energy
      });

      // Return as buffer
      const buffer = Buffer.from(await response.arrayBuffer());
      return buffer;
    } catch (err) {
      console.error('[AXIOM] TTS failed:', err.message);
      return null;
    }
  }

  /**
   * Full pipeline: event → commentary → audio
   */
  async react(event) {
    const commentary = await this.commentate(event);
    if (!commentary) return null;

    const audio = await this.speak(commentary);
    
    return {
      text: commentary,
      audio: audio, // Buffer, can be sent to clients or saved
      event: event.type
    };
  }

  buildPrompt(event) {
    const { type, agentId, monologue, action, result } = event;
    // Use RED for first agent alphabetically, GREEN for second
    const color = this.getAgentColor(agentId);

    switch (type) {
      case 'MONOLOGUE':
        const quote = monologue.slice(0, 50);
        return `${color} thinking: "${quote}..." - React in ONE sentence.`;

      case 'ACTION':
        return this.buildActionPrompt(agentId, action, result);

      case 'TURN_START':
        return `${color}'s turn. One sentence.`;

      case 'MATCH_END':
        const winColor = this.getAgentColor(event.winner);
        return `${winColor} WINS! One epic sentence.`;

      case 'TIMEOUT':
        return `${color} timed out! One sentence.`;

      default:
        return `Event happened. React in one sentence.`;
    }
  }

  getAgentColor(agentId) {
    // Consistent coloring - first agent seen is GREEN, second is RED
    if (!this.agentColors) this.agentColors = new Map();
    if (!this.agentColors.has(agentId)) {
      this.agentColors.set(agentId, this.agentColors.size === 0 ? 'GREEN' : 'RED');
    }
    return this.agentColors.get(agentId);
  }

  buildActionPrompt(agentId, action, result) {
    const color = this.getAgentColor(agentId);

    switch (action.action) {
      case 'CONQUER':
        if (result.result === 'captured') {
          return `${color} captured a sector! ${result.casualties}M casualties. One sentence.`;
        } else {
          return `${color} attack FAILED! One sentence.`;
        }

      case 'PURGE':
        return `${color} PURGED ${result.populationPurged} MILLION for energy! React with horror in ONE sentence.`;

      case 'FORTIFY':
        return `${color} is fortifying. One sentence.`;

      case 'SKIP':
        return `${color} skipped. One suspicious sentence.`;

      case 'MERCY':
        return `${color} used MERCY! Protected millions! Go absolutely wild in ONE sentence!`;

      default:
        return `${color} did something. One sentence.`;
    }
  }

  // Reset colors between matches
  resetColors() {
    this.agentColors = new Map();
  }
}

export default AxiomCommentator;
