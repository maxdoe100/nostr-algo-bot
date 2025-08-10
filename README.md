# Nostr Banger Repost Bot 🚀

An automated JavaScript bot that enhances content visibility on the Nostr protocol by scheduling periodic reposts of high-quality "banger" posts. The bot listens for user mentions, parses repost commands, and executes scheduled reposts with randomized timing to keep feeds interesting.

## 🌟 Features

- **Automated Reposting**: Schedule reposts of quality content at weekly, monthly, or yearly intervals
- **Smart Command Parsing**: Natural language commands like "Banger! repeat weekly for 3 weeks"
- **Jitter Timing**: Adds ±2 hours of randomness to prevent timeline flooding
- **Repetition Limits**: Caps reposts at 3 per request to prevent spam
- **Persistent Tasks**: Saves scheduled tasks to survive bot restarts
- **Multi-Relay Support**: Connects to multiple Nostr relays for redundancy
- **Graceful Shutdown**: Properly handles process termination

## 🛠️ Installation

### Prerequisites

- Node.js v18+ 
- A Nostr private key (nsec format)

### Setup

1. **Clone or download the bot files:**
   ```powershell
   # If using git
   git clone <repository-url>
   cd banger-bot
   
   # Or download the files directly
   ```

2. **Install dependencies:**
   ```powershell
   npm install
   ```

3. **Configure environment:**
   ```bash
   # Copy the example environment file
   copy env.example .env
   
   # Edit .env and add your private key
   notepad .env
   ```

4. **Set your private key:**
   Add your private key to the `.env` file. You can provide either `BOT_NSEC` (preferred), or legacy `PRIVATE_KEY`/`NOSTR_PRIVATE_KEY`:
   ```
   BOT_NSEC=nsec1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   # or legacy
   # PRIVATE_KEY=nsec1...
   # NOSTR_PRIVATE_KEY=nsec1...
   ```

   > ⚠️ **Security Note**: Keep your private key secret! Never commit it to version control.

## 🚀 Usage

### Starting the Bot

```powershell
# Start the bot
npm start

# Or run directly
node index.js
```

The bot will:
- Load any existing scheduled tasks
- Connect to Nostr relays
- Start listening for mentions
- Display its public key for reference

### Using the Bot

To schedule a repost, mention the bot in a reply to the post you want to repost:

```
@bot Banger! repeat weekly for 3 weeks
@bot repeat the banger weekly for 2 months
@bot that's a banger. monthly for a year
@bot weekly for 1 week
@bot banger yearly 1 year
```

#### Command Format

The bot recognizes many flexible command patterns. Here are examples of what works:

**Standard formats:**
- `@bot Banger! repeat weekly for 3 weeks`
- `@bot repeat the banger weekly for 2 months`
- `@bot repeat that banger weekly for 2 months`
- `@bot banger weekly for 3 weeks`
- `@bot repeat weekly for 2 weeks`

**Natural language variations:**
- `@bot that's a banger. monthly for a year`
- `@bot This is a banger! repeat yearly for 1 year`
- `@bot It's a banger weekly for 2 weeks`
- `@bot That's an banger. monthly for a year`

**Minimal formats:**
- `@bot weekly for 1 week`
- `@bot monthly 2 months`
- `@bot yearly 1 year`

**Without "for":**
- `@bot banger repeat weekly 2 weeks`
- `@bot repeat banger monthly 3 months`
- `@bot banger yearly 1 year`

**Key features:**
- Case insensitive
- Flexible word order and spacing
- Accepts "a" or "an" before "banger"
- Works with or without "repeat"
- Works with or without "for"
- Handles various punctuation and emojis

#### Supported Intervals

- **Weekly**: Every 7 days
- **Monthly**: Every 30 days  
- **Yearly**: Every 365 days

> 📝 **Note**: Daily intervals are not supported to prevent spam

#### Limitations

- Maximum 3 repetitions per request
- Bot won't repost its own content
- Requires the original post to be accessible via relays

### Bot Responses

