# Personal OS

A cloud-native AI assistant powered by Vercel AI SDK with access to 500+ apps via Rube MCP. Deploy to Vercel, connect to Slack, and let AI handle research, CRM updates, task creation, and more.

## Table of Contents

- [Architecture](#architecture)
- [How It Works](#how-it-works)
- [Features](#features)
- [Project Structure](#project-structure)
- [Setup Guide](#setup-guide)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Slack Integration](#slack-integration)
- [Customization](#customization)
- [Troubleshooting](#troubleshooting)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Slack                                                       │
│  - @mention in channels                                      │
│  - Direct messages                                           │
│  - Slash commands (/ask, /research, /task)                   │
│  - App Home with quick action buttons                        │
│  - Modal inputs for structured requests                      │
└──────────────────────┬──────────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  POST /api/slack/events                                      │
│  - Signature verification (HMAC-SHA256)                      │
│  - Event routing (mentions, DMs, commands, modals)           │
│  - Thread history for conversation context                   │
└──────────────────────┬──────────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Vercel AI SDK                                               │
│  - Model: Gemini 3 Flash via Vercel Gateway                  │
│  - Streaming text generation                                 │
│  - Tool calling with retry logic                             │
│  - Cost pre-flight checks                                    │
└──────────────────────┬──────────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Rube MCP (Composio)                                         │
│  - 500+ apps: Attio, Linear, Gmail, Calendar, Notion...     │
│  - OAuth handled by Composio                                 │
│  - Single HTTP endpoint for all tools                        │
└──────────────────────┬──────────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Slack Response                                              │
│  - Real-time streaming updates                               │
│  - Markdown → Slack mrkdwn conversion                        │
│  - Action confirmations with links                           │
└─────────────────────────────────────────────────────────────┘
```

### Why This Architecture?

- **Cloud-native**: Runs entirely on Vercel — no local machine required
- **Serverless**: Pay only for invocations, auto-scales with demand
- **500+ integrations**: Single MCP endpoint provides access to all apps
- **Real-time UX**: Streaming responses show progress in Slack
- **Cost-controlled**: Pre-flight token estimation prevents expensive requests

---

## How It Works

### Example Flow

```
You: @PersonalOS Research Stripe and their latest products

1. Slack sends event to POST /api/slack/events
2. Bot posts "Working..." status with spinner animation
3. executeTask() calls Gemini 3 Flash via Vercel Gateway
4. AI uses Rube MCP tools (Exa for research)
5. Streaming updates show progress in real-time
6. Final result posted with formatted Slack mrkdwn
```

### What You Can Do

| Command | What It Does |
|---------|--------------|
| `@bot [question]` | Ask anything in a channel (threaded response) |
| DM the bot | Private conversation with full context |
| `/ask [question]` | Quick private query (ephemeral response) |
| `/research [topic]` | Deep research, posts to channel |
| `/task [description]` | Create a Linear issue |
| App Home buttons | Open modals for structured input |

---

## Features

### AI Capabilities

- **Research**: Web search, company research, LinkedIn lookups via Exa
- **CRM**: Create/update contacts and deals in Attio
- **Tasks**: Create issues in Linear
- **Calendar**: Schedule events in Google Calendar
- **Email**: Read and send via Gmail
- **Notes**: Create pages in Notion
- **And 490+ more** via Rube MCP

### Slack Integration

- **App mentions**: Respond in threads with full context
- **Direct messages**: Private assistant conversations
- **Slash commands**: `/ask`, `/research`, `/task`
- **App Home**: Quick action buttons with modal inputs
- **Real-time updates**: Streaming text + tool progress animation
- **Thread context**: Maintains conversation history (last 20 messages)

### Production Features

- **Cost control**: Rejects requests estimated over $0.10
- **Retry logic**: Exponential backoff for rate limits
- **Signature verification**: HMAC-SHA256 for all Slack requests
- **Markdown conversion**: Auto-converts to Slack mrkdwn format
- **Error handling**: User-friendly error messages

---

## Project Structure

```
personal-os/
├── api/
│   ├── task.ts                 # HTTP endpoint (POST /api/task)
│   └── slack/
│       └── events.ts           # Slack webhook (POST /api/slack/events)
├── lib/
│   ├── ai.ts                   # AI orchestration + Rube MCP integration
│   ├── cost-control.ts         # Token estimation & budget enforcement
│   └── retry.ts                # Exponential backoff retry logic
├── config/
│   ├── profiles.yaml           # Profile definitions (future use)
│   └── mcps.yaml               # MCP configuration reference
├── workspace/
│   └── CLAUDE.md               # AI operating manual (customize this!)
├── scripts/
│   ├── dev.ts                  # Local dev server
│   └── ngrok.ts                # Tunnel for Slack webhooks
├── manifest.json               # Slack app manifest
├── vercel.json                 # Vercel function config (300s timeout)
├── tsconfig.json               # TypeScript config
└── package.json
```

### Key Files

| File | Purpose |
|------|---------|
| `api/slack/events.ts` | All Slack interactions — events, commands, modals |
| `lib/ai.ts` | AI execution with Gemini + Rube MCP tools |
| `lib/cost-control.ts` | Pre-flight cost estimation and rejection |
| `lib/retry.ts` | Retry with exponential backoff |
| `workspace/CLAUDE.md` | Customize AI behavior and preferences |

---

## Setup Guide

### Prerequisites

- Node.js 20+
- Vercel account
- Rube account (https://rube.app) with API token
- Slack workspace with permission to install apps

### Installation

```bash
# Clone and install
cd personal-os
npm install

# Copy environment template
cp .env.example .env.local

# Fill in your credentials (see Configuration section)
```

### Vercel Setup

```bash
# Install Vercel CLI
npm i -g vercel

# Link to your project
vercel link

# Deploy to preview
vercel deploy

# Deploy to production
vercel deploy --prod
```

### Slack App Setup

1. Go to https://api.slack.com/apps and create a new app
2. Use the manifest from `manifest.json` (update URLs to your Vercel deployment)
3. Install to your workspace
4. Copy Bot Token and Signing Secret to environment variables

---

## Configuration

### Environment Variables

```bash
# Required
RUBE_API_TOKEN=...              # From https://rube.app dashboard
SLACK_BOT_TOKEN=xoxb-...        # Slack Bot User OAuth Token
SLACK_SIGNING_SECRET=...        # Slack Signing Secret

# Optional
PERSONAL_OS_API_KEY=...         # Auth for /api/task endpoint
```

### Model Configuration

The AI model is configured in `lib/ai.ts`:

```typescript
model: gateway("google/gemini-3-flash")
```

To use a different model, update the gateway string. Available via Vercel Gateway:
- `google/gemini-3-flash` (current)
- `anthropic/claude-sonnet-4`
- `openai/gpt-4o`

### Cost Controls

In `lib/cost-control.ts`:

```typescript
const MAX_REQUEST_COST = 0.10;  // Maximum cost per request in USD
```

Requests estimated to exceed this are rejected with a user-friendly message.

---

## API Reference

### POST /api/slack/events

Single webhook for all Slack interactions.

**Handles:**
- URL verification challenge
- Event subscriptions (app_mention, message.im, app_home_opened)
- Slash commands (/ask, /research, /task)
- Block actions (button clicks)
- View submissions (modal submissions)

**Headers:**
- `x-slack-signature`: Request signature
- `x-slack-request-timestamp`: Request timestamp

### POST /api/task

HTTP endpoint for programmatic access.

**Headers:**
```
Content-Type: application/json
x-api-key: your-secret-key
```

**Request:**
```json
{
  "task": "Research Stripe and their API products",
  "context": {},
  "async": false
}
```

**Response:**
```json
{
  "id": "task_123",
  "status": "completed",
  "result": "Stripe is a payments infrastructure company...",
  "duration": 4500,
  "stepsUsed": 3
}
```

---

## Slack Integration

### Manifest Setup

Update `manifest.json` with your Vercel deployment URL:

```json
{
  "request_url": "https://your-app.vercel.app/api/slack/events"
}
```

### Event Subscriptions

The app subscribes to:
- `app_mention` — Bot mentioned in channels
- `message.im` — Direct messages
- `app_home_opened` — User opens App Home
- `assistant_thread_started` — Slack AI assistant threads

### Slash Commands

| Command | Description |
|---------|-------------|
| `/ask` | Private query with ephemeral response |
| `/research` | Research topic, posts result to channel |
| `/task` | Create a Linear issue |

### App Home

The App Home displays:
- Quick action buttons (Research, Task, Ask)
- Clicking opens a modal for structured input
- Results sent via DM

---

## Customization

### System Prompt

The AI's behavior is defined in `lib/ai.ts` in the `SYSTEM_PROMPT` constant. Key sections:

- **Identity**: Who the AI is and who it serves
- **Formatting**: Slack mrkdwn rules
- **Response style**: Direct, actionable, no fluff
- **Tool preferences**: Which tools to use for what
- **Action confirmations**: Format for completed actions

### Adding New Tools

All tools come from Rube MCP. To add new integrations:

1. Go to https://rube.app and connect the app
2. The tools automatically become available
3. Update the system prompt to guide usage

### Changing the Model

In `lib/ai.ts`, update the model:

```typescript
model: gateway("anthropic/claude-sonnet-4")  // or other models
```

Note: Also update `lib/cost-control.ts` with appropriate pricing.

---

## Troubleshooting

### "Invalid signature"

- Verify `SLACK_SIGNING_SECRET` is correct
- Check request timestamp isn't too old (>5 min)

### "Missing RUBE_API_TOKEN"

- Set the environment variable in Vercel dashboard
- Redeploy after adding env vars

### Slack not responding

- Check Vercel function logs for errors
- Verify webhook URL in Slack app settings
- Ensure bot has required scopes

### Request rejected (too expensive)

- The request context is too large
- Break into smaller questions
- Reduce thread history

### Tools not working

- Check Rube dashboard for connection status
- Verify OAuth for the specific app
- Check Vercel logs for MCP errors

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Vercel Functions (Node.js 20) |
| AI SDK | Vercel AI SDK v6 |
| Model | Gemini 3 Flash via Vercel Gateway |
| Tools | Rube MCP (Composio) — 500+ apps |
| Slack | @slack/web-api |
| Language | TypeScript 5.7 |

---

## License

MIT

---

## Contributing

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Submit a PR

For major changes, open an issue first to discuss.
