// Fun confirmation messages
const CONFIRMATION_MESSAGES = [
  "You are right, that's a banger! ⚡ (Consider zapping to keep the algo alive! ⚡)",
  'This will be even better the second time! ⚡ (Electricity bills don\'t pay themselves 👀)',
  "🔥🔥🔥 Absolute fire tweet! Let's spread it! ⚡ (Zap to keep the fire burning! 🔥)",
  "That's some premium content right there! ⚡ (Premium content deserves premium zaps! ⚡)",
  'Certified banger detected! 🔥⚡ (Server costs are real, but worth it! 😄)',
  'This deserves more eyeballs for sure! ⚡ (More eyeballs = more zaps needed! 👀)',
  'Quality content never gets old! ⚡ (But zaps keep the bot young! ⚡)',
  'Time to give this gem another spotlight! (Bot needs coffee too ☕⚡)',
  'This tweet is too good to be forgotten! 💎⚡ (Zap to keep the memory alive! 💎)',
  'Pure gold that needs to shine again! ✨⚡ (Gold content needs gold zaps! ✨)',
  'A classic that deserves a comeback! 🎯⚡ (Hosting ain\'t free, but vibes are! 🎉)',
  'This is the content we live for! 🚀⚡ (Zap to fuel the rocket! 🚀)',
  'Second time\'s the charm, third time\'s the banger! 🎭⚡ (Third time\'s the zap charm! ⚡)',
  'Like fine wine, this tweet gets better with age! 🍷⚡ (Electricity bills age too 👀)',
  'The sequel is always better than the original! 🎬⚡ (Sequel zaps are even better! ⚡)',
  'You are the algorithm now! 🤖⚡ (Human algo knows what\'s good! 🧠⚡)',
  'Breaking the algorithm with this one! 💥⚡ (Your algo can\'t resist this banger! 🤖⚡)',
  'Your algorithm is having a moment! 🎭⚡ (Even human algos have feelings! ❤️⚡)'
];

// Funny repost messages (templated)
const REPOST_MESSAGES = [
  'This banger is brought to you by {mentioner}. 🔥',
  'Curated by {mentioner}. ✨',
  'Blame {mentioner} for this much heat. 🔥⚡',
  '{mentioner} requested this banger to resurface. 🚀',
  'Sponsored by {mentioner}\'s great taste. 👌',
  'Certified by {mentioner}. Proceed to vibe. 🎯',
  'Courtesy of {mentioner}\'s impeccable taste. 👌💎',
  'Another masterpiece discovered by {mentioner}. 🎨✨',
  'Thanks to {mentioner} for this gem! 💎⚡',
  'Brought back by popular demand from {mentioner}. 📢🎉',
  '{mentioner} beeing the algo now. 🤖✅',
  'The algo loves this, thanks to {mentioner}. 🧠❤️',
  'No algo, no problem thanks to {mentioner}. 💥🤖'
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
