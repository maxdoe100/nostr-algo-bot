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
  'Try: "repeat weekly for 2 weeks" or "cancel"',
  'Format: "repeat [interval] for [count] [unit]"',
  'Example: "repeat daily for 3 days" or "cancel"',
  'Use: "repeat hourly/daily/weekly for X hours/days/weeks"',
  'Command: "repeat [minutely/hourly/daily/weekly/monthly] for [number] [units]"',
  'Try: "repeat monthly for 1 month" or "cancel"',
  'Format: "repeat [interval] for [count] [unit]" - Reply to a post first!',
  'Example: "repeat daily for 5 days" or "cancel"',
  'Use: "repeat [interval] for [count] [unit]" - Reply to content you want reposted',
  'Command: "repeat [interval] for [count] [unit]" or "cancel"'
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

// Zap reply messages for reposts
const ZAP_REPLY_MESSAGES = [
  '⚡ Zap to keep the bot alive! Every sat counts! 💎',
  '💡 Value flows where value grows! Zap this bot! ⚡',
  '🔋 Zapping powers the algorithm! Send some sats! ⚡',
  '⚡ Your zaps fuel the banger machine! Keep it running! 🔥',
  '💎 Premium content deserves premium zaps! Show some love! ⚡',
  '⚡ Zapping is caring! Support the bot with sats! 💖',
  '🔌 Electricity bills don\'t pay themselves! Zap away! ⚡',
  '⚡ Every zap adds value to the network! Keep zapping! 💎',
  '💡 Zapping = supporting quality content! Send sats! ⚡',
  '⚡ The bot appreciates your zaps! Every sat matters! 💎',
  '🔋 Zapping keeps the vibes alive! Power the bot! ⚡',
  '⚡ Your sats power the banger algorithm! Keep flowing! 💎',
  '💡 Value for value! Zap to keep the content flowing! ⚡',
  '🔌 Server costs are real! Zap to keep the bot running! ⚡',
  '⚡ Every zap is a vote for quality content! 💎',
  '💡 Zapping = supporting the creators! Send sats! ⚡',
  '⚡ The bot runs on pure electricity and zaps! 🔋',
  '💎 Your zaps create more value! Keep the cycle going! ⚡',
  '⚡ Zapping is the ultimate form of appreciation! 💖',
  '🔋 Power the banger machine with your zaps! ⚡',
  '⚡ Every sat you zap multiplies the value! 💎',
  '💡 Zapping = supporting the ecosystem! Send sats! ⚡',
  '⚡ The bot loves your zaps! Keep them coming! 💎',
  '🔌 Zapping powers the content revolution! ⚡',
  '⚡ Your sats fuel the algorithm! Keep zapping! 💎',
  '💡 Value flows where value is created! Zap this! ⚡',
  '⚡ Zapping is the new way to show love! 💖',
  '🔋 Every zap keeps the bot buzzing! ⚡',
  '⚡ Your zaps are the lifeblood of the bot! 💎',
  '💡 Zapping = supporting quality curation! ⚡',
  '⚡ The bot thrives on your zaps! Keep flowing! 💎'
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
  ZAP_REPLY_MESSAGES,
  getRandomMessage,
  formatMessage
};
