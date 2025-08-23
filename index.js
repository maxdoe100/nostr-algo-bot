#!/usr/bin/env node

require('dotenv').config();

// Ensure WebSocket exists in Node environments
try {
  if (typeof WebSocket === 'undefined') {
    // eslint-disable-next-line global-require
    globalThis.WebSocket = require('ws');
  }
} catch (_) {
  // ignore
}

const { SimplePool, finalizeEvent, getPublicKey, nip19 } = require('nostr-tools');
const fs = require('fs');
const path = require('path');

// Helper function to convert hex string to Uint8Array
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

// Configuration
const TASKS_FILE = path.join(__dirname, 'tasks.json');
const MENTION_LOG_FILE = path.join(__dirname, 'mention_log.json');
const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://relay.primal.net'
];

// Spam protection limits
const SPAM_LIMITS = {
  MAX_TASKS_PER_USER_HOURLY_DAILY: 5,
  MAX_TOTAL_TASKS: 2000000,
  MAX_MENTIONS_PER_HOUR: 10
};

// Interval mappings (in milliseconds)
const INTERVALS = {
  hourly: 60 * 60 * 1000,            // 1 hour
  daily: 24 * 60 * 60 * 1000,        // 1 day
  weekly: 7 * 24 * 60 * 60 * 1000,   // 7 days
  monthly: 30 * 24 * 60 * 60 * 1000, // 30 days
  yearly: 365 * 24 * 60 * 60 * 1000  // 365 days
};

// Fun confirmation messages
const CONFIRMATION_MESSAGES = [
  "You are right, that's a banger!",
  'This will be even better the second time!',
  "🔥🔥🔥 Absolute fire tweet! Let's spread it!",
  "That's some premium content right there!",
  'Certified banger detected! 🔥',
  'This deserves more eyeballs for sure!',
  'Quality content never gets old!',
  'Time to give this gem another spotlight!'
];

// Funny repost messages (templated)
const REPOST_MESSAGES = [
  'This banger is brought to you by {mentioner}.',
  'Curated by {mentioner}.',
  'Blame {mentioner} for this much heat. 🔥',
  '{mentioner} requested this banger to resurface.',
  'Sponsored by {mentioner}\'s great taste.',
  'Certified by {mentioner}. Proceed to vibe.'
];

class NostrBangerBot {
  constructor() {
    this.pool = new SimplePool();
    this.tasks = new Map();
    this.timeouts = new Map();
    this.processedMentions = new Set();
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

    // Persistent handled mentions store
    this.handledMentionsFile = path.join(__dirname, 'handled.json');
    this.handledMentions = new Set();
    this.loadHandledMentions();

    // Spam protection data structures
    this.mentionLog = new Map(); // pubkey -> array of timestamps
    this.userTaskCounts = new Map(); // pubkey -> count of hourly/daily tasks
    this.loadMentionLog();
    this.loadUserTaskCounts();

    // Start mention log cleanup every hour
    this.startMentionLogCleanup();

    console.log(`🔑 Bot initialized with pubkey: ${nip19.npubEncode(this.publicKey)}`);
  }

