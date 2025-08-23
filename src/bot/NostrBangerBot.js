const { SimplePool, finalizeEvent, getPublicKey, nip19 } = require('nostr-tools');
const supabase = require('../../supabase');
const { DEFAULT_RELAYS, SPAM_LIMITS, INTERVALS } = require('../config/constants');
const { hexToBytes, shortId, parseCommand, getOriginalEventId, computeRepetitions } = require('../utils/helpers');
const { CONFIRMATION_MESSAGES, INVALID_COMMAND_MESSAGES, REPOST_MESSAGES, ZAP_REPLY_MESSAGES, getRandomMessage, formatMessage } = require('../templates/messages');

class NostrBangerBot {
  constructor() {
    this.pool = new SimplePool();
    this.tasks = new Map();
    this.timeouts = new Map();
    this.relays = process.env.NOSTR_RELAYS
      ? process.env.NOSTR_RELAYS.split(',').map((r) => r.trim()).filter(Boolean)
      : DEFAULT_RELAYS;

    // How far back to look for mentions on startup (seconds)
    this.lookbackSeconds = Number.parseInt(process.env.LOOKBACK_SECONDS || '1800', 10); // default 30 min

    // Parse bot's private key from environment (accept nsec or 64-char hex)
    const rawKey = process.env.BOT_NSEC || process.env.PRIVATE_KEY || process.env.NOSTR_PRIVATE_KEY;
    const cleanedKey = (rawKey || '').trim().replace(/^['"]|['"]$/g, '');
    if (!cleanedKey) {
      throw new Error('BOT_NSEC (or PRIVATE_KEY/NOSTR_PRIVATE_KEY) environment variable is required');
    }

    let privateKeyBytes;
    if (cleanedKey.toLowerCase().startsWith('nsec1')) {
      try {
        const decoded = nip19.decode(cleanedKey);
        if (decoded.type !== 'nsec' || !decoded.data) {
          throw new Error('decode failed');
        }
        privateKeyBytes = decoded.data; // Uint8Array
      } catch (e) {
        throw new Error('Invalid BOT_NSEC value: could not decode nsec1 key');
      }
    } else if (/^[0-9a-fA-F]{64}$/.test(cleanedKey)) {
      privateKeyBytes = hexToBytes(cleanedKey);
    } else {
      throw new Error('Invalid BOT_NSEC format. Provide nsec1... or 64-char hex');
    }

    this.privateKey = privateKeyBytes; // Uint8Array
    this.publicKey = getPublicKey(this.privateKey); // hex string

    // Start mention log cleanup every hour
    this.startMentionLogCleanup();

    // Start periodic task checking for long-term tasks
    this.startPeriodicTaskCheck();

    console.log(`🔑 Bot initialized with pubkey: ${nip19.npubEncode(this.publicKey)}`);
  }

  // Clean up old mention log entries (older than 1 hour)
  async cleanupMentionLog() {
    try {
      await supabase.cleanupMentionLogs();
      console.log('🧹 Cleaned up old mention log entries');
    } catch (error) {
      console.error('❌ Error cleaning up mention logs:', error);
    }
  }

  // Clean up completed tasks from database
  async cleanupCompletedTasks() {
    try {
      await supabase.cleanupCompletedTasks();
      console.log('🧹 Cleaned up completed tasks from database');
    } catch (error) {
      console.error('❌ Error cleaning up completed tasks:', error);
    }
  }

  // Start mention log cleanup timer
  startMentionLogCleanup() {
    setInterval(() => {
      this.cleanupMentionLog();
      this.cleanupCompletedTasks();
    }, 60 * 60 * 1000); // Every hour
  }

  // Start periodic task checking for long-term tasks
  startPeriodicTaskCheck() {
    // Check for due tasks every hour
    setInterval(() => {
      this.checkDueTasks();
    }, 60 * 60 * 1000); // Every hour
  }

  // Check for tasks that are due and execute them
  async checkDueTasks() {
    const now = Date.now();
    const dueTasks = [];

    // Find all tasks that are due
    for (const [taskId, task] of this.tasks.entries()) {
      if (now >= task.nextTime) {
        dueTasks.push(taskId);
      }
    }

    // Execute due tasks
    for (const taskId of dueTasks) {
      console.log(`⏰ Found due task ${taskId}, executing...`);
      await this.executeRepost(taskId);
    }

    if (dueTasks.length > 0) {
      console.log(`✅ Executed ${dueTasks.length} due task(s)`);
    }
  }

  // Check if user has exceeded mention rate limit
  async checkMentionRateLimit(pubkey) {
    try {
      const count = await supabase.getMentionCount(pubkey);
      if (count >= SPAM_LIMITS.MAX_MENTIONS_PER_HOUR) {
        return false;
      }
      
      await supabase.logMention(pubkey);
      return true;
    } catch (error) {
      console.error('❌ Error checking mention rate limit:', error);
      return false;
    }
  }

  // Check if user has exceeded task limit for minutely/hourly/daily intervals
  async checkUserTaskLimit(pubkey, interval) {
    // Only apply limits to minutely, hourly and daily intervals
    if (interval !== 'minutely' && interval !== 'hourly' && interval !== 'daily') {
      return true;
    }
    
    try {
      const currentCount = await supabase.getUserTaskCount(pubkey);
      return currentCount < SPAM_LIMITS.MAX_TASKS_PER_USER_HOURLY_DAILY;
    } catch (error) {
      console.error('❌ Error checking user task limit:', error);
      return false;
    }
  }

  // Increment user task count for minutely/hourly/daily intervals
  async incrementUserTaskCount(pubkey, interval) {
    if (interval === 'minutely' || interval === 'hourly' || interval === 'daily') {
      try {
        await supabase.incrementUserTaskCount(pubkey);
      } catch (error) {
        console.error('❌ Error incrementing user task count:', error);
      }
    }
  }

  // Check if total tasks limit is exceeded
  checkTotalTasksLimit() {
    return this.tasks.size < SPAM_LIMITS.MAX_TOTAL_TASKS;
  }

  // Check if task already exists for this user and event
  checkDuplicateTask(pubkey, originalEventId) {
    for (const [taskId, task] of this.tasks.entries()) {
      if (task.mentioner.pubkey === pubkey && task.originalEvent.id === originalEventId) {
        return true;
      }
    }
    return false;
  }

  // Cancel tasks for a user
  async cancelUserTasks(pubkey) {
    let cancelledCount = 0;

    // First, clear any in-memory tasks and timeouts
    for (const [taskId, task] of this.tasks.entries()) {
      if (task.mentioner.pubkey === pubkey) {
        // Clear timeout
        const timeout = this.timeouts.get(taskId);
        if (timeout) clearTimeout(timeout);
        this.timeouts.delete(taskId);
        this.tasks.delete(taskId);
      }
    }

    // Then delete all tasks from database, including those with repetitions = 0
    try {
      cancelledCount = await supabase.deleteUserTasks(pubkey);
      
      // Decrement user task count for the user (we'll reset it on next load)
      try {
        await supabase.decrementUserTaskCount(pubkey);
      } catch (error) {
        console.error('❌ Error decrementing user task count:', error);
      }
    } catch (error) {
      console.error('❌ Error deleting tasks from database:', error);
    }

    if (cancelledCount > 0) {
      console.log(`❌ Cancelled ${cancelledCount} tasks for user ${shortId(pubkey)}`);
    }

    return cancelledCount;
  }

  // Cancel a specific task for a user by event ID
  async cancelSpecificTask(pubkey, originalEventId) {
    console.log(`🚫 Cancelling specific task for user ${shortId(pubkey)} and event ${shortId(originalEventId)}`);
    let cancelledCount = 0;

    // First, clear any in-memory tasks and timeouts for this specific event
    for (const [taskId, task] of this.tasks.entries()) {
      if (task.mentioner.pubkey === pubkey && task.originalEvent.id === originalEventId) {
        console.log(`🗑️  Found in-memory task ${taskId} to cancel`);
        // Clear timeout
        const timeout = this.timeouts.get(taskId);
        if (timeout) clearTimeout(timeout);
        this.timeouts.delete(taskId);
        this.tasks.delete(taskId);
        cancelledCount++;
      }
    }
    
    console.log(`💾 Cancelled ${cancelledCount} in-memory tasks`);

    // Then delete the specific task from database
    try {
      console.log(`🗄️  Attempting to delete from database...`);
      const dbCancelledCount = await supabase.deleteTaskByEventId(pubkey, originalEventId);
      console.log(`🗄️  Database deletion returned: ${dbCancelledCount} tasks`);
      cancelledCount = Math.max(cancelledCount, dbCancelledCount);
      
      // Decrement user task count if we cancelled a task
      if (cancelledCount > 0) {
        try {
          await supabase.decrementUserTaskCount(pubkey);
          console.log(`📊 Decremented user task count for ${shortId(pubkey)}`);
        } catch (error) {
          console.error('❌ Error decrementing user task count:', error);
        }
      }
    } catch (error) {
      console.error('❌ Error deleting specific task from database:', error);
    }

    if (cancelledCount > 0) {
      console.log(`❌ Cancelled ${cancelledCount} task(s) for user ${shortId(pubkey)} and event ${shortId(originalEventId)}`);
    }

    return cancelledCount;
  }

  // Publish to each relay individually
  async publishToRelays(event, context = 'event') {
    try {
      await Promise.any(this.pool.publish(this.relays, event));
      return 1;
    } catch (error) {
      throw new Error(`Publish failed on all relays for ${context}: ${String(error && error.message || error)}`);
    }
  }

  // Load tasks from Supabase
  async loadTasks() {
    try {
      // First, clean up any orphaned completed tasks
      await this.cleanupCompletedTasks();
      
      const tasks = await supabase.loadTasks();
      for (const [id, task] of tasks.entries()) {
        this.tasks.set(id, task);
        this.scheduleTask(id, task);
      }
      console.log(`📂 Loaded ${this.tasks.size} tasks from Supabase`);
    } catch (error) {
      console.error('❌ Error loading tasks:', error);
    }
  }

  // Save tasks to Supabase
  async saveTasks() {
    try {
      await supabase.saveTasks(this.tasks);
    } catch (error) {
      console.error('❌ Error saving tasks:', error);
    }
  }

  // Schedule a single task
  scheduleTask(taskId, task) {
    const now = Date.now();
    const delay = Math.max(0, task.nextTime - now);
    
    // For short delays (≤ 1 day), use setTimeout for precise timing
    const SHORT_DELAY_THRESHOLD = 24 * 60 * 60 * 1000; // 1 day in milliseconds
    
    if (delay <= SHORT_DELAY_THRESHOLD) {
      // For short delays, use the exact timeout
      const timeout = setTimeout(() => {
        this.executeRepost(taskId);
      }, delay);
      this.timeouts.set(taskId, timeout);
      const nextDate = new Date(task.nextTime).toLocaleString();
      console.log(`⏰ Scheduled task ${taskId} for ${nextDate} (${Math.round(delay / 1000)}s delay)`);
    } else {
      // For long delays, rely on the periodic check (every hour)
      // No timeout needed - the periodic check will handle it
      const nextDate = new Date(task.nextTime).toLocaleString();
      console.log(`⏰ Scheduled long-term task ${taskId} for ${nextDate} (will be checked hourly)`);
    }
  }

  // Execute a repost task
     async executeRepost(taskId) {
     const task = this.tasks.get(taskId);
     if (!task) return;

     try {
       const now = Date.now();
       if (now < task.nextTime) {
         // Reschedule if called too early
         this.scheduleTask(taskId, task);
         return;
       }
       console.log(`🔄 Executing repost for task ${taskId}`);

      // Create kind 1 repost with message from template
      const repostMessageTemplate = getRandomMessage(REPOST_MESSAGES);
      const repostMessage = formatMessage(repostMessageTemplate, task.mentioner.name);
      
      // Create nevent URL for the original event
      const neventUrl = `nostr:${nip19.neventEncode({
        id: task.originalEvent.id,
        relays: this.relays
      })}`;
      
      // Build content with the repost message and nevent reference
      const repostContent = `${repostMessage}\n\n${neventUrl}`;
      
      const repostEvent = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        content: repostContent,
        tags: [
          ['e', task.originalEvent.id, this.relays[0] || '', 'mention'],
          ['p', task.originalEvent.pubkey],
          ['p', task.mentioner.pubkey]
        ]
      };

      const signedEvent = finalizeEvent(repostEvent, this.privateKey);

      // Publish repost to all relays (tolerate failures)
      const okCount = await this.publishToRelays(signedEvent, 'repost');
      console.log(`✅ Published repost for event ${task.originalEvent.id} (accepted by ${okCount} relays)`);

      // Send zap reply to the repost itself
      await this.sendZapReply(signedEvent);

      // Update task
      task.repetitions -= 1;

      if (task.repetitions > 0) {
        // Schedule next repost exactly one interval away
        task.nextTime = Date.now() + task.interval;
        this.tasks.set(taskId, task);
        await supabase.saveTasks(this.tasks);
        this.scheduleTask(taskId, task);
        console.log(`📊 Task ${taskId}: ${task.repetitions} repetitions remaining`);
      } else {
                 // Task completed
         try {
           // Delete from Supabase first
           await supabase.deleteTask(taskId);
           
           // Then clean up local state
           this.tasks.delete(taskId);
           const timeout = this.timeouts.get(taskId);
           if (timeout) clearTimeout(timeout);
           this.timeouts.delete(taskId);
           
                     // Decrement user task count for minutely/hourly/daily intervals
          if (task.interval === INTERVALS.minutely || task.interval === INTERVALS.hourly || task.interval === INTERVALS.daily) {
             const mentionerPubkey = task.mentioner.pubkey;
             try {
               await supabase.decrementUserTaskCount(mentionerPubkey);
             } catch (error) {
               console.error('❌ Error decrementing user task count:', error);
             }
           }
           
           console.log(`🎉 Task ${taskId} completed and removed`);
         } catch (error) {
           console.error('❌ Error cleaning up completed task:', error);
        }
      }
    } catch (error) {
      console.error(`❌ Error executing repost for task ${taskId}:`, error);
    }
  }

  // Send confirmation reply
  async sendConfirmation(mentionEvent, interval, repetitions, originalEvent) {
    let fullMessage;
    
    if (interval === 'cancelled') {
      fullMessage = `Cancelled ${repetitions} task${repetitions === 1 ? '' : 's'} for you.`;
    } else if (interval === 'duplicate_task') {
      fullMessage = `You already have a task scheduled for this event. Please wait for it to complete or cancel it first.`;
    } else if (interval === 'rate_limit_exceeded') {
      fullMessage = `You've exceeded the mention rate limit (10 mentions per hour). Please wait before trying again.`;
    } else if (interval === 'invalid_command') {
      fullMessage = getRandomMessage(INVALID_COMMAND_MESSAGES);
    } else if (interval === 'no_event_id') {
      fullMessage = `No original event found in your mention. Please reply to the event you want to repost.`;
    } else if (interval === 'no_task_to_cancel') {
      fullMessage = `No active task found to cancel for this event.`;
    } else if (interval === 'invalid_repetitions') {
      fullMessage = `Invalid repetition count. Please specify a valid number.`;
    } else if (interval === 'total_limit_exceeded') {
      fullMessage = `System is at maximum capacity. Please try again later.`;
    } else if (interval === 'user_limit_exceeded') {
      fullMessage = `You've reached the maximum number of active tasks (5) for this interval type.`;
    } else if (interval === 'event_not_found') {
      fullMessage = `The original event could not be found. It may have been deleted.`;
    } else if (interval === 'own_content') {
      fullMessage = `I can't repost my own content. Please mention me on someone else's post.`;
    } else if (interval === 'invalid_interval') {
      fullMessage = `Invalid interval specified. Use: minutely, hourly, daily, weekly, or monthly.`;
    } else if (interval === 'processing_error') {
      fullMessage = `Sorry, there was an error processing your request. Please try again.`;
    } else {
      const template = getRandomMessage(CONFIRMATION_MESSAGES);
      const base = template || 'Banger scheduled!';
      
      // Find the interval name by matching the millisecond value
      // Get the interval name from the command, not by comparing milliseconds
      const intervalName = interval;
      
      // Get the actual milliseconds value from INTERVALS
      const intervalMs = INTERVALS[interval];
      if (!intervalMs) {
        console.error('Invalid interval:', interval);
        return;
      }
      
      // Calculate next post date using the interval milliseconds
      const nextPostDate = new Date(Date.now() + intervalMs).toLocaleString();
      fullMessage = `${base} Scheduling ${intervalName} reposts for ${repetitions} ${repetitions === 1 ? 'time' : 'times'}. Next post will be on ${nextPostDate}.`;
    }

    // Build e-tags: include both root (original) and reply (mention)
    const eTags = [];
    if (originalEvent?.id) eTags.push(['e', originalEvent.id, '', 'root']);
    eTags.push(['e', mentionEvent.id, '', 'reply']);

    // Build p-tags: mentioner and original author, deduped
    const pSet = new Set();
    const pTags = [];
    if (mentionEvent?.pubkey && !pSet.has(mentionEvent.pubkey)) { pSet.add(mentionEvent.pubkey); pTags.push(['p', mentionEvent.pubkey]); }
    if (originalEvent?.pubkey && !pSet.has(originalEvent.pubkey)) { pSet.add(originalEvent.pubkey); pTags.push(['p', originalEvent.pubkey]); }

    const replyEvent = {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      content: fullMessage || 'Banger scheduled! ✅',
      tags: [...eTags, ...pTags]
    };

    const signedEvent = finalizeEvent(replyEvent, this.privateKey);
    try {
      const okCount = await this.publishToRelays(signedEvent, 'confirmation');
      console.log(`💬 Sent confirmation reply (accepted by ${okCount} relays)`);
    } catch (error) {
      console.error('❌ Error sending confirmation:', error);
    }
  }

  // Send zap reply to a repost
  async sendZapReply(repostEvent) {
    try {
      // Get a random zap message
      const zapMessage = getRandomMessage(ZAP_REPLY_MESSAGES);
      
      // Build e-tags: include both root (original event) and reply (repost)
      const eTags = [];
      
      // If the repost has an original event reference, use it as root
      const originalEventId = repostEvent.tags?.find(tag => tag[0] === 'e' && tag[3] === 'mention')?.[1];
      if (originalEventId) {
        eTags.push(['e', originalEventId, '', 'root']);
      }
      
      // Add the repost as the reply target
      eTags.push(['e', repostEvent.id, '', 'reply']);

      // Build p-tags: include the bot's own pubkey and any authors from the repost
      const pSet = new Set();
      const pTags = [];
      
      // Add the bot's pubkey
      if (!pSet.has(this.publicKey)) { 
        pSet.add(this.publicKey); 
        pTags.push(['p', this.publicKey]); 
      }
      
      // Add any authors from the repost's p-tags
      if (repostEvent.tags) {
        for (const tag of repostEvent.tags) {
          if (tag[0] === 'p' && !pSet.has(tag[1])) {
            pSet.add(tag[1]);
            pTags.push(['p', tag[1]]);
          }
        }
      }

      const zapReplyEvent = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        content: zapMessage,
        tags: [...eTags, ...pTags]
      };

      const signedEvent = finalizeEvent(zapReplyEvent, this.privateKey);
      const okCount = await this.publishToRelays(signedEvent, 'zap reply');
      console.log(`⚡ Sent zap reply to repost (accepted by ${okCount} relays)`);
    } catch (error) {
      console.error('❌ Error sending zap reply:', error);
    }
  }