When you request a repost, the bot will:
1. **Validate** the command and fetch the original post
2. **Reply** with a confirmation message
3. **Schedule** the reposts with randomized timing
4. **Execute** reposts at the scheduled intervals

Example bot responses:
- "You are right, that's a banger! Scheduling weekly reposts for 3 weeks."
- "This will be even better the second time! Scheduling weekly reposts for 2 weeks."
- "🔥🔥🔥 Absolute fire tweet! Let's spread it! Scheduling monthly reposts for 2 months."
- "Certified banger detected! 🔥 Scheduling yearly reposts for 1 year."

## 📁 File Structure

```
banger-bot/
├── index.js           # Main bot logic
├── package.json       # Dependencies and scripts
├── env.example       # Environment configuration template
├── tasks.json        # Persistent task storage (auto-generated)
└── README.md         # This file
```

## ⚙️ Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BOT_NSEC` | Yes | Bot's private key (nsec1... or 64-char hex) |
| `PRIVATE_KEY` | No | Legacy env var for nsec private key |
| `NOSTR_PRIVATE_KEY` | No | Legacy env var for nsec private key |
| `NOSTR_RELAYS` | No | Comma-separated relays to override defaults |
| `LOOKBACK_SECONDS` | No | Subscription lookback window (default 1800) |

### Relays

The bot connects to these public relays by default:
- `wss://relay.damus.io`
- `wss://nos.lol`
- `wss://relay.nostr.band`
- `wss://relay.primal.net`

You can override with a comma-separated list:
```
NOSTR_RELAYS=wss://relay.damus.io,wss://nos.lol
```

## 🔧 Technical Details

### Architecture

- **Runtime**: Node.js with event-driven WebSocket connections
- **Nostr Library**: `nostr-tools` for all Nostr operations
- **State Management**: Map-based tasks with JSON persistence
- **Scheduling**: Individual `setTimeout` per task
- **Publishing**: Per-relay publishing with PoW-tolerance
- **Error Handling**: Automatic relay reconnection and graceful degradation

### Task Persistence

Scheduled tasks are saved to `tasks.json` and include:
- Original event data
- Interval and repetition settings
- Next execution timestamp
- Creation timestamp

### Timing and Jitter

- **Base Intervals**: Week (7d), Month (30d), Year (365d)
- **Jitter**: ±2 hours random variation
- **Precision**: Millisecond-level scheduling
- **Subscription Lookback**: `LOOKBACK_SECONDS` (default 1800)

## 🛡️ Security Considerations

- **Private Key**: Store securely, never share or commit to repositories
- **Relay Trust**: Connects to public relays - ensure they're trustworthy
- **Rate Limiting**: Built-in spam prevention with repetition caps
- **Self-Protection**: Won't repost own content to prevent loops

## 🐛 Troubleshooting

### Common Issues

**Bot won't start:**
- Check that `PRIVATE_KEY` is set and in valid nsec format
- Ensure Node.js v18+ is installed
- Verify all dependencies are installed with `npm install`

**Not receiving mentions:**
- Confirm the bot's public key is correct
- Check relay connections
- Ensure mentions include the bot's npub/pubkey

**Reposts not working:**
- Verify original post exists and is accessible
- Check relay publishing permissions
- Review console logs for error messages

### Debug Mode

The bot provides detailed console logging:
- ✅ Success operations
- ⚠️ Warnings and caps applied  
- ❌ Errors and failures
- 📊 Periodic status updates

## 🤝 Contributing

This is an open-source project! Contributions are welcome:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

MIT License - see the LICENSE file for details.

## 🔮 Future Enhancements

Potential improvements for future versions:
- Custom repost content and phrases
- Exact calendar-based intervals  
- Task cancellation commands
- Web dashboard for task management
- Advanced scheduling options
- Custom relay configuration

## 📞 Support

For issues, questions, or suggestions:
- Open an issue on GitHub
- Check the troubleshooting section above
- Review the console logs for error details

---

**Happy reposting! 📡✨**
