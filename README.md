# Nostr Banger Bot

A Nostr bot that helps you repost your favorite content on a schedule.

## Features

- Schedule reposts with flexible intervals (hourly, daily, weekly, monthly, yearly)
- Specify number of reposts (1-5)
- Spam protection and rate limiting
- Persistent storage with Supabase

## Setup

1. Create a Supabase project at https://supabase.com
2. Run the database migrations in `supabase/migrations/`
3. Copy `.env.example` to `.env` and fill in your configuration:
   ```
   # Nostr configuration
   BOT_NSEC=your_bot_nsec_key
   NOSTR_RELAYS=wss://relay.damus.io,wss://nos.lol,wss://relay.nostr.band,wss://relay.primal.net
   LOOKBACK_SECONDS=1800

   # Supabase configuration
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   ```

4. Install dependencies:
   ```bash
   npm install
   ```

5. Start the bot:
   ```bash
   node index.js
   ```

## Usage

Mention the bot with commands like:
- `@bot banger! repeat weekly for 2 times`
- `@bot daily 3`
- `@bot hourly one`
- `@bot cancel` (cancels all your scheduled reposts)

## Limits

- Maximum 5 tasks per user for hourly/daily intervals
- Unlimited tasks for weekly/monthly/yearly intervals
- Maximum 10 mentions per hour per user
- Maximum 2,000,000 total tasks
- No duplicate tasks for the same event by the same user

## Development

1. Install Docker Desktop
2. Initialize Supabase locally:
   ```bash
   supabase init
   supabase start
   ```

3. Run migrations:
   ```bash
   supabase db reset
   ```

## License

MIT
