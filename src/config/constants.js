// Configuration
const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://relay.primal.net',
  'wss://relay.snort.social',
  'wss://nostr.wine',
  'wss://relay.current.fyi',
  'wss://relay.nostr.info',
  'wss://offchain.pub',
  'wss://relay.bitcoin.social',
  'wss://nostr.bitcoiner.social',
  'wss://relay.nostr.com',
  'wss://relay.nostrich.land',
  'wss://relay.nostr.net',
  'wss://relay.nostr.land',
  'wss://relay.nostr.uno',
  'wss://relay.nostr.zone',
  'wss://relay.nostr.watch',
  'wss://relay.nostr.bg',
  'wss://relay.nostr.ch'
];

// Spam protection limits
const SPAM_LIMITS = {
  MAX_TOTAL_TASKS: 2000000,
  MAX_MENTIONS_PER_HOUR: 10
};

// Interval mappings (in milliseconds)
const INTERVALS = {
  minutely: 60 * 1000,                // 1 minute
  hourly: 60 * 60 * 1000,            // 1 hour
  daily: 24 * 60 * 60 * 1000,        // 1 day
  weekly: 7 * 24 * 60 * 60 * 1000,   // 7 days
  monthly: 30 * 24 * 60 * 60 * 1000, // 30 days
  yearly: 365 * 24 * 60 * 60 * 1000  // 365 days
};

module.exports = {
  DEFAULT_RELAYS,
  SPAM_LIMITS,
  INTERVALS
};