  // Load handled mention IDs from disk
  loadHandledMentions() {
    try {
      if (fs.existsSync(this.handledMentionsFile)) {
        const raw = fs.readFileSync(this.handledMentionsFile, 'utf8');
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          for (const id of arr) this.handledMentions.add(id);
        }
      }
    } catch (error) {
      console.warn('⚠️  Failed to load handled mentions file; continuing empty.', error);
    }
  }

  // Save handled mention IDs to disk (keeps recent up to 1000)
  saveHandledMentions() {
    try {
      const ids = Array.from(this.handledMentions);
      const recent = ids.slice(-1000);
      fs.writeFileSync(this.handledMentionsFile, JSON.stringify(recent, null, 2));
    } catch (error) {
      console.warn('⚠️  Failed to save handled mentions file.', error);
    }
  }

  // Load mention log from disk
  loadMentionLog() {
    try {
      if (fs.existsSync(MENTION_LOG_FILE)) {
        const raw = fs.readFileSync(MENTION_LOG_FILE, 'utf8');
        const data = JSON.parse(raw);
        if (typeof data === 'object') {
          for (const [pubkey, timestamps] of Object.entries(data)) {
            this.mentionLog.set(pubkey, timestamps);
          }
        }
      }
    } catch (error) {
      console.warn('⚠️  Failed to load mention log file; continuing empty.', error);
    }
  }

  // Save mention log to disk
  saveMentionLog() {
    try {
      const data = Object.fromEntries(this.mentionLog);
      fs.writeFileSync(MENTION_LOG_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
      console.warn('⚠️  Failed to save mention log file.', error);
    }
  }

  // Load user task counts from disk
  loadUserTaskCounts() {
    try {
      const userTaskCountsFile = path.join(__dirname, 'user_task_counts.json');
      if (fs.existsSync(userTaskCountsFile)) {
        const raw = fs.readFileSync(userTaskCountsFile, 'utf8');
        const data = JSON.parse(raw);
        if (typeof data === 'object') {
          for (const [pubkey, count] of Object.entries(data)) {
            this.userTaskCounts.set(pubkey, count);
          }
        }
      }
    } catch (error) {
      console.warn('⚠️  Failed to load user task counts file; continuing empty.', error);
    }
  }

  // Save user task counts to disk
  saveUserTaskCounts() {
    try {
      const userTaskCountsFile = path.join(__dirname, 'user_task_counts.json');
      const data = Object.fromEntries(this.userTaskCounts);
      fs.writeFileSync(userTaskCountsFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.warn('⚠️  Failed to save user task counts file.', error);
    }
  }

  // Clean up old mention log entries (older than 1 hour)
  cleanupMentionLog() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    let cleanedCount = 0;

    for (const [pubkey, timestamps] of this.mentionLog.entries()) {
      const recentTimestamps = timestamps.filter(timestamp => timestamp > oneHourAgo);
      if (recentTimestamps.length !== timestamps.length) {
        this.mentionLog.set(pubkey, recentTimestamps);
        cleanedCount += timestamps.length - recentTimestamps.length;
      }
      // Remove empty entries
      if (recentTimestamps.length === 0) {
        this.mentionLog.delete(pubkey);
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} old mention log entries`);
      this.saveMentionLog();
    }
  }

  // Start mention log cleanup timer
  startMentionLogCleanup() {
    setInterval(() => {
      this.cleanupMentionLog();
    }, 60 * 60 * 1000); // Every hour
  }

  // Check if user has exceeded mention rate limit
  checkMentionRateLimit(pubkey) {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    
    let userMentions = this.mentionLog.get(pubkey) || [];
    
    // Remove old entries
    userMentions = userMentions.filter(timestamp => timestamp > oneHourAgo);
    
    // Check if user has exceeded limit
    if (userMentions.length >= SPAM_LIMITS.MAX_MENTIONS_PER_HOUR) {
      return false;
    }
    
    // Add current mention
    userMentions.push(now);
    this.mentionLog.set(pubkey, userMentions);
    this.saveMentionLog();
    
    return true;
  }

  // Check if user has exceeded task limit for hourly/daily intervals
  checkUserTaskLimit(pubkey, interval) {
    // Only apply limits to hourly and daily intervals
    if (interval !== 'hourly' && interval !== 'daily') {
      return true;
    }
    
    const currentCount = this.userTaskCounts.get(pubkey) || 0;
    return currentCount < SPAM_LIMITS.MAX_TASKS_PER_USER_HOURLY_DAILY;
  }

  // Increment user task count for hourly/daily intervals
  incrementUserTaskCount(pubkey, interval) {
    if (interval === 'hourly' || interval === 'daily') {
      const currentCount = this.userTaskCounts.get(pubkey) || 0;
      this.userTaskCounts.set(pubkey, currentCount + 1);
      this.saveUserTaskCounts();
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
  cancelUserTasks(pubkey) {
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
          const currentCount = this.userTaskCounts.get(pubkey) || 0;
          if (currentCount > 0) {
            this.userTaskCounts.set(pubkey, currentCount - 1);
          }
        }

        // Remove task
        this.tasks.delete(taskId);
        cancelledCount++;
      }
    }

    if (cancelledCount > 0) {
      this.saveTasks();
      this.saveUserTaskCounts();
      console.log(`❌ Cancelled ${cancelledCount} tasks for user ${this.shortId(pubkey)}`);
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

  // Load tasks from persistent storage
  loadTasks() {
    try {
      if (fs.existsSync(TASKS_FILE)) {
        const data = fs.readFileSync(TASKS_FILE, 'utf8');
        const tasks = JSON.parse(data);
        for (const [id, task] of Object.entries(tasks)) {
          this.tasks.set(id, task);
          this.scheduleTask(id, task);
        }
        console.log(`📂 Loaded ${this.tasks.size} tasks from storage`);
      }
    } catch (error) {
      console.error('❌ Error loading tasks:', error);
    }
  }

  // Save tasks to persistent storage
  saveTasks() {
    try {
      const tasksObj = Object.fromEntries(this.tasks);
      fs.writeFileSync(TASKS_FILE, JSON.stringify(tasksObj, null, 2));
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

      // Optional: publish a separate kind-1 note with a fun message referencing the original
      const mentionerHandle = task.mentioner?.name || this.shortId(task.mentioner?.npub || task.mentioner?.pubkey || 'unknown');
      const messageTemplate = REPOST_MESSAGES[Math.floor(Math.random() * REPOST_MESSAGES.length)];
      const message = messageTemplate.replace('{mentioner}', mentionerHandle);

      const noteETags = [ ['e', task.originalEvent.id, '', 'reply'] ];
      const pSet = new Set([task.originalEvent.pubkey]);
      const notePTags = [ ['p', task.originalEvent.pubkey] ];
      if (task.mentioner?.pubkey && !pSet.has(task.mentioner.pubkey)) {
        pSet.add(task.mentioner.pubkey);
        notePTags.push(['p', task.mentioner.pubkey]);
      }

      const promoNote = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        content: `Banger alert! ${message}`,
        tags: [...noteETags, ...notePTags]
      };
      const signedPromo = finalizeEvent(promoNote, this.privateKey);
      await this.publishToRelays(signedPromo, 'promo-note');

      // Update task
      task.repetitions -= 1;

      if (task.repetitions > 0) {
        // Calculate next execution time with jitter (±2 hours)
        const jitter = (Math.random() - 0.5) * 4 * 60 * 60 * 1000;
        task.nextTime = Date.now() + task.interval + jitter;
        this.tasks.set(taskId, task);
        this.saveTasks();
        this.scheduleTask(taskId, task);
        console.log(`📊 Task ${taskId}: ${task.repetitions} repetitions remaining`);
      } else {
        // Task completed
        this.tasks.delete(taskId);
        const timeout = this.timeouts.get(taskId);
        if (timeout) clearTimeout(timeout);
        this.timeouts.delete(taskId);
        
        // Decrement user task count for hourly/daily intervals
        if (task.interval === INTERVALS.hourly || task.interval === INTERVALS.daily) {
          const mentionerPubkey = task.mentioner.pubkey;
          const currentCount = this.userTaskCounts.get(mentionerPubkey) || 0;
          if (currentCount > 0) {
            this.userTaskCounts.set(mentionerPubkey, currentCount - 1);
            this.saveUserTaskCounts();
          }
        }
        
        this.saveTasks();
        console.log(`🎉 Task ${taskId} completed and removed`);
      }
    } catch (error) {
      console.error(`❌ Error executing repost for task ${taskId}:`, error);
    }
  }

  // Parse command from mention text - simplified version
  parseCommand(content) {
    const intervals = ['hourly', 'daily', 'weekly', 'monthly', 'yearly'];
    const counts = {
      '1': 1, '2': 2, '3': 3, '4': 4, '5': 5,
      'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
      'a': 1, 'an': 1, 'once': 1, 'twice': 2, 'thrice': 3
    };

    // Check for cancel command
    const cleaned = content.toLowerCase().replace(/[.,!?:;-]/g, ' ').trim();
    if (cleaned === 'cancel') {
      console.log('Cancel command detected in content:', content);
      return { action: 'cancel' };
    }

    // Parse interval and count
    const words = cleaned.split(/\s+/).filter(w => w.length > 0);

    // Find the first interval
    const intervalIndex = words.findIndex(w => intervals.includes(w));
    if (intervalIndex === -1) {
      console.log('No interval found, defaulting to weekly 3:', content);
      return { interval: 'weekly', count: 3 };
    }

    const interval = words[intervalIndex];

    // Look for the first count after the interval
    for (let i = intervalIndex + 1; i < words.length; i++) {
      const word = words[i];
      if (word in counts) {
        let count = counts[word];
        // Optionally skip 'times' if it's the next word
        if (i + 1 < words.length && words[i + 1] === 'times') {
          i++;
        }
        return { interval, count: Math.min(count, 5) };
      }
    }

    console.log('No count found, defaulting to weekly 3:', content);
    return { interval: 'weekly', count: 3 };
  }

  // Compute repetitions from interval and count, capped to 3
  computeRepetitions(interval, count) {
    const MAX_REPS = 3;
    return Math.min(MAX_REPS, count);
  }

  // Get original event ID from mention tags
  getOriginalEventId(mentionEvent) {
    const eTags = mentionEvent.tags.filter((tag) => tag[0] === 'e');
    const replyTag = eTags.find((tag) => tag[3] === 'reply');
    if (replyTag) return replyTag[1];
    if (eTags.length > 0) return eTags[eTags.length - 1][1];
    return null;
  }

  // Send confirmation reply
  async sendConfirmation(mentionEvent, interval, repetitions, originalEvent) {
    let fullMessage;
    
    if (interval === 'cancelled') {
      fullMessage = `Cancelled ${repetitions} task${repetitions === 1 ? '' : 's'} for you.`;
    } else {
      const template = CONFIRMATION_MESSAGES[Math.floor(Math.random() * CONFIRMATION_MESSAGES.length)];
      const base = template || 'Banger scheduled!';
      fullMessage = `${base} Scheduling ${interval} reposts for ${repetitions} ${repetitions === 1 ? 'time' : 'times'}.`;
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
      return this.shortId(npub);
    } catch (_) {
      return this.shortId(pubkey);
    }
  }

  shortId(id) {
    if (!id || typeof id !== 'string') return 'unknown';
    if (id.length <= 12) return id;
    return `${id.slice(0, 8)}…${id.slice(-4)}`;
  }

  // Process mention event
  async processMention(event) {
    if (this.processedMentions.has(event.id) || this.handledMentions.has(event.id)) {
      console.log('🔄 Duplicate mention detected; skipping');
      return;
    }
    this.processedMentions.add(event.id);
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
    const command = this.parseCommand(event.content);
    if (!command) {
      console.log('❌ No valid banger command found');
      return;
    }

    // Handle cancel action
    if (command.action === 'cancel') {
      const cancelledCount = this.cancelUserTasks(event.pubkey);
      if (cancelledCount > 0) {
        await this.sendConfirmation(event, 'cancelled', cancelledCount, null);
      } else {
        console.log('ℹ️  No tasks found to cancel for user');
      }
      return;
    }

    const { interval, count } = command;

    // Determine repetitions based on count, cap at 3
    const repetitions = this.computeRepetitions(interval, count);
    if (!Number.isFinite(repetitions) || repetitions < 1) {
      console.log('❌ Could not compute repetitions from count');
      return;
    }

    const originalEventId = this.getOriginalEventId(event);
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
      // Resolve mentioner display info
      const mentionerPubkey = event.pubkey;
      const mentionerNpub = (() => { try { return nip19.npubEncode(mentionerPubkey); } catch (_) { return null; } })();
      const mentionerName = await this.resolveDisplay(mentionerPubkey);
      const jitter = (Math.random() - 0.5) * 4 * 60 * 60 * 1000; // ±2 hours
      const task = {
        originalEvent,
        interval: intervalMs,
        repetitions: repetitions,
        nextTime: Date.now() + intervalMs + jitter,
        createdAt: Date.now(),
        mentioner: {
          pubkey: mentionerPubkey,
          npub: mentionerNpub,
          name: mentionerName
        }
      };
      this.tasks.set(taskId, task);
      this.saveTasks();
      this.scheduleTask(taskId, task);
      
      // Increment user task count for hourly/daily intervals
      this.incrementUserTaskCount(event.pubkey, interval);
      
      await this.sendConfirmation(event, interval, repetitions, originalEvent);
      // Mark mention as handled persistently
      this.handledMentions.add(event.id);
      this.saveHandledMentions();
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

// Main execution
if (require.main === module) {
  const bot = new NostrBangerBot();
  bot.start().catch(console.error);
}

module.exports = NostrBangerBot;
