require('dotenv').config();
const supabase = require('./supabase');

async function testConnection() {
  try {
    // Test mention logging
    const testPubkey = 'test_pubkey_' + Date.now();
    console.log('Testing mention logging...');
    await supabase.logMention(testPubkey);
    const count = await supabase.getMentionCount(testPubkey);
    console.log('Mention count:', count);

    // Test task creation
    console.log('\nTesting task creation...');
    const testTask = new Map();
    const taskId = 'test_task_' + Date.now();
    testTask.set(taskId, {
      originalEvent: { id: 'test_event', content: 'test content' },
      interval: 3600000, // 1 hour
      repetitions: 1,
      nextTime: Date.now() + 3600000,
      mentioner: { pubkey: testPubkey, name: 'Test User' }
    });
    await supabase.saveTasks(testTask);
    console.log('Task created successfully');

    // Test task loading
    console.log('\nTesting task loading...');
    const loadedTasks = await supabase.loadTasks();
    console.log('Loaded tasks:', loadedTasks.size);

    // Test task deletion
    console.log('\nTesting task deletion...');
    await supabase.deleteTask(taskId);
    console.log('Task deleted successfully');

    // Test user task counts
    console.log('\nTesting user task counts...');
    await supabase.incrementUserTaskCount(testPubkey);
    const taskCount = await supabase.getUserTaskCount(testPubkey);
    console.log('User task count:', taskCount);

    console.log('\n✅ All tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testConnection();
