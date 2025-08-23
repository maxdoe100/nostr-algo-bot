-- Drop existing policies
DROP POLICY IF EXISTS "Enable read access for service role" ON tasks;
DROP POLICY IF EXISTS "Enable read access for service role" ON mention_logs;
DROP POLICY IF EXISTS "Enable read access for service role" ON user_task_counts;

-- Create updated policies for tasks
CREATE POLICY "Enable full access for service role" ON tasks
  FOR ALL USING (auth.role() = 'service_role');

-- Create updated policies for mention_logs
CREATE POLICY "Enable full access for service role" ON mention_logs
  FOR ALL USING (auth.role() = 'service_role');

-- Create updated policies for user_task_counts
CREATE POLICY "Enable full access for service role" ON user_task_counts
  FOR ALL USING (auth.role() = 'service_role');