  // Resolve a display-friendly name for a pubkey (display_name > name > short npub)
  async resolveDisplay(pubkey) {
    try {
      const meta = await this.pool.get(this.relays, { kinds: [0], authors: [pubkey] });
      if (meta && typeof meta.content === 'string') {
        try {
          const data = JSON.parse(meta.content);
          const display = data.display_name || data.name || '';
          if (display && typeof display === 'string') return display;
        } catch (_) { /* ignore JSON errors */ }
      }
    } catch (_) {
      // ignore network errors
    }
    // fallback to short npub
    try {
      const npub = nip19.npubEncode(pubkey);
      return shortId(npub);
    } catch (_) {
      return shortId(pubkey);
    }
  }

  // Process mention event
  async processMention(event) {
    console.log(`📨 Processing mention from ${nip19.npubEncode(event.pubkey)}`);
    if (event.pubkey === this.publicKey) {
      console.log('🤖 Skipping self-reply');
      return;
    }

    // Spam protection: Check mention rate limit
    if (!(await this.checkMentionRateLimit(event.pubkey))) {
      console.log('🚫 User exceeded mention rate limit (10/hour)');
      await this.sendConfirmation(event, 'rate_limit_exceeded', 0, null);
      return;
    }
    
    const command = parseCommand(event.content);
    if (!command) {
      console.log('❌ No valid banger command found');
      await this.sendConfirmation(event, 'invalid_command', 0, null);
      return;
    }

    // Handle cancel action first, before any other processing
    if (command.action === 'cancel') {
      // Get the original event ID from the mention
      const originalEventId = getOriginalEventId(event);
      if (!originalEventId) {
        console.log('❌ No original event ID found in tags for cancel command');
        await this.sendConfirmation(event, 'no_event_id', 0, null);
        return;
      }
      
      const cancelledCount = await this.cancelSpecificTask(event.pubkey, originalEventId);
      if (cancelledCount > 0) {
        // Fetch the original event for the confirmation reply
        try {
          const originalEvent = await this.pool.get(this.relays, { ids: [originalEventId] });
          await this.sendConfirmation(event, 'cancelled', cancelledCount, originalEvent);
        } catch (error) {
          console.error('❌ Error fetching original event for confirmation:', error);
          // Still send confirmation even if we can't fetch the original event
          await this.sendConfirmation(event, 'cancelled', cancelledCount, null);
        }
      } else {
        console.log('ℹ️  No task found to cancel for this event');
        await this.sendConfirmation(event, 'no_task_to_cancel', 0, null);
      }
      return;
    }



    const { interval, count } = command;

    // Determine repetitions based on count, cap at 3
    const repetitions = computeRepetitions(interval, count);
    if (!Number.isFinite(repetitions) || repetitions < 1) {
      console.log('❌ Could not compute repetitions from count');
      await this.sendConfirmation(event, 'invalid_repetitions', 0, null);
      return;
    }

    // For non-cancel commands, check original event and duplicates
    const originalEventId = getOriginalEventId(event);
    if (!originalEventId) {
      console.log('❌ No original event ID found in tags');
      await this.sendConfirmation(event, 'no_event_id', 0, null);
      return;
    }

    // Spam protection: Check for duplicate task (skip for cancel command)
    if (command.action !== 'cancel' && this.checkDuplicateTask(event.pubkey, originalEventId)) {
      console.log('🚫 Duplicate task already exists for this user and event');
      await this.sendConfirmation(event, 'duplicate_task', 0, null);
      return;
    }

    // Spam protection: Check total tasks limit
    if (!this.checkTotalTasksLimit()) {
      console.log('🚫 Total tasks limit exceeded (2,000,000)');
      await this.sendConfirmation(event, 'total_limit_exceeded', 0, null);
      return;
    }

    // Spam protection: Check user task limit for hourly/daily intervals
    if (!(await this.checkUserTaskLimit(event.pubkey, interval))) {
      console.log(`🚫 User exceeded task limit for ${interval} intervals (5 max)`);
      await this.sendConfirmation(event, 'user_limit_exceeded', 0, null);
      return;
    }
    try {
      const originalEvent = await this.pool.get(this.relays, { ids: [originalEventId] });
      if (!originalEvent) {
        console.log(`❌ Original event ${originalEventId} not found`);
        await this.sendConfirmation(event, 'event_not_found', 0, null);
        return;
      }
      if (originalEvent.pubkey === this.publicKey) {
        console.log('🤖 Skipping repost of own content');
        await this.sendConfirmation(event, 'own_content', 0, originalEvent);
        return;
      }

             const taskId = `${originalEventId}_${Date.now()}`;
       const intervalMs = INTERVALS[interval];
       if (!intervalMs) {
         console.error('Invalid interval:', interval);
         await this.sendConfirmation(event, 'invalid_interval', 0, null);
         return;
       }
       // Resolve mentioner display info
       const mentionerPubkey = event.pubkey;
       const mentionerNpub = (() => { try { return nip19.npubEncode(mentionerPubkey); } catch (_) { return null; } })();
       const mentionerName = await this.resolveDisplay(mentionerPubkey);
       // Schedule first repost exactly one interval away
       const now = Date.now();
       const task = {
         originalEvent,
         interval: intervalMs, // This matches the Supabase column interval_ms
         repetitions: repetitions,
         nextTime: now + intervalMs, // First repost after exactly one full interval
        createdAt: now,
        mentioner: {
          pubkey: mentionerPubkey,
          npub: mentionerNpub,
          name: mentionerName
        }
      };
             // Save to local state and Supabase
       try {
         this.tasks.set(taskId, task);
         await supabase.saveTasks(this.tasks);
         console.log(`💾 Task ${taskId} saved to database (${this.tasks.size} total tasks)`);
         
         // Schedule the task
         this.scheduleTask(taskId, task);
         
         // Increment user task count for hourly/daily intervals
         await this.incrementUserTaskCount(event.pubkey, interval);
       } catch (error) {
         console.error('❌ Error saving new task:', error);
         // Clean up local state if save failed
         this.tasks.delete(taskId);
         throw error;
       }
      
      await this.sendConfirmation(event, interval, repetitions, originalEvent);

      console.log(`✅ Created task ${taskId}: ${repetitions} ${interval} reposts`);
    } catch (error) {
      console.error('❌ Error processing mention:', error);
      // Send error confirmation to user
      try {
        await this.sendConfirmation(event, 'processing_error', 0, null);
      } catch (confirmError) {
        console.error('❌ Error sending error confirmation:', confirmError);
      }
    }
  }

  // Start the bot
  async start() {
    console.log('🚀 Starting Nostr Banger Repost Bot...');
    this.loadTasks();
    const subscription = this.pool.subscribeMany(
      this.relays,
      [
        {
          kinds: [1],
          '#p': [this.publicKey],
          since: Math.floor(Date.now() / 1000) - this.lookbackSeconds
        }
      ],
      {
        onevent: (event) => {
          this.processMention(event);
        },
        oneose: () => {
          console.log('📡 Connected to relays, listening for mentions...');
          console.log(`⏰ Subscription lookback window: ${this.lookbackSeconds} seconds`);
        },
        onclose: () => {
          console.log('📡 Subscription closed');
        }
      }
    );

    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down gracefully...');
      for (const timeout of this.timeouts.values()) clearTimeout(timeout);
      subscription.close();
      this.pool.close(this.relays);
      console.log('👋 Bot stopped');
      process.exit(0);
    });

    console.log(`🎯 Bot started! Mention @${nip19.npubEncode(this.publicKey)} with "banger! repeat weekly for 2 weeks" to schedule reposts.`);
    console.log('📡 Listening on relays:', this.relays.join(', '));
  }
}

module.exports = NostrBangerBot;
