// Fun confirmation messages
const CONFIRMATION_MESSAGES = [
  "You are right, that's a banger! ⚡",
  'This will be even better the second time! ⚡',
  "🔥🔥🔥 Absolute fire tweet! Let's spread it! ⚡",
  "That's some premium content right there! ⚡",
  'Certified banger detected! 🔥⚡',
  'This deserves more eyeballs for sure! ⚡',
  'Quality content never gets old! ⚡',
  'Time to give this gem another spotlight!',
  'This tweet is too good to be forgotten! 💎⚡',
  'Pure gold that needs to shine again! ✨⚡ ',
  'A classic that deserves a comeback! 🎯⚡',
  'This is the content we live for! 🚀⚡',
  'Second time\'s the charm, third time\'s the banger! 🎭',
  'Like fine wine, this tweet gets better with age! 🍷⚡',
  'The sequel is always better than the original! 🎬⚡',
  'You are the algorithm now! 🤖⚡',
  'Breaking the algorithm with this one! 💥⚡',
  'Your algorithm is having a moment! 🎭⚡'
];

// Invalid command help messages
const INVALID_COMMAND_MESSAGES = [
  '🤖 Oops! Try: "repeat weekly for 2 weeks" or "cancel"',
  '💡 Format: "repeat [interval] for [count] [unit]" - Reply to a post first!',
  '✨ Example: "repeat daily for 3 days" or "cancel"',
  '🎯 Use: "repeat hourly/daily/weekly for X hours/days/weeks"',
  '🚀 Command: "repeat [minutely/hourly/daily/weekly/monthly] for [number] [units]"',
  '💎 Try: "repeat monthly for 1 month" or "cancel"',
  '⚡ Format: "repeat [interval] for [count] [unit]" - Reply to content you want reposted',
  '🔥 Example: "repeat daily for 5 days" or "cancel"',
  '🎭 Use: "repeat [interval] for [count] [unit]" or "cancel"',
  '🌟 Need help? Try: "repeat weekly for 2 weeks" or "cancel"'
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
  '{mentioner} being the algo now. 🤖✅',
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
  INVALID_COMMAND_MESSAGES,
  REPOST_MESSAGES,
  getRandomMessage,
  formatMessage
};
