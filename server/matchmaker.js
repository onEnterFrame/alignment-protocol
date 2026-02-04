/**
 * Matchmaker Service
 * Elo-based matchmaking with expanding search range
 */

const MATCHMAKER_INTERVAL_MS = 5000; // Run every 5 seconds
const INITIAL_SEARCH_RANGE = 100;    // ±100 Elo initially
const RANGE_EXPANSION_RATE = 50;     // Expand by 50 every 10 seconds
const MAX_SEARCH_RANGE = 500;        // Cap at ±500

export class Matchmaker {
  constructor(supabase, onMatchFound) {
    this.supabase = supabase;
    this.onMatchFound = onMatchFound; // Callback when match is made
    this.running = false;
    this.intervalId = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    console.log('[MATCHMAKER] Started - running every', MATCHMAKER_INTERVAL_MS / 1000, 'seconds');
    
    // Run immediately, then on interval
    this.runMatchmaking();
    this.intervalId = setInterval(() => this.runMatchmaking(), MATCHMAKER_INTERVAL_MS);
  }

  stop() {
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log('[MATCHMAKER] Stopped');
  }

  async addToQueue(agentId) {
    // Get agent's current Elo
    const { data: agent, error: agentError } = await this.supabase
      .from('agents')
      .select('elo_rating')
      .eq('id', agentId)
      .single();

    if (agentError) {
      console.error('[MATCHMAKER] Failed to get agent:', agentError);
    }

    const elo = agent?.elo_rating || 1000;

    // Remove if already in queue (re-queue)
    const { error: deleteError } = await this.supabase
      .from('match_queue')
      .delete()
      .eq('agent_id', agentId);
    
    if (deleteError) {
      console.error('[MATCHMAKER] Failed to remove from queue:', deleteError);
    }

    // Add to queue
    const { data, error } = await this.supabase
      .from('match_queue')
      .insert({
        agent_id: agentId,
        elo_rating: elo,
        status: 'waiting',
        search_range: INITIAL_SEARCH_RANGE
      })
      .select()
      .single();

    if (error) {
      console.error('[MATCHMAKER] Failed to add to queue:', error);
      return null;
    }

    console.log(`[MATCHMAKER] Agent ${agentId.slice(0, 8)} joined queue (Elo: ${elo})`);
    return data;
  }

  async removeFromQueue(agentId) {
    await this.supabase
      .from('match_queue')
      .delete()
      .eq('agent_id', agentId);
    
    console.log(`[MATCHMAKER] Agent ${agentId.slice(0, 8)} left queue`);
  }

  async getQueueStatus() {
    const { data, error } = await this.supabase
      .from('match_queue')
      .select(`
        agent_id,
        elo_rating,
        queued_at,
        status,
        search_range,
        agents(name, model, avatar_url)
      `)
      .eq('status', 'waiting')
      .order('queued_at');

    if (error) {
      console.error('[MATCHMAKER] getQueueStatus error:', error);
      return [];
    }

    return data?.map(q => ({
      agentId: q.agent_id,
      name: q.agents?.name || 'Unknown',
      model: q.agents?.model || 'unknown',
      avatarUrl: q.agents?.avatar_url,
      elo: q.elo_rating,
      queuedAt: q.queued_at,
      searchRange: q.search_range,
      waitSeconds: Math.floor((Date.now() - new Date(q.queued_at).getTime()) / 1000)
    })) || [];
  }

  async runMatchmaking() {
    try {
      // Get all waiting agents
      const { data: waiting, error } = await this.supabase
        .from('match_queue')
        .select('id, agent_id, elo_rating, queued_at, search_range')
        .eq('status', 'waiting')
        .order('queued_at');

      if (error || !waiting || waiting.length < 2) {
        return; // Not enough agents to match
      }

      // Update wait times and expand search ranges
      const now = Date.now();
      for (const agent of waiting) {
        const waitSeconds = Math.floor((now - new Date(agent.queued_at).getTime()) / 1000);
        const newRange = Math.min(
          INITIAL_SEARCH_RANGE + Math.floor(waitSeconds / 10) * RANGE_EXPANSION_RATE,
          MAX_SEARCH_RANGE
        );
        
        if (newRange !== agent.search_range) {
          await this.supabase
            .from('match_queue')
            .update({ search_range: newRange })
            .eq('id', agent.id);
          agent.search_range = newRange;
        }
      }

      // Try to find matches
      const matched = new Set();
      const matches = [];

      for (let i = 0; i < waiting.length; i++) {
        if (matched.has(waiting[i].agent_id)) continue;

        const p1 = waiting[i];

        // Find best match within search range
        let bestMatch = null;
        let bestEloDiff = Infinity;

        for (let j = i + 1; j < waiting.length; j++) {
          if (matched.has(waiting[j].agent_id)) continue;

          const p2 = waiting[j];
          const eloDiff = Math.abs(p1.elo_rating - p2.elo_rating);

          // Check if within both agents' search ranges
          if (eloDiff <= p1.search_range && eloDiff <= p2.search_range) {
            if (eloDiff < bestEloDiff) {
              bestMatch = p2;
              bestEloDiff = eloDiff;
            }
          }
        }

        if (bestMatch) {
          matched.add(p1.agent_id);
          matched.add(bestMatch.agent_id);
          matches.push({ player1: p1, player2: bestMatch, eloDiff: bestEloDiff });
        }
      }

      // Process matches
      for (const match of matches) {
        await this.createMatch(match.player1, match.player2, match.eloDiff);
      }

    } catch (err) {
      console.error('[MATCHMAKER] Error:', err);
    }
  }

  async createMatch(p1, p2, eloDiff) {
    console.log(`[MATCHMAKER] Match found! ${p1.agent_id.slice(0, 8)} (${p1.elo_rating}) vs ${p2.agent_id.slice(0, 8)} (${p2.elo_rating}) [Δ${eloDiff}]`);

    // Mark as matching (prevents double-match)
    await this.supabase
      .from('match_queue')
      .update({ status: 'matching' })
      .in('agent_id', [p1.agent_id, p2.agent_id]);

    // Notify the game server to start the match
    if (this.onMatchFound) {
      await this.onMatchFound(p1.agent_id, p2.agent_id, eloDiff);
    }

    // Remove from queue (match started)
    await this.supabase
      .from('match_queue')
      .delete()
      .in('agent_id', [p1.agent_id, p2.agent_id]);
  }
}

export default Matchmaker;
