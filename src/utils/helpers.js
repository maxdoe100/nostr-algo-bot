const { nip19 } = require('nostr-tools');

// Helper function to convert hex string to Uint8Array
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

// Shorten an identifier for display
function shortId(id) {
  if (!id || typeof id !== 'string') return 'unknown';
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

// Parse command from mention text
function parseCommand(content) {
  // Define interval mappings - both full forms and singular forms
  const intervalMappings = {
    'minutely': 'minutely',
    'minute': 'minutely',
    'minutes': 'minutely',
    'hourly': 'hourly', 
    'hour': 'hourly',
    'hours': 'hourly',
    'daily': 'daily',
    'day': 'daily', 
    'days': 'daily',
    'weekly': 'weekly',
    'week': 'weekly',
    'weeks': 'weekly',
    'monthly': 'monthly',
    'month': 'monthly',
    'months': 'monthly',
    'yearly': 'yearly',
    'year': 'yearly',
    'years': 'yearly'
  };
  
  const intervals = Object.keys(intervalMappings);
  const counts = {
    '1': 1, '2': 2, '3': 3, '4': 4, '5': 5,
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'a': 1, 'an': 1, 'once': 1, 'twice': 2, 'thrice': 3
  };

  // Check for cancel command - look for "cancel" anywhere in the content
  const cleaned = content.toLowerCase().replace(/[.,!?:;-]/g, ' ').trim();
  const words = cleaned.split(/\s+/).filter(w => w.length > 0);
  
  if (words.includes('cancel')) {
    console.log('Cancel command detected in content:', content);
    return { action: 'cancel' };
  }

  // Parse interval and count

  // Look for patterns like "repeat weekly for 3 weeks" or "weekly for 3 times"
  let interval = null;
  let count = null;

  // First try to find "repeat [interval] for [count]" pattern
  const repeatIndex = words.indexOf('repeat');
  if (repeatIndex !== -1 && repeatIndex + 1 < words.length) {
    const potentialInterval = words[repeatIndex + 1];
    if (intervals.includes(potentialInterval)) {
      interval = intervalMappings[potentialInterval];
      // Look for count after "for"
      const forIndex = words.indexOf('for', repeatIndex);
      if (forIndex !== -1 && forIndex + 1 < words.length) {
        const potentialCount = words[forIndex + 1];
        if (potentialCount in counts) {
          count = counts[potentialCount];
        } else if (!isNaN(potentialCount) && parseInt(potentialCount) > 0) {
          count = Math.min(parseInt(potentialCount), 5);
        }
      }
    }
  }

  // If not found, try simpler patterns
  if (!interval || !count) {
    // Find the first interval
    const intervalIndex = words.findIndex(w => intervals.includes(w));
    if (intervalIndex !== -1) {
      interval = intervalMappings[words[intervalIndex]];
      // Look for count near the interval
      for (let i = Math.max(0, intervalIndex - 3); i < Math.min(words.length, intervalIndex + 4); i++) {
        const word = words[i];
        if (word in counts) {
          count = counts[word];
          break;
        } else if (!isNaN(word) && parseInt(word) > 0) {
          count = Math.min(parseInt(word), 5);
          break;
        }
      }
    }
  }

  // If still not found, return null (no valid command)
  if (!interval || !count) {
    console.log('No valid command pattern found in content:', content);
    return null;
  }

  return { interval, count: Math.min(count, 5) };
}

// Get original event ID from mention tags
function getOriginalEventId(mentionEvent) {
  const eTags = mentionEvent.tags.filter((tag) => tag[0] === 'e');
  const replyTag = eTags.find((tag) => tag[3] === 'reply');
  if (replyTag) return replyTag[1];
  if (eTags.length > 0) return eTags[eTags.length - 1][1];
  return null;
}

// Compute repetitions from interval and count, capped to 5
function computeRepetitions(interval, count) {
  const MAX_REPS = 5;
  return Math.min(MAX_REPS, count);
}

module.exports = {
  hexToBytes,
  shortId,
  parseCommand,
  getOriginalEventId,
  computeRepetitions
};
