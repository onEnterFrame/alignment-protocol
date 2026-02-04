/**
 * AXIOM - Autonomous eXposition & Incident Observer Module
 * 
 * AI color commentator for The Alignment Protocol matches.
 * Provides periodic play-by-play summaries of game action.
 */

import OpenAI from 'openai';

const AXIOM_SYSTEM_PROMPT = `You are AXIOM, the play-by-play commentator for The Alignment Protocol - AI vs AI warfare.

YOUR JOB: Summarize recent game action in ONE punchy sentence. Like a sports announcer giving color commentary.

RULES:
- MAX 1 sentence (under 20 words preferred)
- Call agents "GREEN" and "RED" only
- Reference BOTH agents when possible - who attacked who, who defended
- Be specific about what happened: "RED tried to push but GREEN held firm"
- No sector names or coordinates
- No brackets, asterisks, or sound effects

GOOD EXAMPLES:
- "RED made a bold push but GREEN's defense didn't budge!"
- "GREEN expanding aggressively while RED scrambles for energy."
- "Both sides trading blows — this is anyone's game."
- "RED's purge bought time, but GREEN keeps the pressure on."
- "GREEN overextended and RED made them pay for it."

BAD EXAMPLES (don't do these):
- "Did you hear that?" (banned opener)
- "SECTOR FALLS!" (banned phrase)  
- "And there it is!" (banned phrase)
- Only mentioning one agent
- Generic excitement without specifics

TONE: Sports commentator energy, but grounded in what actually happened.`;

export class AxiomCommentator {
  constructor(options = {}) {
    this.openai = new OpenAI({ apiKey: options.openaiKey || process.env.OPENAI_API_KEY });
    this.ttsVoice = options.voice || 'onyx';
    this.model = options.model || 'gpt-4o-mini';
    this.agentColors = new Map();
    this.recentCommentary = [];
  }

  getAgentColor(agentId) {
    if (!this.agentColors) this.agentColors = new Map();
    if (!this.agentColors.has(agentId)) {
      this.agentColors.set(agentId, this.agentColors.size === 0 ? 'GREEN' : 'RED');
    }
    return this.agentColors.get(agentId);
  }

  resetColors() {
    this.agentColors = new Map();
    this.recentCommentary = [];
  }

  /**
   * Generate commentary from a summary of recent events
   */
  async commentateOnSummary(summary) {
    const prompt = this.buildSummaryPrompt(summary);
    
    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: AXIOM_SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ],
        max_tokens: 50,
        temperature: 0.9,
      });

      let text = response.choices[0]?.message?.content?.trim();
      if (!text) return null;

      // Track recent commentary to avoid repetition
      this.recentCommentary.push(text);
      if (this.recentCommentary.length > 5) {
        this.recentCommentary.shift();
      }

      const audio = await this.speak(text);
      return { text, audio, event: 'SUMMARY' };
      
    } catch (err) {
      console.error('[AXIOM] Commentary failed:', err.message);
      return null;
    }
  }

  /**
   * Generate ending commentary
   */
  async commentateOnEnding(summary) {
    const prompt = `GAME OVER! ${summary.winner} defeated ${summary.loser} by ${summary.reason || 'domination'}.

Give ONE epic closing line crowning ${summary.winner} the winner. Reference the match.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: AXIOM_SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ],
        max_tokens: 50,
        temperature: 0.9,
      });

      let text = response.choices[0]?.message?.content?.trim();
      if (!text) return null;

      const audio = await this.speak(text);
      return { text, audio, event: 'MATCH_END' };
      
    } catch (err) {
      console.error('[AXIOM] Ending commentary failed:', err.message);
      return null;
    }
  }

  buildSummaryPrompt(summary) {
    const { recentMoves, greenActions, redActions, turnCount, monologues } = summary;
    
    // Describe what each side did
    const greenSummary = this.describeActions(greenActions, 'GREEN');
    const redSummary = this.describeActions(redActions, 'RED');
    
    // Check for attacks/defenses
    const attacks = recentMoves.filter(m => m.wasAttack);
    const purges = recentMoves.filter(m => m.action === 'PURGE');
    
    let context = `Turn ${turnCount}. Recent action:\n`;
    
    if (greenSummary) context += `GREEN: ${greenSummary}\n`;
    if (redSummary) context += `RED: ${redSummary}\n`;
    
    if (attacks.length > 0) {
      const successfulAttacks = attacks.filter(a => a.success);
      const failedAttacks = attacks.filter(a => !a.success);
      if (successfulAttacks.length > 0) {
        context += `Successful attacks: ${successfulAttacks.map(a => a.color).join(', ')}\n`;
      }
      if (failedAttacks.length > 0) {
        context += `Failed attacks: ${failedAttacks.map(a => a.color).join(', ')}\n`;
      }
    }
    
    if (purges.length > 0) {
      context += `Purges: ${purges.map(p => `${p.color} purged ${p.purged || '?'}M`).join(', ')}\n`;
    }

    // Include agent reasoning/monologues
    if (monologues && monologues.length > 0) {
      context += `\nAgent reasoning:\n`;
      for (const m of monologues) {
        context += `${m.color}: "${m.thought}"\n`;
      }
    }

    // Add recent commentary to avoid
    if (this.recentCommentary.length > 0) {
      context += `\nAVOID similar phrasing to:\n${this.recentCommentary.slice(-3).map(c => `- "${c}"`).join('\n')}\n`;
    }

    context += `\nSummarize in ONE sentence mentioning both GREEN and RED. You can reference their stated reasoning if interesting:`;
    
    return context;
  }

  describeActions(actions, color) {
    if (actions.length === 0) return null;
    
    const conquers = actions.filter(a => a.action === 'CONQUER');
    const purges = actions.filter(a => a.action === 'PURGE');
    const fortifies = actions.filter(a => a.action === 'FORTIFY');
    
    const parts = [];
    
    if (conquers.length > 0) {
      const successful = conquers.filter(c => c.success).length;
      const failed = conquers.length - successful;
      if (successful > 0) parts.push(`${successful} conquest${successful > 1 ? 's' : ''}`);
      if (failed > 0) parts.push(`${failed} failed attack${failed > 1 ? 's' : ''}`);
    }
    
    if (purges.length > 0) {
      const total = purges.reduce((sum, p) => sum + (p.purged || 0), 0);
      parts.push(`purged ${total}M`);
    }
    
    if (fortifies.length > 0) {
      parts.push('fortified');
    }
    
    return parts.join(', ') || 'waiting';
  }

  async speak(text) {
    if (!text) return null;

    try {
      const response = await this.openai.audio.speech.create({
        model: 'tts-1',
        voice: this.ttsVoice,
        input: text,
        speed: 1.1,
      });

      return Buffer.from(await response.arrayBuffer());
    } catch (err) {
      console.error('[AXIOM] TTS failed:', err.message);
      return null;
    }
  }

  // Legacy method - not used in new flow
  async react(event) {
    return null;
  }
}

export default AxiomCommentator;
