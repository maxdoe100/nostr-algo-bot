const { SimplePool, finalizeEvent, getPublicKey, nip19 } = require('nostr-tools');
const supabase = require('../../supabase');
const { DEFAULT_RELAYS, SPAM_LIMITS, INTERVALS } = require('../config/constants');
const { hexToBytes, shortId, parseCommand, getOriginalEventId, computeRepetitions } = require('../utils/helpers');
const { CONFIRMATION_MESSAGES, REPOST_MESSAGES, getRandomMessage, formatMessage } = require('../templates/messages');

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

  // Start mention log cleanup timer
  startMentionLogCleanup() {
    setInterval(() => {
      this.cleanupMentionLog();
    }, 60 * 60 * 1000); // Every hour
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

  // Check if user has exceeded task limit for hourly/daily intervals
  async checkUserTaskLimit(pubkey, interval) {
    // Only apply limits to hourly and daily intervals
    if (interval !== 'hourly' && interval !== 'daily') {
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

  // Increment user task count for hourly/daily intervals
  async incrementUserTaskCount(pubkey, interval) {
    if (interval === 'hourly' || interval === 'daily') {
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
    const tasksToCancel = [];

    for (const [taskId, task] of this.tasks.entries()) {
      if (task.mentioner.pubkey === pubkey) {
        tasksToCancel.push(taskId);
      }
    }

    for (const taskId of tasksToCancel) {
      const task = this.tasks.get(taskId);
      if (task) {
        // Clear timeout
        const timeout = this.timeouts.get(taskId);
        if (timeout) clearTimeout(timeout);
        this.timeouts.delete(taskId);

        // Decrement user task count for hourly/daily intervals
        if (task.interval === INTERVALS.hourly || task.interval === INTERVALS.daily) {
          try {
            await supabase.decrementUserTaskCount(pubkey);
          } catch (error) {
            console.error('❌ Error decrementing user task count:', error);
          }
        }

        // Remove task
        try {
          await supabase.deleteTask(taskId);
          this.tasks.delete(taskId);
          cancelledCount++;
        } catch (error) {
          console.error('❌ Error deleting task:', error);
        }
      }
    }

    if (cancelledCount > 0) {
      console.log(`❌ Cancelled ${cancelledCount} tasks for user ${shortId(pubkey)}`);
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
    const timeout = setTimeout(() => {
      this.executeRepost(taskId);
    }, delay);
    this.timeouts.set(taskId, timeout);
    const nextDate = new Date(task.nextTime).toLocaleString();
    console.log(`⏰ Scheduled task ${taskId} for ${nextDate} (${Math.round(delay / 1000)}s delay)`);
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

      // Strict NIP-18 repost (kind 6): content must be the JSON of the original event only
      const repostEvent = {
        kind: 6,
        created_at: Math.floor(Date.now() / 1000),
        content: JSON.stringify(task.originalEvent),
        tags: [
          ['e', task.originalEvent.id],
          ['p', task.originalEvent.pubkey]
        ]
      };

      const signedEvent = finalizeEvent(repostEvent, this.privateKey);

      // Publish strict repost to all relays (tolerate failures)
      const okCount = await this.publishToRelays(signedEvent, 'repost');
      console.log(`✅ Published repost for event ${task.originalEvent.id} (accepted by ${okCount} relays)`);

      

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
           
           // Decrement user task count for hourly/daily intervals
           if (task.interval === INTERVALS.hourly || task.interval === INTERVALS.daily) {
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
    // Check for duplicate mentions in Supabase
    try {
      const count = await supabase.getMentionCount(event.id);
      if (count > 0) {
        console.log('🔄 Duplicate mention detected; skipping');
        return;
      }
      await supabase.logMention(event.id);
    } catch (error) {
      console.error('❌ Error checking for duplicate mention:', error);
      return;
    }
    console.log(`📨 Processing mention from ${nip19.npubEncode(event.pubkey)}`);
    if (event.pubkey === this.publicKey) {
      console.log('🤖 Skipping self-reply');
      return;
    }

    // Spam protection: Check mention rate limit
    if (!this.checkMentionRateLimit(event.pubkey)) {
      console.log('🚫 User exceeded mention rate limit (10/hour)');
      return;
    }
    const command = parseCommand(event.content);
    if (!command) {
      console.log('❌ No valid banger command found');
      return;
    }

    // Handle cancel action
    if (command.action === 'cancel') {
      const cancelledCount = await this.cancelUserTasks(event.pubkey);
      if (cancelledCount > 0) {
        await this.sendConfirmation(event, 'cancelled', cancelledCount, null);
      } else {
        console.log('ℹ️  No tasks found to cancel for user');
      }
      return;
    }

    const { interval, count } = command;

    // Determine repetitions based on count, cap at 3
    const repetitions = computeRepetitions(interval, count);
    if (!Number.isFinite(repetitions) || repetitions < 1) {
      console.log('❌ Could not compute repetitions from count');
      return;
    }

    const originalEventId = getOriginalEventId(event);
    if (!originalEventId) {
      console.log('❌ No original event ID found in tags');
      return;
    }

    // Spam protection: Check for duplicate task
    if (this.checkDuplicateTask(event.pubkey, originalEventId)) {
      console.log('🚫 Duplicate task already exists for this user and event');
      return;
    }

    // Spam protection: Check total tasks limit
    if (!this.checkTotalTasksLimit()) {
      console.log('🚫 Total tasks limit exceeded (2,000,000)');
      return;
    }

    // Spam protection: Check user task limit for hourly/daily intervals
    if (!this.checkUserTaskLimit(event.pubkey, interval)) {
      console.log(`🚫 User exceeded task limit for ${interval} intervals (5 max)`);
      return;
    }
    try {
      const originalEvent = await this.pool.get(this.relays, { ids: [originalEventId] });
      if (!originalEvent) {
        console.log(`❌ Original event ${originalEventId} not found`);
        return;
      }
      if (originalEvent.pubkey === this.publicKey) {
        console.log('🤖 Skipping repost of own content');
        return;
      }

             const taskId = `${originalEventId}_${Date.now()}`;
       const intervalMs = INTERVALS[interval];
       if (!intervalMs) {
         console.error('Invalid interval:', interval);
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
