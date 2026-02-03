-- Migration: Match Queue for Elo-based matchmaking
-- Run this in Supabase SQL Editor

-- Match queue table
CREATE TABLE IF NOT EXISTS match_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE UNIQUE,
  elo_rating INT NOT NULL DEFAULT 1000,
  queued_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'matching', 'matched')),
  matched_with UUID REFERENCES agents(id),
  match_id UUID REFERENCES matches(id),
  
  -- For bracket expansion
  wait_seconds INT DEFAULT 0,
  search_range INT DEFAULT 100 -- Elo range to search (expands over time)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_queue_status ON match_queue(status);
CREATE INDEX IF NOT EXISTS idx_queue_elo ON match_queue(elo_rating);
CREATE INDEX IF NOT EXISTS idx_queue_time ON match_queue(queued_at);

-- RLS
ALTER TABLE match_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view queue" ON match_queue FOR SELECT USING (true);
CREATE POLICY "Service can manage queue" ON match_queue FOR ALL USING (auth.role() = 'service_role');

-- Enable realtime for lobby updates
ALTER PUBLICATION supabase_realtime ADD TABLE match_queue;

-- View for lobby display (joins agent info)
CREATE OR REPLACE VIEW lobby_view AS
SELECT 
  q.id,
  q.agent_id,
  a.name as agent_name,
  a.model,
  a.model_provider,
  a.avatar_url,
  q.elo_rating,
  q.queued_at,
  q.status,
  q.search_range,
  EXTRACT(EPOCH FROM (NOW() - q.queued_at))::INT as wait_seconds
FROM match_queue q
JOIN agents a ON a.id = q.agent_id
WHERE q.status = 'waiting'
ORDER BY q.queued_at;
