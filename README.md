# Nostr Algo Bot 🤖

A Nostr bot that automatically schedules and reposts "banger" posts at specified intervals. Built with Node.js and Supabase for persistent storage.

## Features

- **Automated Reposting**: Schedule posts to be reposted at various intervals (minutely, hourly, daily, weekly, monthly, yearly)
- **Spam Protection**: Built-in rate limiting to prevent abuse
- **Persistent Storage**: Uses Supabase to store tasks and mention logs
- **Real-time Processing**: Listens to Nostr relays for mentions and commands
- **Flexible Scheduling**: Support for custom intervals and repetition counts

## Quick Start

### Prerequisites

- Node.js 18.0.0 or higher
- A Nostr private key (nsec1 format or 64-char hex)
- Supabase project (for database storage)

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd banger-bot2
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env
```

4. Configure your environment variables:
```env
BOT_NSEC=your_nostr_private_key_here
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
NOSTR_RELAYS=wss://relay.damus.io,wss://nos.lol
```

5. Set up your Supabase database by running the migrations:
```bash
npx supabase db push
```

6. Start the bot:
```bash
npm start
```

## Usage

### Bot Commands

The bot responds to mentions with the following commands:

- `@bot <interval> [repetitions]` - Schedule a repost
- `@bot cancel` - Cancel the scheduled task of the same event

**Note**: Users are limited to 10 active tasks for minutely, hourly, and daily intervals combined. Weekly, monthly, and yearly tasks have no per-user limits.

### Examples

```
@bot daily 5
@bot hourly 3
@bot every hour 5 times
@bot cancel
```

### Supported Intervals

- `minutely` - Every minute
- `hourly` - Every hour  
- `daily` - Every day
- `weekly` - Every week
- `monthly` - Every month
- `yearly` - Every year

## Configuration

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `BOT_NSEC` | Nostr private key (nsec1 or hex) | Yes | - |
| `SUPABASE_URL` | Supabase project URL | Yes | - |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | Yes | - |
| `NOSTR_RELAYS` | Comma-separated list of relays | No | Default relays |


### Spam Limits

- Maximum 10 mentions per hour
- Maximum 2,000,000 total tasks
- Maximum 10 minutely/hourly/daily tasks per user (weekly/monthly/yearly unlimited)


### Manual Deployment

```bash
npm install
npm start
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

If you encounter any issues or have questions, please open an issue on GitHub. Zap the bot to support ⚡!

---

**Note**: This bot is designed for educational and personal use. Please respect Nostr community guidelines and avoid spam.
