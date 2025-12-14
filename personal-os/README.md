# Personal Life OS

A cloud-based personal assistant powered by Claude Code that runs in Vercel Sandboxes. Fire off ideas from anywhere, and it orchestrates your tools (CRM, calendar, notes, etc.) to make things happen.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Inputs (anywhere)                                      │
│  - HTTP API (webhooks, Zapier, Shortcuts)              │
│  - Slack command                                        │
│  - Voice memo transcription                            │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│  POST /api/task                                         │
│  - Classifies task → selects MCP profile               │
│  - Spins up Vercel Sandbox                             │
│  - Loads CLAUDE.md + relevant MCPs                     │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│  Claude Code Agent (in sandbox)                        │
│  - Full agentic loop                                   │
│  - File tools + Bash + MCPs                            │
│  - Your Max subscription via OAuth                     │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│  Results                                                │
│  - Stored in Vercel Blob                               │
│  - Webhook callback (optional)                         │
│  - Slack notification (optional)                       │
└─────────────────────────────────────────────────────────┘
```

## Project Structure

```
personal-os/
├── api/
│   └── task.ts              # Main API endpoint
├── lib/
│   ├── router.ts            # Task classification → profile selection
│   ├── sandbox.ts           # Vercel Sandbox executor
│   ├── profiles.ts          # MCP profile definitions
│   └── mcps.ts              # MCP configuration helpers
├── config/
│   ├── profiles.yaml        # MCP profiles (crm, research, personal, etc.)
│   └── mcps.yaml            # MCP connection configs
├── workspace/
│   └── CLAUDE.md            # Claude's operating manual for your life
├── package.json
├── vercel.json
└── .env.example
```

## Phases

### Phase 1: Core Infrastructure
- [x] Project structure
- [ ] Vercel Sandbox executor
- [ ] Basic API endpoint
- [ ] CLAUDE.md template

### Phase 2: MCP Profiles
- [ ] Profile definitions
- [ ] Task router/classifier
- [ ] Dynamic MCP loading

### Phase 3: Integrations
- [ ] Slack input
- [ ] Webhook callbacks
- [ ] Voice memo integration (Whisper)

### Phase 4: Polish
- [ ] Result storage (Vercel Blob)
- [ ] Dashboard for viewing task history
- [ ] Error handling & retries

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env.local
# Add your ANTHROPIC_API_KEY, VERCEL_TOKEN, MCP configs

# Local development
vercel dev

# Deploy
vercel deploy
```

## Usage

```bash
# Fire off a task
curl -X POST https://your-app.vercel.app/api/task \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Had coffee with Sarah from TechCorp, interested in API product",
    "context": {"type": "meeting"}
  }'

# Response
{
  "id": "task_abc123",
  "status": "completed",
  "result": "Created contact Sarah (TechCorp), logged meeting, scheduled follow-up for Thursday"
}
```
