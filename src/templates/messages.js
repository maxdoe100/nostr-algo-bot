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

// Get a random message from an array
function getRandomMessage(messages) {
  return messages[Math.floor(Math.random() * messages.length)];
}

// Format a message with mentioner
function formatMessage(template, mentioner) {
  return template.replace('{mentioner}', mentioner);
}

module.exports = {
  CONFIRMATION_MESSAGES,
  REPOST_MESSAGES,
  getRandomMessage,
  formatMessage
};
