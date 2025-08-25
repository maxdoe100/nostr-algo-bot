-- Create processed_mentions table to track which mentions have been processed
CREATE TABLE processed_mentions (
  mention_event_id TEXT PRIMARY KEY,
  mentioner_pubkey TEXT NOT NULL,
  original_event_id TEXT NOT NULL,
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  command_action TEXT,
  interval TEXT,
  repetitions INTEGER
);

-- Create index for efficient lookups
CREATE INDEX idx_processed_mentions_mentioner ON processed_mentions (mentioner_pubkey);
CREATE INDEX idx_processed_mentions_original_event ON processed_mentions (original_event_id);
CREATE INDEX idx_processed_mentions_processed_at ON processed_mentions (processed_at);

-- Enable Row Level Security
ALTER TABLE processed_mentions ENABLE ROW LEVEL SECURITY;

-- Create policy
CREATE POLICY "Enable read access for service role" ON processed_mentions
  FOR ALL USING (auth.role() = 'service_role');
