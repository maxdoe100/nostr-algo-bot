const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Task-related functions
async function saveTasks(tasks) {
  const tasksArray = Array.from(tasks.entries()).map(([id, task]) => ({
    id,
    original_event: task.originalEvent,
    interval_ms: task.interval,
    repetitions: task.repetitions,
    next_time: new Date(task.nextTime),
    mentioner: task.mentioner
  }));

  const { error } = await supabase
    .from('tasks')
    .upsert(tasksArray);

  if (error) throw error;
}

async function loadTasks() {
  const { data, error } = await supabase
    .from('tasks')
    .select('*');

  if (error) throw error;

  const tasks = new Map();
  for (const task of data) {
    tasks.set(task.id, {
      originalEvent: task.original_event,
      interval: task.interval_ms,
      repetitions: task.repetitions,
      nextTime: task.next_time,
      mentioner: task.mentioner
    });
  }
  return tasks;
}

async function deleteTask(taskId) {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', taskId);

  if (error) throw error;
}

// Mention log functions
async function logMention(pubkey) {
  const { error } = await supabase
    .from('mention_logs')
    .insert([{ pubkey }]);

  if (error) throw error;
}

async function getMentionCount(pubkey) {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const { count, error } = await supabase
    .from('mention_logs')
    .select('*', { count: 'exact' })
    .eq('pubkey', pubkey)
    .gte('timestamp', oneHourAgo.toISOString());

  if (error) throw error;
  return count;
}

async function cleanupMentionLogs() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const { error } = await supabase
    .from('mention_logs')
    .delete()
    .lt('timestamp', oneHourAgo.toISOString());

  if (error) throw error;
}

// User task count functions
async function getUserTaskCount(pubkey) {
  const { data, error } = await supabase
    .from('user_task_counts')
    .select('hourly_daily_count')
    .eq('pubkey', pubkey)
    .single();

  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
  return data?.hourly_daily_count || 0;
}

async function incrementUserTaskCount(pubkey) {
  const { error } = await supabase
    .from('user_task_counts')
    .upsert({
      pubkey,
      hourly_daily_count: await getUserTaskCount(pubkey) + 1
    });

  if (error) throw error;
}

async function decrementUserTaskCount(pubkey) {
  const currentCount = await getUserTaskCount(pubkey);
  if (currentCount > 0) {
    const { error } = await supabase
      .from('user_task_counts')
      .upsert({
        pubkey,
        hourly_daily_count: currentCount - 1
      });

    if (error) throw error;
  }
}

module.exports = {
  saveTasks,
  loadTasks,
  deleteTask,
  logMention,
  getMentionCount,
  cleanupMentionLogs,
  getUserTaskCount,
  incrementUserTaskCount,
  decrementUserTaskCount
};
