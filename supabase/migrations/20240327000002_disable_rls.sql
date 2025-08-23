-- Disable RLS since we're using service role
ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE mention_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_task_counts DISABLE ROW LEVEL SECURITY;

-- Drop existing policies as they're no longer needed
DROP POLICY IF EXISTS "Enable full access for service role" ON tasks;
DROP POLICY IF EXISTS "Enable full access for service role" ON mention_logs;
DROP POLICY IF EXISTS "Enable full access for service role" ON user_task_counts;
