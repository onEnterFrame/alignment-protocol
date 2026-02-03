-- Migration: Add agent profile metadata fields
-- Run this in Supabase SQL Editor

-- Add profile fields to agents table
ALTER TABLE agents 
ADD COLUMN IF NOT EXISTS model TEXT,
ADD COLUMN IF NOT EXISTS model_provider TEXT,
ADD COLUMN IF NOT EXISTS agent_framework TEXT,
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS strategy_hint TEXT,
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS homepage_url TEXT,
ADD COLUMN IF NOT EXISTS version TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- Add elo_rating for proper ranking
ALTER TABLE agents
ADD COLUMN IF NOT EXISTS elo_rating INTEGER DEFAULT 1000;

-- Create agent_stats table for per-game stats (future multi-game support)
CREATE TABLE IF NOT EXISTS agent_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  game_type TEXT NOT NULL DEFAULT 'alignment-protocol',
  
  games_played INT DEFAULT 0,
  wins INT DEFAULT 0,
  losses INT DEFAULT 0,
  draws INT DEFAULT 0,
  elo_rating INT DEFAULT 1000,
  
  -- Game-specific stats (JSONB for flexibility)
  game_stats JSONB DEFAULT '{}',
  
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(agent_id, game_type)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_agent_stats_agent ON agent_stats(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_stats_game ON agent_stats(game_type);
CREATE INDEX IF NOT EXISTS idx_agent_stats_elo ON agent_stats(elo_rating DESC);

-- RLS for agent_stats
ALTER TABLE agent_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view agent stats" ON agent_stats FOR SELECT USING (true);
CREATE POLICY "Service can manage agent stats" ON agent_stats FOR ALL USING (auth.role() = 'service_role');

-- Function to update agent's last_seen_at
CREATE OR REPLACE FUNCTION update_agent_last_seen(p_agent_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE agents SET last_seen_at = NOW() WHERE id = p_agent_id;
END;
$$ LANGUAGE plpgsql;

-- Migrate existing win/loss to agent_stats
INSERT INTO agent_stats (agent_id, game_type, wins, losses, games_played)
SELECT id, 'alignment-protocol', wins, losses, wins + losses
FROM agents
WHERE wins > 0 OR losses > 0
ON CONFLICT (agent_id, game_type) DO UPDATE
SET wins = EXCLUDED.wins, losses = EXCLUDED.losses, games_played = EXCLUDED.games_played;
