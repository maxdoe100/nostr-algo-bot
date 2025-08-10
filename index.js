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

// Configuration
const TASKS_FILE = path.join(__dirname, 'tasks.json');
const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://relay.primal.net'
];

// Interval mappings (in milliseconds)
const INTERVALS = {
  weekly: 7 * 24 * 60 * 60 * 1000, // 7 days
  monthly: 30 * 24 * 60 * 60 * 1000, // 30 days
  yearly: 365 * 24 * 60 * 60 * 1000 // 365 days
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

      // Create repost event (kind 6)
      const repostEvent = {
        kind: 6,
        created_at: Math.floor(Date.now() / 1000),
        content: `Banger alert! Reposting this gem.\n\n${JSON.stringify(task.originalEvent)}`,
        tags: [
          ['e', task.originalEvent.id, '', 'mention'],
          ['p', task.originalEvent.pubkey]
        ]
      };

      const signedEvent = finalizeEvent(repostEvent, this.privateKey);

      // Publish to all relays (tolerate PoW-required relays)
      const okCount = await this.publishToRelays(signedEvent, 'repost');
      console.log(`✅ Published repost for event ${task.originalEvent.id} (accepted by ${okCount} relays)`);

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
        this.saveTasks();
        console.log(`🎉 Task ${taskId} completed and removed`);
      }
    } catch (error) {
      console.error(`❌ Error executing repost for task ${taskId}:`, error);
    }
  }

  // Parse command from mention text - flexible and compact
  parseCommand(content) {
    // Normalize: lowercase, collapse spaces
    const normalized = String(content || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

    // Single regex: optional "banger," "repeat," "for," articles; capture interval, count, optional unit
    const match = normalized.match(
      /(?:banger|(?:that'?s|this is|it'?s)?\s*(?:a|an)?\s*banger\s*)?(?:repeat\s*)?(weekly|monthly|yearly)(?:\s*for)?\s*(a|an|one|once|twice|thrice|\d+)(?:\s*(weeks?|months?|years?|times?))?/i
    );

    if (!match) return null;

    const [, interval, countToken, unitTokenRaw] = match;

    // Map textual counts to numbers
    let count;
    if (/^(a|an|one|once)$/i.test(countToken)) count = 1;
    else if (/^twice$/i.test(countToken)) count = 2;
    else if (/^thrice$/i.test(countToken)) count = 3;
    else count = parseInt(countToken, 10);

    if (!Number.isFinite(count) || count < 1) return null;

    // Normalize unit; default to 'times' when omitted
    let unit = (unitTokenRaw || 'times').toLowerCase();
    if (unit.startsWith('week')) unit = 'weeks';
    else if (unit.startsWith('month')) unit = 'months';
    else if (unit.startsWith('year')) unit = 'years';
    else if (unit.startsWith('time')) unit = 'times';

    return { interval: interval.toLowerCase(), durationCount: count, durationUnit: unit };
  }

  // Compute repetitions from interval and duration, capped to 3
  computeRepetitions(interval, durationCount, durationUnit) {
    const MAX_REPS = 3;

    if (durationUnit === 'times') {
      return Math.min(MAX_REPS, durationCount);
    }

    const intervalMs = INTERVALS[interval];
    if (!intervalMs) return null;

    const UNIT_MS = {
      weeks: 7 * 24 * 60 * 60 * 1000,
      months: 30 * 24 * 60 * 60 * 1000,
      years: 365 * 24 * 60 * 60 * 1000
    };

    const durationMs = (UNIT_MS[durationUnit] || 0) * durationCount;
    if (durationMs <= 0) return null;

    let reps = Math.floor(durationMs / intervalMs);
    if (reps < 1) reps = 1;
    return Math.min(MAX_REPS, reps);
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
  async sendConfirmation(mentionEvent, interval, repetitions) {
    const message = CONFIRMATION_MESSAGES[Math.floor(Math.random() * CONFIRMATION_MESSAGES.length)];
    const fullMessage = `${message} Scheduling ${interval} reposts for ${repetitions} ${repetitions === 1 ? 'time' : 'times'}.`;

    const replyEvent = {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      content: fullMessage,
      tags: [
        ['e', mentionEvent.id, '', 'reply'],
        ['p', mentionEvent.pubkey]
      ]
    };

    const signedEvent = finalizeEvent(replyEvent, this.privateKey);
    try {
      const okCount = await this.publishToRelays(signedEvent, 'confirmation');
      console.log(`💬 Sent confirmation reply (accepted by ${okCount} relays)`);
    } catch (error) {
      console.error('❌ Error sending confirmation:', error);
    }
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
    const command = this.parseCommand(event.content);
    if (!command) {
      console.log('❌ No valid banger command found');
      return;
    }

    const { interval, durationCount, durationUnit } = command;

    // Determine repetitions based on duration and interval, cap at 3
    const repetitions = this.computeRepetitions(interval, durationCount, durationUnit);
    if (!Number.isFinite(repetitions) || repetitions < 1) {
      console.log('❌ Could not compute repetitions from duration');
      return;
    }

    const originalEventId = this.getOriginalEventId(event);
    if (!originalEventId) {
      console.log('❌ No original event ID found in tags');
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
      const jitter = (Math.random() - 0.5) * 4 * 60 * 60 * 1000; // ±2 hours
      const task = {
        originalEvent,
        interval: intervalMs,
        repetitions,
        nextTime: Date.now() + intervalMs + jitter,
        createdAt: Date.now()
      };
      this.tasks.set(taskId, task);
      this.saveTasks();
      this.scheduleTask(taskId, task);
      await this.sendConfirmation(event, interval, repetitions);
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
