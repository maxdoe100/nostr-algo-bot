# Nostr Banger Repost Bot: Development Brief

## Project Overview

The Nostr Banger Repost Bot is an open-source, automated JavaScript-based application designed to enhance content visibility on the Nostr protocol, a decentralized social network lacking algorithmic feeds. The bot listens for user mentions in reply events, parses commands to schedule periodic reposts of specified "banger" (high-quality) posts, and executes reposts at defined intervals for a limited number of repetitions (max 3 per request). This addresses the ephemeral nature of Nostr events by resurfacing valuable content over time.

The bot's core use case: A user (User 1) discovers a compelling post (from User 2), replies to it while mentioning the bot, and includes a command like "Banger! repeat weekly for 5 weeks." The bot caps at 3 repetitions, confirms the request with a humorous reply (e.g., "You are right, that's a banger! Scheduling weekly reposts for 3 weeks."), and schedules automated reposts of the original post every week for 3 iterations, with each repost at a varied time of day to avoid flooding timelines. Each repost is a new Nostr event (kind 6) that embeds the original content and includes the word "banger" in its text for branding/context.

The project emphasizes simplicity, modularity, and open-source principles, hosted on GitHub under an MIT license. It starts as a Minimum Viable Product (MVP) focused on core functionality: mention detection, command parsing, scheduling, reposting, and confirmation replies.

## Technical Architecture

- **Runtime Environment**: Node.js (v18+ recommended) for server-side execution, enabling event-driven WebSocket connections and asynchronous operations.
- **Nostr Integration**: Utilizes the `nostr-tools` npm library (including `nip19` for nsec parsing) for core Nostr primitives, including event creation, signing (with nsec private keys via `getHexPrivateKey`), subscription filters, and publishing. The bot connects to a pool of public relays using `SimplePool` for redundancy and fault tolerance.
- **State Management**: In-memory task queue with JSON file persistence (`tasks.json`) for scheduled reposts. Each task stores the original event JSON, interval in milliseconds, remaining repetitions (capped at 3), and next execution timestamp. On startup, tasks are loaded and individually scheduled.
- **Scheduling Mechanism**: Uses per-task chained `setTimeout` for precise, non-blocking execution. Each task runs its own timer based on `nextTime - now`. To spread reposts and keep feeds interesting:
  - Initial `nextTime` = now + interval.
  - Add random jitter: ±2 hours to each `nextTime` for variation around the target time. Intervals are mapped as:
  - Weekly: 7 days (604,800,000 ms)
  - Monthly: 30 days (2,592,000,000 ms, approximate; calendar-aware logic can be added later)
  - Yearly: 365 days (31,536,000,000 ms, approximate) "Daily" is not supported to avoid spam. Repetitions are capped at 3 and decremented after each repost; tasks are removed when repetitions reach zero. This scales to thousands of tasks efficiently (Node.js event loop handles many timeouts without issue) and provides millisecond precision.
- **Deployment**: Runs as a persistent Node.js process (e.g., via PM2 for production). Environment variables handle sensitive data like the bot's private key (nsec format).
- **Error Handling and Resilience**: Automatic relay reconnection via `SimplePool`, duplicate mention ignoring (e.g., skip self-replies), and logging for debugging. No rate limiting or spam filtering in MVP to keep scope minimal.

## Key Components

1. **Identity and Security**:

   - Bot uses a provided nsec private key, parsed to hex using `nostr-tools/nip19` for signing.
   - All events are signed using `finalizeEvent` to ensure authenticity.
   - Public key (npub) derived for mention filtering.

2. **Event Subscription**:

   - Subscribes to kind 1 (text note) events via WebSocket, filtering for "#p" tags matching the bot's pubkey and events since startup (to avoid historical backlog).
   - Uses `subscribeMany` for multi-relay efficiency.

3. **Command Parsing**:

   - Regex-based matching on event content for patterns like `/banger.*repeat (weekly|monthly|yearly) for (\d+) (weeks?|months?|years?)/i`.
   - Extracts interval type, repetition count (capped at 3), and infers original post ID from the mention event's "e" tags (preferring "reply" marker or last "e" tag).

4. **Fetching and Validation**:

   - Retrieves the original event using `pool.get` by ID.
   - Validates existence and non-self origin before scheduling.

5. **Reposting Logic**:

   - Creates a kind 6 repost event embedding the original JSON in content, with tags referencing the original ("e" and "p").
   - Adds custom content like "Banger alert! Reposting this gem." to the repost.
   - Publishes via `pool.publish` to all relays.

6. **Confirmation Reply**:

   - Immediately publishes a kind 1 reply to the mention event, tagged appropriately, with randomized humorous text from a list (e.g., \["You are right, that's a banger!", "This will be even better the second time!"\]).

7. **Persistence and Shutdown**:

   - Saves tasks on add/update; loads on start.
   - Graceful handling of SIGINT to close subscriptions and pool.

## Functionality Flow

1. Bot starts, loads tasks, connects to relays (defaults: wss://relay.damus.io, wss://nos.lol, wss://relay.nostr.band), schedules all tasks individually, and subscribes to mentions.
2. On mention event: Parse command; if valid "banger" format, fetch original, cap repetitions at 3, calculate initial `nextTime` with jitter, create task, save state, schedule the task, and send confirmation.
3. On timer trigger: Publish repost, decrement repetitions, if &gt;0 update `nextTime` with new interval + jitter, reschedule timer, save state.
4. Repeat until repetitions exhausted; remove task when done.

## Tech Stack and Dependencies

- **Core**: Node.js, `nostr-tools` (including `nip19` for nsec), `ws` (WebSocket polyfill).
- **Optional for Prod**: `dotenv` for env vars, PM2 for process management.
- **No External Services**: Fully self-contained; no databases, APIs, or cloud dependencies.

## Development Roadmap

- **MVP Implementation**: Focus on the above; testable in \~100 lines of code.
- **Testing**: Manual via Nostr clients (e.g., Damus); simulate mentions and verify reposts.
- **Future Enhancements**: Advanced parsing (e.g., custom phrases), exact calendar intervals, task cancellation commands, logging dashboard.
- **Risks**: Relay unreliability (mitigated by pool), key security (user-managed), potential loops (prevented by self-ignore).

This brief provides a high-level technical foundation for implementation. Next steps: Prototype code in `index.js`, set up GitHub repo, and iterate based on testing.