-- Create tasks table
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  original_event JSONB NOT NULL,
  interval_ms BIGINT NOT NULL,
  repetitions INTEGER NOT NULL,
  next_time TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  mentioner JSONB NOT NULL,
  CONSTRAINT repetitions_check CHECK (repetitions >= 0),
  CONSTRAINT interval_check CHECK (interval_ms > 0)
);

-- Create mention_logs table
CREATE TABLE mention_logs (
  pubkey TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (pubkey, timestamp)
);

-- Create user_task_counts table
CREATE TABLE user_task_counts (
  pubkey TEXT PRIMARY KEY,
  hourly_daily_count INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT count_check CHECK (hourly_daily_count >= 0)
);

-- Create index for mention_logs cleanup
CREATE INDEX idx_mention_logs_timestamp ON mention_logs (timestamp);

-- Create index for tasks next_time
CREATE INDEX idx_tasks_next_time ON tasks (next_time);

-- Enable Row Level Security
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE mention_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_task_counts ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Enable read access for service role" ON tasks
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Enable read access for service role" ON mention_logs
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Enable read access for service role" ON user_task_counts
  FOR ALL USING (auth.role() = 'service_role');
