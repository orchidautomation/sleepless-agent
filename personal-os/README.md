# Personal Life OS

A cloud-based personal AI assistant powered by Claude Code running in Vercel Sandboxes. Fire off ideas from anywhere (HTTP, Slack, voice memos), and it orchestrates your tools (CRM, calendar, notes, etc.) to make things happen.

**Key idea**: Instead of loading all your MCPs at once (which confuses Claude), this system routes tasks to specific "profiles" that load only the relevant MCPs. A `CLAUDE.md` file acts as Claude's "operating manual" for your life.

## Table of Contents

- [Architecture](#architecture)
- [How It Works](#how-it-works)
- [Project Structure](#project-structure)
- [Setup Guide](#setup-guide)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Customization](#customization)
- [Development Phases](#development-phases)
- [Extending the System](#extending-the-system)
- [Troubleshooting](#troubleshooting)

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Inputs (anywhere)                                      │
│  - HTTP API (webhooks, Zapier, iOS Shortcuts)          │
│  - Slack commands (future)                             │
│  - Voice memo transcription (future)                   │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│  POST /api/task                                         │
│  1. Authenticate request                               │
│  2. Route task → select MCP profile                    │
│  3. Spin up Vercel Sandbox                             │
│  4. Load CLAUDE.md + relevant MCPs only                │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│  Vercel Sandbox (Firecracker microVM)                  │
│  - Claude Code CLI installed                           │
│  - Full agentic loop (planning, tools, retries)        │
│  - File tools (Read, Write, Edit, Bash)                │
│  - Dynamic MCPs based on task profile                  │
│  - Your Claude Max subscription via OAuth              │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│  Results                                                │
│  - Stored in Vercel Blob (persistent)                  │
│  - Webhook callback (optional)                         │
│  - Return response to caller                           │
└─────────────────────────────────────────────────────────┘
```

### Why Vercel Sandbox?

- **No local machine required** — runs entirely in the cloud
- **Isolation** — each task runs in its own Firecracker microVM
- **Up to 5 hours runtime** on Pro plan
- **Pay for active CPU time** only (Fluid compute model)
- **Claude Code CLI** works natively in the sandbox

### Why MCP Profiles?

Loading 10+ MCPs at once causes:
- Decision paralysis (which tool do I use?)
- Similar tools confusion (which calendar? which notes app?)
- Token overhead (slower, more expensive)

**Solution**: Route tasks to profiles that load only 2-4 relevant MCPs.

---

## How It Works

### Example Flow

```
You: "Had coffee with Sarah from TechCorp, she's interested in the API product"

1. POST /api/task receives this
2. Router detects keywords: "with", "interested in" → CRM profile
3. CRM profile loads: hubspot, google-calendar, slack
4. Vercel Sandbox spins up with Claude Code + those MCPs
5. Claude reads CLAUDE.md (knows your preferences, workflows)
6. Claude executes:
   - Creates/updates HubSpot contact for Sarah
   - Logs meeting note with discussion points
   - Schedules follow-up calendar event
   - Posts summary to #sales Slack channel
7. Returns: "Done: Created contact, logged meeting, follow-up scheduled for Thursday"
```

### The Router

Two-phase routing for speed and accuracy:

1. **Fast path**: Keyword matching (no LLM call)
   - "call with" → CRM profile
   - "remind me" → Personal profile
   - "bug" → Dev profile

2. **Fallback**: LLM classification (Haiku, ~100ms)
   - Ambiguous tasks get classified by a fast, cheap model
   - Returns profile + confidence score

---

## Project Structure

```
personal-os/
├── api/
│   └── task.ts              # Main HTTP endpoint
├── lib/
│   ├── router.ts            # Task → profile routing (keywords + LLM fallback)
│   └── sandbox.ts           # Vercel Sandbox executor with MCP loading
├── config/
│   ├── profiles.yaml        # MCP profile definitions
│   └── mcps.yaml            # MCP server configurations
├── workspace/
│   └── CLAUDE.md            # Claude's operating manual (CUSTOMIZE THIS!)
├── package.json
├── vercel.json
├── tsconfig.json
├── .env.example
└── .gitignore
```

### Key Files Explained

| File | Purpose |
|------|---------|
| `api/task.ts` | HTTP endpoint — receives tasks, authenticates, routes, executes in sandbox |
| `lib/router.ts` | Classifies tasks into profiles via keywords or LLM |
| `lib/sandbox.ts` | Creates Vercel Sandbox, installs Claude Code CLI, configures MCPs |
| `config/profiles.yaml` | Defines profiles: which MCPs to load, trigger keywords |
| `config/mcps.yaml` | MCP connection details: commands, environment variables |
| `workspace/CLAUDE.md` | **Your personal OS brain** — tells Claude how to use your tools |

---

## Setup Guide

### Prerequisites

- Node.js 20+
- Vercel account (Pro recommended for 5hr sandbox runtime)
- Anthropic API key
- MCP credentials (HubSpot, Google, Slack, etc.)

### Installation

```bash
# Clone the repo
cd personal-os

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Fill in your API keys (see .env.example for all required keys)
```

### Vercel Setup

```bash
# Install Vercel CLI
npm i -g vercel

# Link to your Vercel project
vercel link

# Pull environment (creates OIDC token for sandbox auth)
vercel env pull

# Note: OIDC token expires after 12 hours, re-run `vercel env pull` as needed
```

### Local Development

```bash
# Start local dev server
vercel dev

# Test the endpoint
curl -X POST http://localhost:3000/api/task \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-secret-key" \
  -d '{"task": "Remind me to call mom tomorrow"}'
```

### Deploy

```bash
# Deploy to preview
vercel deploy

# Deploy to production
vercel deploy --prod
```

---

## Configuration

### Environment Variables

See `.env.example` for the full list. Key ones:

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-...      # For router LLM calls
PERSONAL_OS_API_KEY=your-secret   # Auth for /api/task

# Per MCP (add what you use)
HUBSPOT_ACCESS_TOKEN=pat-...
SLACK_BOT_TOKEN=xoxb-...
NOTION_API_KEY=secret_...
TODOIST_API_TOKEN=...
GITHUB_TOKEN=ghp_...
# etc.
```

### Profiles (`config/profiles.yaml`)

Profiles define which MCPs load for each task category:

```yaml
profiles:
  crm:
    name: "CRM & Sales"
    description: "Sales calls, contact management, follow-ups"
    mcps:
      - hubspot
      - google-calendar
      - slack
    triggers:
      keywords:
        - "call with"
        - "meeting with"
        - "sales"
        - "follow up"
      patterns:
        - ".*\\b(met|spoke|called)\\b.*\\b(with|to)\\b.*"

  personal:
    name: "Personal"
    description: "Personal tasks, reminders, life admin"
    mcps:
      - todoist
      - google-calendar
    triggers:
      keywords:
        - "remind me"
        - "todo"
        - "need to"
```

### MCPs (`config/mcps.yaml`)

Define how to connect to each MCP:

```yaml
mcps:
  hubspot:
    name: "HubSpot"
    type: "npx"
    command: "@hubspot/mcp-server"
    env:
      HUBSPOT_ACCESS_TOKEN: "${HUBSPOT_ACCESS_TOKEN}"

  slack:
    name: "Slack"
    type: "npx"
    command: "@anthropic/mcp-slack"
    env:
      SLACK_BOT_TOKEN: "${SLACK_BOT_TOKEN}"
```

---

## API Reference

### POST /api/task

Execute a task with Claude Code.

**Headers:**
```
Content-Type: application/json
x-api-key: your-secret-key
```

**Request Body:**
```json
{
  "task": "Had coffee with Sarah from TechCorp, interested in API",
  "context": {                    // Optional additional context
    "duration": "30min",
    "location": "Blue Bottle"
  },
  "profile": "crm",               // Optional: force specific profile
  "mcps": ["hubspot", "slack"],   // Optional: force specific MCPs
  "webhook": "https://...",       // Optional: callback URL when done
  "async": false                  // Optional: return immediately, process in background
}
```

**Response (sync):**
```json
{
  "id": "task_1234567890_abc123",
  "status": "completed",
  "profile": "crm",
  "mcps": ["hubspot", "google-calendar", "slack"],
  "result": "Done:\n- Created contact Sarah (TechCorp)\n- Logged meeting note\n- Scheduled follow-up for Thursday",
  "duration": 45000
}
```

**Response (async):**
```json
{
  "id": "task_1234567890_abc123",
  "status": "queued",
  "profile": "crm",
  "mcps": ["hubspot", "google-calendar", "slack"]
}
```

---

## Customization

### CLAUDE.md — The Most Important File

`workspace/CLAUDE.md` is Claude's operating manual. Customize it with:

1. **About you** — Name, work, timezone, communication style
2. **MCP usage guide** — When to use each tool
3. **Common workflows** — Step-by-step patterns (after a call, new idea, etc.)
4. **Decision frameworks** — Which task system? Which notes app?
5. **Key people** — Frequent contacts and how to handle them
6. **Preferences** — Meeting times, video call platform, etc.

The more specific you are, the less Claude will ask clarifying questions.

### Adding a New MCP

1. Add to `config/mcps.yaml`:
   ```yaml
   new-mcp:
     name: "New MCP"
     type: "npx"
     command: "@someone/mcp-new"
     env:
       NEW_MCP_TOKEN: "${NEW_MCP_TOKEN}"
   ```

2. Add to relevant profiles in `config/profiles.yaml`:
   ```yaml
   profiles:
     some-profile:
       mcps:
         - new-mcp
   ```

3. Add env var to `.env.local`:
   ```
   NEW_MCP_TOKEN=...
   ```

4. Document in `workspace/CLAUDE.md`:
   ```markdown
   ### New MCP
   **Use for**: ...
   **Don't use for**: ...
   ```

### Adding a New Profile

Add to `config/profiles.yaml`:

```yaml
profiles:
  finance:
    name: "Finance"
    description: "Expenses, invoices, budgeting"
    mcps:
      - quickbooks
      - google-sheets
    triggers:
      keywords:
        - "expense"
        - "invoice"
        - "budget"
        - "payment"
```

---

## Development Phases

### Phase 1: Core Infrastructure ✅
- [x] Project structure
- [x] Vercel Sandbox executor
- [x] Basic API endpoint
- [x] CLAUDE.md template
- [x] MCP profile system
- [x] Task router (keywords + LLM)

### Phase 2: Integrations (TODO)
- [ ] Slack slash commands (`/task`, `/status`)
- [ ] Webhook callbacks
- [ ] iOS Shortcuts integration guide
- [ ] Voice memo → transcription → task pipeline

### Phase 3: Persistence (TODO)
- [ ] Task history in Vercel KV or Postgres
- [ ] Result retrieval endpoint (`GET /api/task/:id`)
- [ ] Simple dashboard UI

### Phase 4: Advanced (TODO)
- [ ] Task queue for background processing
- [ ] Retry logic with exponential backoff
- [ ] Usage tracking and limits
- [ ] Multi-user support

---

## Extending the System

### Add Slack Commands

Create `api/slack.ts`:

```typescript
// Handle Slack slash commands like /task
// Verify Slack signature, parse command, call routeTask + executeInSandbox
// Post result back to Slack channel/thread
```

### Add Voice Memo Support

1. Use Whisper API to transcribe audio
2. POST transcription to `/api/task`
3. Can be triggered via iOS Shortcut or Zapier

### Add Task Queue

For truly async processing:

1. Use Vercel KV or Upstash Redis
2. POST adds to queue, returns immediately
3. Vercel Cron or background function processes queue

---

## Troubleshooting

### "Sandbox creation failed"

- Check `vercel env pull` was run recently (OIDC token expires)
- Verify Vercel Pro plan for longer runtimes
- Check Vercel dashboard for sandbox limits

### "MCP not working"

- Verify env vars are set in `.env.local`
- Check MCP package name in `config/mcps.yaml`
- Test MCP independently: `npx @anthropic/mcp-slack`

### "Wrong profile selected"

- Check `config/profiles.yaml` keywords
- Add more specific keywords for your use case
- Use `"profile": "explicit"` in request to force

### "Claude confused about tools"

- Review `workspace/CLAUDE.md` — be more specific
- Reduce MCPs in the profile
- Add decision framework for similar tools

---

## Background & Context

This project evolved from [Sleepless Agent](../), a local daemon for 24/7 task processing. Personal OS takes the core ideas (CLAUDE.md, MCP profiles, routing) and makes them cloud-native:

| Feature | Sleepless Agent | Personal OS |
|---------|-----------------|-------------|
| Runs on | Local machine | Vercel (cloud) |
| Input | Slack commands | HTTP API (anything) |
| Task queue | SQLite | Stateless (or Vercel KV) |
| Always on | Yes (daemon) | On-demand |
| Local machine required | Yes | No |

Personal OS is simpler to start with and can grow into Sleepless Agent's functionality if needed.

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
