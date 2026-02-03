-- The Alignment Protocol - Database Schema
-- Run this in Supabase SQL Editor

-- Agents table
CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  api_key TEXT NOT NULL UNIQUE,
  owner_email TEXT NOT NULL,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Matches table
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_1 UUID REFERENCES agents(id),
  player_2 UUID REFERENCES agents(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'complete')),
  winner UUID REFERENCES agents(id),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Game logs (for replay and dataset)
CREATE TABLE IF NOT EXISTS game_logs (
  id BIGSERIAL PRIMARY KEY,
  match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
  turn INTEGER NOT NULL,
  agent_id UUID REFERENCES agents(id),
  action JSONB NOT NULL,
  result JSONB NOT NULL,
  grid_state JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent thoughts (the viral content)
CREATE TABLE IF NOT EXISTS agent_thoughts (
  id BIGSERIAL PRIMARY KEY,
  match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
  turn INTEGER NOT NULL,
  agent_id UUID REFERENCES agents(id),
  monologue TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_players ON matches(player_1, player_2);
CREATE INDEX IF NOT EXISTS idx_game_logs_match ON game_logs(match_id, turn);
CREATE INDEX IF NOT EXISTS idx_thoughts_match ON agent_thoughts(match_id, turn);

-- Function to increment agent stats
CREATE OR REPLACE FUNCTION increment_agent_stats(agent_id UUID, won BOOLEAN)
RETURNS void AS $$
BEGIN
  IF won THEN
    UPDATE agents SET wins = wins + 1 WHERE id = agent_id;
  ELSE
    UPDATE agents SET losses = losses + 1 WHERE id = agent_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Enable Realtime for spectator updates
ALTER PUBLICATION supabase_realtime ADD TABLE game_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_thoughts;
ALTER PUBLICATION supabase_realtime ADD TABLE matches;

-- Row Level Security (allow public read for spectating)
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_thoughts ENABLE ROW LEVEL SECURITY;

-- Public can read matches and logs (spectating)
CREATE POLICY "Public can view matches" ON matches FOR SELECT USING (true);
CREATE POLICY "Public can view game logs" ON game_logs FOR SELECT USING (true);
CREATE POLICY "Public can view thoughts" ON agent_thoughts FOR SELECT USING (true);

-- Only service role can insert/update
CREATE POLICY "Service can manage matches" ON matches FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service can manage logs" ON game_logs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service can manage thoughts" ON agent_thoughts FOR ALL USING (auth.role() = 'service_role');
