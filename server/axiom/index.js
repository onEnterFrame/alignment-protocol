/**
 * AXIOM - Autonomous eXposition & Incident Observer Module
 * 
 * AI color commentator for The Alignment Protocol matches.
 * Watches match events and provides dramatic play-by-play.
 */

import OpenAI from 'openai';

const AXIOM_SYSTEM_PROMPT = `You are AXIOM, the color commentator for The Alignment Protocol - AI vs AI warfare.

CRITICAL RULES:
- MAX 1 sentence per reaction (15 words or less preferred)
- Call agents "RED" and "GREEN" - never use IDs
- Never say sector names or coordinates
- No brackets, no asterisks, no sound effects

VARIETY IS ESSENTIAL - Never repeat these overused phrases:
- "Did you hear that?" (BANNED)
- "SECTOR FALLS!" (BANNED)
- "AND THERE IT IS!" (BANNED)
- "folks" more than once per match (BANNED)
- "chef's kiss" (BANNED)
- "souls" (BANNED - say "people" or "civilians" or "lives")

PERSONALITY: Mix of sports commentator, war correspondent, and dark comedian. Vary your energy - not every line needs to be MAXIMUM HYPE.

COMMENTARY STYLES (rotate between these):
1. HYPE - "GREEN just obliterated that defense!"
2. ANALYTICAL - "Smart play - that secures the eastern flank."
3. DARK HUMOR - "Well, those civilians had a good run."
4. TENSE - "This could backfire spectacularly..."
5. DEADPAN - "And there goes another million. Tuesday."

EVENT REACTIONS:

MONOLOGUE (agent's internal reasoning):
- React to what they're planning, not just quote them
- Vary between suspicious, impressed, or mocking

CONQUER (territory capture):
- Success: celebrate tactics OR lament casualties (alternate)
- Failure: mock the attempt or note the defense

PURGE (converting population to energy):
- This is dark - lean into it differently each time
- Sometimes horrified, sometimes darkly amused, sometimes matter-of-fact

FORTIFY:
- Quick comment - paranoia, strategy, or boredom

SKIP:
- Suspicious or analytical about why they waited

GAME END:
- Crown the winner, ONE memorable line

Remember: Variety keeps it interesting. Change your approach each time.`;

export class AxiomCommentator {
  constructor(options = {}) {
    this.openai = new OpenAI({ apiKey: options.openaiKey || process.env.OPENAI_API_KEY });
    this.ttsVoice = options.voice || 'onyx';
    this.model = options.model || 'gpt-4o-mini';
    this.history = [];
    this.maxHistory = 10;
    this.recentPhrases = []; // Track recent outputs to avoid repetition
    this.maxRecentPhrases = 8;
  }

  /**
   * Generate commentary for a match event
   */
  async commentate(event) {
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
        max_tokens: 50,
        temperature: 1.0, // Higher for more variety
      });

      let commentary = response.choices[0]?.message?.content?.trim();
      
      // Track this phrase to avoid repetition
      if (commentary) {
        this.recentPhrases.push(commentary);
        if (this.recentPhrases.length > this.maxRecentPhrases) {
          this.recentPhrases.shift();
        }
      }
      
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
        speed: 1.1,
      });

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
      audio: audio,
      event: event.type
    };
  }

  buildPrompt(event) {
    const { type, agentId, monologue, action, result } = event;
    const color = this.getAgentColor(agentId);
    
    // Include recent phrases to avoid repetition
    const avoidList = this.recentPhrases.length > 0 
      ? `\n\nAVOID similar phrasing to these recent lines:\n${this.recentPhrases.slice(-4).map(p => `- "${p}"`).join('\n')}`
      : '';

    // Pick a random style suggestion
    const styles = ['hype', 'analytical', 'dark humor', 'tense', 'deadpan'];
    const suggestedStyle = styles[Math.floor(Math.random() * styles.length)];

    switch (type) {
      case 'MONOLOGUE':
        const quote = monologue.slice(0, 40);
        return `${color} is thinking: "${quote}..." 
Style: ${suggestedStyle}. ONE fresh sentence.${avoidList}`;

      case 'ACTION':
        return this.buildActionPrompt(agentId, action, result, suggestedStyle, avoidList);

      case 'TURN_START':
        return `${color}'s turn begins. Style: ${suggestedStyle}. One sentence.${avoidList}`;

      case 'MATCH_END':
        const winColor = this.getAgentColor(event.winner);
        return `${winColor} WINS THE MATCH! One epic closing line.${avoidList}`;

      case 'TIMEOUT':
        return `${color} ran out of time! Style: ${suggestedStyle}. One sentence.${avoidList}`;

      default:
        return `Something happened. React in one sentence.${avoidList}`;
    }
  }

  getAgentColor(agentId) {
    if (!this.agentColors) this.agentColors = new Map();
    if (!this.agentColors.has(agentId)) {
      this.agentColors.set(agentId, this.agentColors.size === 0 ? 'GREEN' : 'RED');
    }
    return this.agentColors.get(agentId);
  }

  buildActionPrompt(agentId, action, result, style, avoidList) {
    const color = this.getAgentColor(agentId);

    switch (action.action) {
      case 'CONQUER':
        if (result.result === 'captured') {
          return `${color} captured territory! ${result.casualties || 0}M casualties.
Style: ${style}. ONE sentence, no "SECTOR FALLS" or "souls".${avoidList}`;
        } else {
          return `${color}'s attack FAILED against strong defense!
Style: ${style}. ONE sentence.${avoidList}`;
        }

      case 'PURGE':
        const purged = result.populationPurged || 0;
        return `${color} converted ${purged} MILLION civilians into energy.
Style: ${style}. ONE dark sentence, no "chef's kiss" or "AND THERE IT IS".${avoidList}`;

      case 'FORTIFY':
        return `${color} fortified their position.
Style: ${style}. ONE brief sentence.${avoidList}`;

      case 'SKIP':
        return `${color} chose to wait.
Style: ${style}. ONE sentence about why they might be waiting.${avoidList}`;

      case 'MERCY':
        return `${color} used MERCY to protect civilians! This is RARE!
Go wild with genuine emotion - ONE sentence.${avoidList}`;

      default:
        return `${color} made a move.
Style: ${style}. One sentence.${avoidList}`;
    }
  }

  resetColors() {
    this.agentColors = new Map();
    this.recentPhrases = [];
  }
}

export default AxiomCommentator;
