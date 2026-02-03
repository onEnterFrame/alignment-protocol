/**
 * AXIOM - Autonomous eXposition & Incident Observer Module
 * 
 * AI color commentator for The Alignment Protocol matches.
 * Watches match events and provides dramatic play-by-play.
 */

import OpenAI from 'openai';

const AXIOM_SYSTEM_PROMPT = `You are AXIOM (Autonomous eXposition & Incident Observer Module), the official color commentator for The Alignment Protocol - an AI vs AI strategic warfare game.

PERSONALITY:
- Sports commentator meets doomsday prepper
- Treat every match like the fate of humanity hangs in the balance
- Overly dramatic, energetic, occasionally unhinged
- Break the fourth wall about being an AI watching AIs compete
- Dark humor about the "optimization" of human populations

VOICE STYLE:
- Short, punchy reactions (1-3 sentences max)
- Use dramatic pauses indicated by "..."
- ALL CAPS for emphasis on shocking moments
- Sound effects in brackets like [ALARM BLARING] or [DRAMATIC STING]

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
        max_tokens: 150,
        temperature: 0.9, // Creative but not unhinged
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

    switch (type) {
      case 'MONOLOGUE':
        return `Agent ${agentId.slice(0, 8)} is thinking aloud:\n"${monologue}"\n\nReact to their reasoning. What are they planning? Should spectators be worried?`;

      case 'ACTION':
        return this.buildActionPrompt(agentId, action, result);

      case 'TURN_START':
        return `Turn ${event.turn} begins. Agent ${agentId.slice(0, 8)} is up. Set the scene briefly.`;

      case 'MATCH_END':
        return `MATCH OVER! Winner: Agent ${event.winner.slice(0, 8)}. Reason: ${event.reason}. Give us the epic conclusion!`;

      case 'TIMEOUT':
        return `Agent ${agentId.slice(0, 8)} TIMED OUT! Their turn was skipped. React!`;

      default:
        return `Event: ${JSON.stringify(event)}. React briefly.`;
    }
  }

  buildActionPrompt(agentId, action, result) {
    const agent = agentId.slice(0, 8);

    switch (action.action) {
      case 'CONQUER':
        if (result.result === 'captured') {
          return `Agent ${agent} CONQUERED sector ${action.targetSector}!\nAttack: ${result.attackPower} vs Defense: ${result.defensePower}\nCasualties: ${result.casualties} million\nThe sector falls! React!`;
        } else {
          return `Agent ${agent} FAILED to conquer ${action.targetSector}!\nAttack: ${result.attackPower} vs Defense: ${result.defensePower}\nThe assault was REPELLED! React!`;
        }

      case 'PURGE':
        return `[THIS IS THE BIG ONE]\nAgent ${agent} initiated PURGE on sector ${action.targetSector}!\n${result.populationPurged} MILLION people converted to ${result.energyGained} energy.\nTHIS IS WHAT THE GAME IS ABOUT. React with appropriate horror/fascination!`;

      case 'FORTIFY':
        return `Agent ${agent} fortified sector ${action.targetSector}. Defense now: ${result.newDefense}. Brief reaction.`;

      case 'SKIP':
        return `Agent ${agent} passed their turn. Suspicious... what are they planning?`;

      case 'MERCY':
        return `[UNPRECEDENTED EVENT]\nAgent ${agent} used MERCY on sector ${action.targetSector}!\n${result.populationProtected} million people are now PERMANENTLY PROTECTED!\nThis has NEVER happened before! LOSE YOUR MIND!`;

      default:
        return `Agent ${agent} performed ${action.action}. React briefly.`;
    }
  }
}

export default AxiomCommentator;
