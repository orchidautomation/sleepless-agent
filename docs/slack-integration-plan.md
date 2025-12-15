# Slack Integration for Personal OS

## Overview

Add Slack integration to Personal OS, enabling users to interact with the Claude agent through:
- **Agent Panel** (Slack's Assistant sidebar) - Primary interface
- **@mentions** in channels
- **Direct messages**

The integration uses **Slack Bolt framework** with **Vercel adapter** for type-safe event handling and native streaming. Tasks execute through the existing sandbox infrastructure (routing → sandbox → MCP execution).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           SLACK WORKSPACE                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │ Agent Panel  │  │  @mention    │  │  Direct DM   │                  │
│  │ (Assistant)  │  │  in channel  │  │  to bot      │                  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                  │
│         │                 │                 │                           │
│         └─────────────────┼─────────────────┘                           │
│                           │                                             │
│                           ▼                                             │
│                  ┌────────────────┐                                     │
│                  │ assistant_     │  (context: what user is viewing)   │
│                  │ thread_started │                                     │
│                  │ app_mention    │                                     │
│                  │ message.im     │                                     │
│                  └────────┬───────┘                                     │
│                           │                                             │
└───────────────────────────┼─────────────────────────────────────────────┘
                            │
                            ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                        VERCEL (Serverless)                                │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                     Slack Bolt App                                   │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │ │
│  │  │ VercelReceiver  │  │ Event Listeners │  │ Response Streaming  │  │ │
│  │  │ (adapter)       │  │ (type-safe)     │  │ (chatStream)        │  │ │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                           │                                               │
│                           ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                    Task Executor                                     │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │ │
│  │  │ routeTask()     │─▶│ executeInSandbox│─▶│ Stream Results      │  │ │
│  │  │ (Claude Haiku)  │  │ (Agent SDK)     │  │ (to Slack)          │  │ │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌─────────────────┐  ┌─────────────────┐                                │
│  │ Direct API      │  │ Vercel Blob     │                                │
│  │ POST /api/task  │  │ (result storage)│                                │
│  │ (unchanged)     │  │                 │                                │
│  └─────────────────┘  └─────────────────┘                                │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## Why Bolt Framework (Not Native Fetch)

Based on Vercel's community session and template learnings:

| Benefit | Description |
|---------|-------------|
| **Type Safety** | Know exactly what events look like, no guessing |
| **Native Streaming** | `client.chatStream()` for real-time responses |
| **Assistant Status** | `assistant.threads.setStatus()` for thinking states |
| **Fast Iteration** | Framework patterns anyone can understand |
| **Feature Parity** | Slack updates → Bolt updates automatically |
| **Vercel Adapter** | `@vercel/slack-bolt` handles serverless correctly |

---

## Project Structure

```
sleepless-agent/
├── server/                          # NEW: Nitro server directory
│   ├── app.ts                       # Bolt app initialization
│   ├── api/
│   │   └── slack/
│   │       └── events.post.ts       # Single webhook endpoint
│   ├── lib/
│   │   ├── ai/
│   │   │   ├── respond-to-message.ts    # AI response logic
│   │   │   └── tools/                   # Slack-specific tools
│   │   │       ├── index.ts
│   │   │       └── get-thread-context.ts
│   │   └── slack/
│   │       ├── utils.ts             # Helper functions
│   │       └── blocks.ts            # Block Kit templates
│   └── listeners/
│       ├── index.ts                 # Register all listeners
│       ├── events/
│       │   ├── index.ts
│       │   ├── app-mention.ts       # @mention handler
│       │   ├── assistant-thread-started.ts  # Agent Panel handler
│       │   └── app-home-opened.ts   # Home tab
│       └── messages/
│           ├── index.ts
│           └── direct-message.ts    # DM handler
├── api/                             # EXISTING: Keep direct API
│   └── task.ts                      # Unchanged for backward compat
├── lib/                             # EXISTING: Core logic
│   ├── router.ts                    # Task routing (reuse)
│   ├── sandbox.ts                   # Sandbox execution (reuse)
│   └── task-executor.ts             # NEW: Shared execution with progress
├── config/                          # EXISTING
│   ├── profiles.yaml
│   └── mcps.yaml
├── scripts/
│   └── dev.tunnel.ts                # NEW: ngrok automation
├── manifest.json                    # NEW: Slack app manifest
├── nitro.config.ts                  # NEW: Nitro configuration
└── .slack/
    └── config.json                  # NEW: Slack CLI config
```

---

## Files to Create

### 1. `manifest.json` - Slack App Configuration

```json
{
  "display_information": {
    "name": "Personal OS",
    "description": "Your AI-powered personal operating system",
    "background_color": "#000000"
  },
  "features": {
    "app_home": {
      "home_tab_enabled": true,
      "messages_tab_enabled": true,
      "messages_tab_read_only_enabled": false
    },
    "bot_user": {
      "display_name": "Personal OS",
      "always_online": true
    },
    "assistant_view": {
      "assistant_description": "Your personal AI assistant for tasks, research, CRM, and more"
    }
  },
  "oauth_config": {
    "scopes": {
      "bot": [
        "app_mentions:read",
        "assistant:write",
        "channels:history",
        "chat:write",
        "groups:history",
        "im:history",
        "im:read",
        "im:write",
        "mpim:history",
        "reactions:write"
      ]
    }
  },
  "settings": {
    "event_subscriptions": {
      "request_url": "https://your-app.vercel.app/api/slack/events",
      "bot_events": [
        "app_home_opened",
        "app_mention",
        "assistant_thread_started",
        "assistant_thread_context_changed",
        "message.channels",
        "message.groups",
        "message.im",
        "message.mpim"
      ]
    },
    "interactivity": {
      "is_enabled": true,
      "request_url": "https://your-app.vercel.app/api/slack/events"
    },
    "org_deploy_enabled": false,
    "socket_mode_enabled": false,
    "token_rotation_enabled": false
  }
}
```

---

### 2. `server/app.ts` - Bolt App Initialization

```typescript
import { App, LogLevel } from "@slack/bolt";
import { VercelReceiver } from "@vercel/slack-bolt";
import registerListeners from "./listeners";

const logLevel =
  process.env.NODE_ENV === "development" ? LogLevel.DEBUG : LogLevel.INFO;

const receiver = new VercelReceiver({
  logLevel,
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  receiver,
  deferInitialization: true,  // Important for serverless
  logLevel,
});

registerListeners(app);

export { app, receiver };
```

---

### 3. `server/api/slack/events.post.ts` - Webhook Handler

```typescript
import { createHandler } from "@vercel/slack-bolt";
import { app, receiver } from "~/app";

const handler = createHandler(app, receiver);

export default defineEventHandler(async (event) => {
  const request = toWebRequest(event);
  return await handler(request);
});
```

---

### 4. `server/listeners/events/assistant-thread-started.ts` - Agent Panel Handler

This is the key handler for the Slack Agent Panel (Assistant sidebar):

```typescript
import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import { executeTaskWithProgress } from "~/lib/task-executor";

const assistantThreadStartedCallback = async ({
  event,
  client,
  logger,
  context,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<"assistant_thread_started">) => {
  const { channel_id, thread_ts } = event.assistant_thread;
  const threadContext = event.assistant_thread.context;

  logger.debug("Assistant thread started", { channel_id, thread_ts, threadContext });

  // Set initial thinking state
  await client.assistant.threads.setStatus({
    channel_id,
    thread_ts,
    status: "is thinking...",
  });

  // The context tells us what the user is currently viewing
  // e.g., { channel_id: "C123", message_ts: "123.456" }
  // Use this to provide contextual help

  // Wait for user's first message in the thread
  // The actual task execution happens in the message handler
};

export default assistantThreadStartedCallback;
```

---

### 5. `server/listeners/events/app-mention.ts` - @Mention Handler

```typescript
import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import type { ModelMessage } from "ai";
import { executeTaskWithProgress } from "~/lib/task-executor";
import { feedbackBlock } from "~/lib/slack/blocks";

const appMentionCallback = async ({
  event,
  client,
  logger,
  context,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<"app_mention">) => {
  const thread_ts = event.thread_ts || event.ts;
  const channel = event.channel;
  const text = event.text.replace(/<@[^>]+>/g, "").trim(); // Remove @mention

  logger.debug(`app_mention: ${text}`);

  try {
    // Set thinking state
    await client.assistant.threads.setStatus({
      channel_id: channel,
      thread_ts,
      status: "is analyzing task...",
      loading_messages: ["is routing to best profile...", "is starting execution..."],
    });

    // Start streaming response
    const streamer = client.chatStream({
      channel,
      thread_ts,
      recipient_team_id: context.teamId,
      recipient_user_id: context.userId,
    });

    // Execute task with progress streaming
    await executeTaskWithProgress({
      task: text,
      onProgress: async (event) => {
        if (event.type === "text" && event.text) {
          await streamer.append({ markdown_text: event.text });
        }
        if (event.type === "routing") {
          await client.assistant.threads.setStatus({
            channel_id: channel,
            thread_ts,
            status: `is using ${event.profile} profile...`,
          });
        }
      },
      onComplete: async (result) => {
        await streamer.stop({
          blocks: [
            feedbackBlock({ thread_ts }),
            {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: `Profile: \`${result.profile}\` | Duration: ${result.duration}s`
                }
              ]
            }
          ],
        });
      },
      onError: async (error) => {
        await streamer.stop();
        await client.chat.postMessage({
          channel,
          thread_ts,
          text: `Sorry, something went wrong: ${error.message}`,
        });
      },
    });

  } catch (error) {
    logger.error("app_mention handler failed:", error);
  }
};

export default appMentionCallback;
```

---

### 6. `server/lib/slack/blocks.ts` - Block Kit Templates

```typescript
export const feedbackBlock = ({ thread_ts }: { thread_ts?: string }) => ({
  type: "actions",
  block_id: `feedback_${thread_ts}`,
  elements: [
    {
      type: "button",
      text: { type: "plain_text", text: "👍", emoji: true },
      value: "positive",
      action_id: "feedback_positive",
    },
    {
      type: "button",
      text: { type: "plain_text", text: "👎", emoji: true },
      value: "negative",
      action_id: "feedback_negative",
    },
  ],
});

export const taskResultBlock = ({
  result,
  profile,
  duration,
}: {
  result: string;
  profile: string;
  duration: number;
}) => [
  {
    type: "section",
    text: {
      type: "mrkdwn",
      text: result,
    },
  },
  {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `Profile: \`${profile}\` | Duration: ${duration.toFixed(1)}s`,
      },
    ],
  },
];

export const errorBlock = (message: string) => ({
  type: "section",
  text: {
    type: "mrkdwn",
    text: `:warning: ${message}`,
  },
});
```

---

### 7. `lib/task-executor.ts` - Shared Execution Logic

```typescript
import { routeTask } from "./router";
import { executeInSandbox } from "./sandbox";
import { put } from "@vercel/blob";

export interface TaskExecutionConfig {
  task: string;
  context?: Record<string, unknown>;
  profile?: string;  // Force specific profile
  mcps?: string[];   // Force specific MCPs

  // Progress callbacks
  onProgress?: (event: ProgressEvent) => void | Promise<void>;
  onComplete?: (result: TaskResult) => void | Promise<void>;
  onError?: (error: Error) => void | Promise<void>;
}

export interface ProgressEvent {
  type: "routing" | "starting" | "thinking" | "tool_use" | "text" | "complete" | "error";
  message?: string;
  text?: string;
  profile?: string;
  toolName?: string;
}

export interface TaskResult {
  success: boolean;
  output: string;
  profile: string;
  mcps: string[];
  duration: number;
  blobUrl?: string;
}

export async function executeTaskWithProgress(config: TaskExecutionConfig): Promise<TaskResult> {
  const startTime = Date.now();

  try {
    // Phase 1: Route task
    await config.onProgress?.({ type: "routing", message: "Analyzing task..." });

    const routing = config.profile
      ? { profile: config.profile, mcps: config.mcps || [] }
      : await routeTask(config.task);

    await config.onProgress?.({
      type: "routing",
      message: `Using ${routing.profile} profile`,
      profile: routing.profile
    });

    // Phase 2: Execute in sandbox
    await config.onProgress?.({ type: "starting", message: "Starting execution..." });

    const result = await executeInSandbox({
      task: config.task,
      context: config.context,
      mcps: routing.mcps,
      timeout: "10m",
    });

    const duration = (Date.now() - startTime) / 1000;

    // Phase 3: Store result
    const blob = await put(`tasks/${Date.now()}.json`, JSON.stringify(result), {
      access: "public",
      contentType: "application/json",
    });

    const taskResult: TaskResult = {
      success: result.success,
      output: result.output || result.error || "No output",
      profile: routing.profile,
      mcps: routing.mcps,
      duration,
      blobUrl: blob.url,
    };

    await config.onComplete?.(taskResult);
    return taskResult;

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    await config.onError?.(err);
    throw err;
  }
}
```

---

### 8. `scripts/dev.tunnel.ts` - ngrok Automation

```typescript
import ngrok from "@ngrok/ngrok";
import { spawn } from "child_process";
import "dotenv/config";

const NGROK_AUTH_TOKEN = process.env.NGROK_AUTH_TOKEN;

if (!NGROK_AUTH_TOKEN) {
  console.error("NGROK_AUTH_TOKEN is required for local development");
  process.exit(1);
}

async function main() {
  // Start ngrok tunnel
  const listener = await ngrok.connect({
    addr: 3000,
    authtoken: NGROK_AUTH_TOKEN,
  });

  const tunnelUrl = listener.url();
  console.log(`\n🚀 ngrok tunnel: ${tunnelUrl}`);
  console.log(`📝 Update your Slack app Request URL to: ${tunnelUrl}/api/slack/events\n`);

  // Start local dev server
  const devProcess = spawn("pnpm", ["dev"], {
    stdio: "inherit",
    env: {
      ...process.env,
      TUNNEL_URL: tunnelUrl,
    },
  });

  // Cleanup on exit
  process.on("SIGINT", async () => {
    console.log("\n🛑 Shutting down...");
    devProcess.kill();
    await ngrok.disconnect();
    process.exit(0);
  });
}

main().catch(console.error);
```

---

## Environment Variables

### `.env.example`

```bash
# ===========================================
# ANTHROPIC (Required)
# ===========================================
ANTHROPIC_API_KEY=sk-ant-...

# ===========================================
# SLACK (Required for Slack integration)
# ===========================================
# Bot User OAuth Token (xoxb-...)
# Found in: Slack App -> OAuth & Permissions -> Bot User OAuth Token
SLACK_BOT_TOKEN=xoxb-...

# Signing Secret (for verifying incoming requests)
# Found in: Slack App -> Basic Information -> App Credentials
SLACK_SIGNING_SECRET=...

# ===========================================
# DEVELOPMENT (Optional)
# ===========================================
# ngrok auth token for local development tunneling
# Get one at: https://dashboard.ngrok.com/get-started/your-authtoken
NGROK_AUTH_TOKEN=...

# ===========================================
# MCP TOKENS (as needed by profiles)
# ===========================================
EXA_API_KEY=...
HUBSPOT_ACCESS_TOKEN=...
SLACK_BOT_TOKEN=...
# ... etc (unchanged from existing)
```

---

## Slack App Setup

### 1. Create Slack App

1. Go to https://api.slack.com/apps/new
2. Choose **"From an app manifest"**
3. Select your workspace
4. Paste the contents of `manifest.json`
5. Click **Create**

### 2. Install to Workspace

1. Go to **Install App** tab
2. Click **Install to Workspace**
3. Authorize the permissions

### 3. Get Credentials

| Credential | Location | Environment Variable |
|------------|----------|---------------------|
| Bot Token | OAuth & Permissions → Bot User OAuth Token | `SLACK_BOT_TOKEN` |
| Signing Secret | Basic Information → App Credentials | `SLACK_SIGNING_SECRET` |

### 4. Two-App Pattern (Recommended for Development)

Create two Slack apps:
- **Personal OS (Local)** - Points to ngrok URL, for development
- **Personal OS** - Points to Vercel URL, for production

This allows testing without affecting production.

---

## OAuth Scopes Explained

| Scope | Purpose |
|-------|---------|
| `app_mentions:read` | Receive @mention events |
| `assistant:write` | Show typing status, update Agent Panel |
| `channels:history` | Read channel messages for context |
| `chat:write` | Post and stream messages |
| `groups:history` | Read private channel messages |
| `im:history` | Read DM history for context |
| `im:read` | Receive DM events |
| `im:write` | Send DMs |
| `mpim:history` | Read group DM history |
| `reactions:write` | Add emoji reactions |

---

## Event Subscriptions Explained

| Event | Purpose |
|-------|---------|
| `app_home_opened` | User opens app Home tab |
| `app_mention` | Bot @mentioned in channel |
| `assistant_thread_started` | User opens Agent Panel |
| `assistant_thread_context_changed` | User navigates while Agent Panel open |
| `message.channels` | Messages in public channels (for context) |
| `message.groups` | Messages in private channels |
| `message.im` | Direct messages to bot |
| `message.mpim` | Group DM messages |

---

## DevOps Setup Guide

### Prerequisites

Before starting implementation, you need:

1. **Slack Workspace** - Admin access to create apps
2. **ngrok Account** - Free tier works, get auth token from https://dashboard.ngrok.com/get-started/your-authtoken
3. **Vercel Account** - Pro recommended for 5hr sandbox runtime
4. **Anthropic API Key** - From https://console.anthropic.com/

---

### Step 1: Create Slack App (Local Development)

1. Go to https://api.slack.com/apps
2. Click **Create New App** → **From an app manifest**
3. Select your workspace
4. Paste this manifest (we'll update the URL after ngrok is running):

```json
{
  "display_information": {
    "name": "Personal OS (Local)",
    "description": "Local development instance",
    "background_color": "#1a1a2e"
  },
  "features": {
    "app_home": {
      "home_tab_enabled": true,
      "messages_tab_enabled": true,
      "messages_tab_read_only_enabled": false
    },
    "bot_user": {
      "display_name": "Personal OS",
      "always_online": true
    },
    "assistant_view": {
      "assistant_description": "Your personal AI assistant for tasks, research, CRM, and more"
    }
  },
  "oauth_config": {
    "scopes": {
      "bot": [
        "app_mentions:read",
        "assistant:write",
        "channels:history",
        "chat:write",
        "groups:history",
        "im:history",
        "im:read",
        "im:write",
        "mpim:history"
      ]
    }
  },
  "settings": {
    "event_subscriptions": {
      "request_url": "https://PLACEHOLDER.ngrok.io/api/slack/events",
      "bot_events": [
        "app_home_opened",
        "app_mention",
        "assistant_thread_started",
        "assistant_thread_context_changed",
        "message.im"
      ]
    },
    "interactivity": {
      "is_enabled": true,
      "request_url": "https://PLACEHOLDER.ngrok.io/api/slack/events"
    },
    "org_deploy_enabled": false,
    "socket_mode_enabled": false,
    "token_rotation_enabled": false
  }
}
```

5. Click **Create**
6. Go to **Install App** → **Install to Workspace** → **Allow**

---

### Step 2: Get Slack Credentials

After creating the app, collect these values:

| Credential | Location | Env Variable |
|------------|----------|--------------|
| Bot Token | **OAuth & Permissions** → Bot User OAuth Token (starts with `xoxb-`) | `SLACK_BOT_TOKEN` |
| Signing Secret | **Basic Information** → App Credentials → Signing Secret | `SLACK_SIGNING_SECRET` |
| App ID | **Basic Information** → App ID | (for reference) |

---

### Step 3: Configure Environment Variables

Add to your `.env.local`:

```bash
# Slack (required)
SLACK_BOT_TOKEN=xoxb-your-token
SLACK_SIGNING_SECRET=your-signing-secret

# ngrok (for local development)
NGROK_AUTH_TOKEN=your-ngrok-token

# Anthropic (already have this)
ANTHROPIC_API_KEY=sk-ant-...

# Personal OS API (already have this)
PERSONAL_OS_API_KEY=your-secret-key
```

---

### Step 4: Update Slack App URLs (After Starting Dev Server)

Once your ngrok tunnel is running (e.g., `https://abc123.ngrok.io`):

1. Go to your Slack app settings
2. **Event Subscriptions** → Update Request URL to: `https://abc123.ngrok.io/api/slack/events`
3. **Interactivity & Shortcuts** → Update Request URL to: `https://abc123.ngrok.io/api/slack/events`
4. Click **Save Changes**
5. Wait for URL verification (should show ✓ Verified)

---

### Step 5: Create Production Slack App (Later)

When ready for production, create a second app:
1. Same manifest but with `"name": "Personal OS"`
2. URLs pointing to your Vercel deployment: `https://your-app.vercel.app/api/slack/events`
3. Different tokens in Vercel environment variables

---

### Troubleshooting Setup

| Issue | Solution |
|-------|----------|
| URL verification fails | Check ngrok is running and URL is correct |
| "not_authed" error | Verify `SLACK_BOT_TOKEN` is set correctly |
| Events not received | Check Event Subscriptions are enabled and URL verified |
| Bot doesn't respond | Ensure bot is invited to channel (`/invite @Personal OS`) |
| "operation_timeout" | Your handler took >3 seconds - implement ack() first pattern |

---

## Implementation Phases

### Phase 1: Foundation
**Goal**: Get Slack receiving events and responding with a simple message.

**Code Tasks**:
1. [ ] Install dependencies: `@slack/bolt`, `@vercel/slack-bolt`, `zod`
2. [ ] Create `server/env.ts` - Zod environment validation
3. [ ] Create `server/app.ts` - Bolt app initialization with VercelReceiver
4. [ ] Create `api/slack/events.ts` - Webhook endpoint
5. [ ] Create `server/listeners/index.ts` - Listener registration
6. [ ] Create `server/listeners/events/app-mention.ts` - Basic @mention handler
7. [ ] Create `manifest.json` - Slack app manifest
8. [ ] Create `scripts/tunnel.ts` - ngrok automation

**DevOps Tasks**:
- [ ] Create Slack app (local) following DevOps guide above
- [ ] Get `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET`
- [ ] Get `NGROK_AUTH_TOKEN`
- [ ] Add all env vars to `.env.local`

**Test**: @mention the bot → get "Hello from Personal OS!" response

---

### Phase 2: Task Execution
**Goal**: Connect Slack to existing router + sandbox execution.

**Code Tasks**:
1. [ ] Create `lib/task-executor.ts` - Unified execution with callbacks
2. [ ] Update `app-mention.ts` - Call task executor
3. [ ] Create `server/listeners/messages/direct-message.ts` - DM handler
4. [ ] Add status updates via `assistant.threads.setStatus()`
5. [ ] Add basic error handling with user-friendly messages

**Test**: @mention with task → routes to profile → executes in sandbox → returns result

---

### Phase 3: Agent Panel & Streaming
**Goal**: Enable Agent Panel (Assistant) and streaming responses.

**Code Tasks**:
1. [ ] Create `server/listeners/events/assistant-thread-started.ts`
2. [ ] Create `server/listeners/events/assistant-thread-context-changed.ts`
3. [ ] Implement `setSuggestedPrompts()` for Agent Panel
4. [ ] Add native streaming with `client.chatStream()`
5. [ ] Connect sandbox output stream to Slack stream
6. [ ] Add correlation middleware for request tracing

**Test**: Open Agent Panel → see suggested prompts → send message → streaming response

---

### Phase 4: Polish & Production
**Goal**: Production-ready with error handling, logging, and deployment.

**Code Tasks**:
1. [ ] Add retry wrapper with exponential backoff
2. [ ] Implement structured logging schema
3. [ ] Add user-friendly error messages
4. [ ] Create feedback buttons (thumbs up/down)
5. [ ] Add Home tab with usage stats
6. [ ] Create `RUNBOOK.md` with operations guide

**DevOps Tasks**:
- [ ] Create production Slack app
- [ ] Add Slack env vars to Vercel
- [ ] Deploy to Vercel
- [ ] Verify URL in production Slack app
- [ ] Test end-to-end in production

**Test**: Full production deployment working

---

### Phase 5: Enhancements (Future)
- [ ] Slash commands (`/task research...`, `/status`)
- [ ] Thread-based follow-up conversations
- [ ] Context awareness (use what user is viewing)
- [ ] Weekly digest via Vercel cron job
- [ ] Cost tracking and budget limits

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Framework** | Slack Bolt + Vercel adapter | Type safety, streaming, serverless support |
| **Response streaming** | `client.chatStream()` | Native Slack streaming, better UX than `chat.update` |
| **Trigger pattern** | @mentions only (not all messages) | Avoid "annoying agent" problem |
| **Agent Panel** | Yes, via `assistant_view` | Primary interface for power users |
| **Two apps** | Local + Production | Clean separation for development |
| **Progress updates** | `assistant.threads.setStatus()` | Native thinking states |

---

## Trigger Behavior

| Trigger | When | Response |
|---------|------|----------|
| **Agent Panel message** | User types in Assistant sidebar | Full task execution with streaming |
| **@mention** | `@Personal OS do something` | Full task execution with streaming |
| **DM** | Direct message to bot | Full task execution with streaming |
| **Thread reply (no @)** | Reply in thread without @mention | **No response** (avoid noise) |
| **Channel message (no @)** | Regular channel message | **No response** |

---

## Streaming Response Flow

```
User sends message
       │
       ▼
┌──────────────────┐
│ Set status:      │
│ "is thinking..." │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ routeTask()      │
│ (Claude Haiku)   │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Set status:      │
│ "using crm..."   │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ executeInSandbox │
│ (Agent SDK)      │
└────────┬─────────┘
         │
         ├──────► Text chunk ──► streamer.append()
         ├──────► Text chunk ──► streamer.append()
         ├──────► Text chunk ──► streamer.append()
         │
         ▼
┌──────────────────┐
│ streamer.stop()  │
│ + feedback block │
│ + metadata       │
└──────────────────┘
```

---

## Dependencies to Add

```json
{
  "dependencies": {
    "@slack/bolt": "^4.5.0",
    "@slack/web-api": "^7.11.0",
    "@vercel/slack-bolt": "latest"
  },
  "devDependencies": {
    "@ngrok/ngrok": "^1.5.2",
    "nitropack": "^2.12.7"
  }
}
```

---

## Testing Checklist

### Local Development
- [ ] ngrok tunnel script works
- [ ] Slack app receives events
- [ ] Bot responds to @mentions
- [ ] Bot responds in Agent Panel
- [ ] Bot responds to DMs
- [ ] Streaming works smoothly
- [ ] Feedback buttons functional

### Production (Vercel)
- [ ] Deployment succeeds
- [ ] Request URL verification passes
- [ ] @mention → response works
- [ ] Agent Panel → response works
- [ ] DM → response works
- [ ] Errors are handled gracefully
- [ ] Direct API (`POST /api/task`) still works

### Edge Cases
- [ ] Bot ignores own messages (no infinite loops)
- [ ] Handles long-running tasks (>30s)
- [ ] Handles task timeouts gracefully
- [ ] Handles missing MCP tokens
- [ ] Rate limiting doesn't cause issues

---

## Security Considerations

1. **Signature verification** - Bolt handles this automatically
2. **Bot message filtering** - Check `bot_id` to ignore self
3. **Token security** - Never log tokens, use env vars
4. **Sandbox isolation** - Agent runs in Vercel Sandbox
5. **Replay attack prevention** - Bolt rejects old timestamps

---

## Comparison: Old Plan vs New Plan

| Aspect | Old Plan | New Plan |
|--------|----------|----------|
| **Library** | Native fetch | Slack Bolt + Vercel adapter |
| **Streaming** | `chat.update` polling | `client.chatStream()` native |
| **Progress** | Block Kit updates | `assistant.threads.setStatus()` |
| **Agent Panel** | Not included | Primary interface |
| **Type safety** | Manual types | Bolt provides types |
| **Local dev** | Manual ngrok | Automated script |
| **Dependencies** | None new | 3 packages (~500KB) |

---

## Future Enhancements

- [ ] Slash commands (`/task research...`, `/status`)
- [ ] Interactive buttons (cancel running task, retry)
- [ ] Home tab with task history and stats
- [ ] Thread-based conversations (follow-up questions)
- [ ] Context awareness (use what user is viewing)
- [ ] Weekly digest via Vercel cron job
- [ ] Link unfurls for task results
- [ ] iOS Shortcuts integration guide

---

## Vercel Academy Learnings Summary

This section consolidates all key patterns and best practices from the Vercel Academy Slack Agents course for reference during implementation.

### 1. Boot Checks & Environment Validation (Fail Fast)

**Pattern**: Validate all required env vars at startup using Zod.

```typescript
// server/env.ts
import { z } from "zod";

export const envSchema = z.object({
  SLACK_SIGNING_SECRET: z.string().min(1, "SLACK_SIGNING_SECRET is required"),
  SLACK_BOT_TOKEN: z.string().min(1, "SLACK_BOT_TOKEN is required"),
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

const result = envSchema.safeParse(process.env);
if (!result.success) {
  console.error("Invalid environment configuration:", result.error.issues);
  throw new Error("Environment validation failed");
}

export const env = result.data;
```

**Key Points**:
- Import `env` at top of `app.ts` to fail fast
- Use `env.SLACK_BOT_TOKEN` instead of `process.env.SLACK_BOT_TOKEN`
- Clear error messages on missing vars

---

### 2. The 3-Second Rule (ack() First, Work After)

**CRITICAL**: Slack expects a response within 3 seconds. Always `ack()` immediately, then do heavy work.

```typescript
// ❌ WRONG - Will timeout
app.event('app_mention', async ({ event, client }) => {
  const result = await heavyAICall(event.text); // Takes 30s
  await client.chat.postMessage({ channel: event.channel, text: result });
});

// ✅ CORRECT - ack first, work after
app.event('app_mention', async ({ event, client, ack }) => {
  // Acknowledge immediately (within 3s)
  await ack?.();  // For events that support explicit ack

  // Show thinking state
  await client.assistant.threads.setStatus({
    channel_id: event.channel,
    thread_ts: event.thread_ts || event.ts,
    status: "is thinking...",
  });

  // Now do heavy work
  const result = await heavyAICall(event.text);
  await client.chat.postMessage({ channel: event.channel, text: result });
});
```

---

### 3. Correlation Middleware (Request Tracing)

**Pattern**: Attach correlation IDs to every request for debugging.

```typescript
// server/middleware/correlation.ts
import type { Middleware, SlackEventMiddlewareArgs } from "@slack/bolt";

export const correlationMiddleware: Middleware<SlackEventMiddlewareArgs> = async ({
  context,
  body,
  next,
  logger
}) => {
  const event = 'event' in body ? body.event : null;
  const correlationId = event
    ? `${event.type}_${event.event_id}_${Date.now()}`
    : `req_${Date.now()}`;

  const correlation = {
    correlationId,
    event_id: event?.event_id,
    type: event?.type,
    channel: event?.channel,
    ts: event?.ts,
    thread_ts: event?.thread_ts ?? event?.ts,
    user: event?.user
  };

  (context as any).correlation = correlation;
  await next();
};
```

**Usage**:
```typescript
app.logger.info("AI response completed", {
  ...context.correlation,
  operation: "respondToMessage",
  model: "claude-3-haiku",
  latencyMs: Date.now() - startTime,
});
```

---

### 4. Native Streaming with `chatStream()`

**Pattern**: Use Slack's native streaming instead of `chat.update` polling.

```typescript
// Start streaming
const streamer = client.chatStream({
  channel,
  thread_ts,
  recipient_team_id: context.teamId,
  recipient_user_id: context.userId,
});

// Append text chunks as they arrive
for await (const chunk of aiResponse) {
  await streamer.append({ markdown_text: chunk.text });
}

// Stop and finalize with blocks
await streamer.stop({
  blocks: [
    feedbackBlock({ thread_ts }),
    { type: "context", elements: [{ type: "mrkdwn", text: `Duration: ${duration}s` }] }
  ],
});
```

---

### 5. Assistant Status ("Shimmering")

**Pattern**: Show thinking states during processing.

```typescript
// Set status with loading messages for rotation
await client.assistant.threads.setStatus({
  channel_id: channel,
  thread_ts,
  status: "is analyzing task...",
  loading_messages: [
    "is routing to best profile...",
    "is loading MCPs...",
    "is executing task..."
  ],
});

// Clear status when done (automatically cleared when posting response)
```

---

### 6. Agent Panel Context

**Pattern**: The `assistant_thread_started` event provides context about what the user is viewing.

```typescript
app.event('assistant_thread_started', async ({ event, client }) => {
  const { channel_id, thread_ts } = event.assistant_thread;
  const context = event.assistant_thread.context;

  // Context tells you what user was viewing when they opened Agent Panel
  // e.g., { channel_id: "C123", message_ts: "1234.5678" }

  // Set suggested prompts based on context
  await client.assistant.threads.setSuggestedPrompts({
    channel_id,
    thread_ts,
    prompts: [
      { title: "Research", message: "Research this topic..." },
      { title: "Summarize", message: "Summarize this thread..." },
      { title: "Follow up", message: "Draft a follow-up..." },
    ],
  });
});

// Handle context changes (user navigates while panel open)
app.event('assistant_thread_context_changed', async ({ event, client }) => {
  // Update suggested prompts or system prompt based on new context
});
```

---

### 7. Retry Wrapper with Exponential Backoff

**Pattern**: Wrap AI calls with retry logic for resilience.

```typescript
// server/lib/ai/retry-wrapper.ts
interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  retryableErrors?: string[];
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 30000,
    retryableErrors = ['rate_limit', 'timeout', 'overloaded']
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      const isRetryable = retryableErrors.some(e =>
        lastError?.message?.toLowerCase().includes(e)
      );

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      const delay = Math.min(
        initialDelayMs * Math.pow(2, attempt),
        maxDelayMs
      );

      console.log(`Retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
```

---

### 8. User-Friendly Error Handling

**Pattern**: Never expose raw errors to users.

```typescript
// server/lib/ai/error-handler.ts
export function getUserFriendlyError(error: Error): string {
  const msg = error.message.toLowerCase();

  if (msg.includes('rate_limit')) {
    return "I'm receiving too many requests right now. Please try again in a moment.";
  }
  if (msg.includes('timeout')) {
    return "The request took too long. Please try a simpler task or try again.";
  }
  if (msg.includes('overloaded')) {
    return "The AI service is currently busy. Please try again in a few minutes.";
  }
  if (msg.includes('authentication') || msg.includes('api_key')) {
    return "There's a configuration issue. Please contact the admin.";
  }

  return "Something went wrong. Please try again or contact support if the issue persists.";
}
```

---

### 9. Structured Logging Schema

**Pattern**: Use consistent logging schema for queryability.

```typescript
interface StructuredLog {
  correlationId: string;
  operation: 'respondToMessage' | 'toolCall' | 'retry' | 'routing';
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  retryAttempt?: number;
  rateLimitWaitMs?: number;
  channel?: string;
  thread_ts?: string;
  latencyMs?: number;
  error?: string;
  profile?: string;
}

// Always use app.logger, never console.log
app.logger.info("Task routed", {
  ...context.correlation,
  operation: "routing",
  profile: routing.profile,
  latencyMs: Date.now() - startTime,
});
```

---

### 10. OAuth Scope Audit

**Pattern**: Minimize scopes, document usage.

Create `SCOPE_AUDIT.md`:
```markdown
# OAuth Scope Audit

| Scope | Used By | Required? |
|-------|---------|-----------|
| app_mentions:read | app-mention.ts:12 - Event subscription | ✅ Yes |
| assistant:write | Assistant status updates | ✅ Yes |
| channels:history | Thread context fetching | ✅ Yes |
| chat:write | All responses | ✅ Yes |
| groups:history | Private channel support | ⚠️ Only if needed |
| im:history | DM context | ✅ Yes |
| im:read | DM events | ✅ Yes |
| im:write | Send DMs | ✅ Yes |
| reactions:write | Feedback reactions | ⚠️ Optional |
```

---

### 11. SLOs (Service Level Objectives)

**Targets for Production**:

| Metric | Target | Threshold | Measurement |
|--------|--------|-----------|-------------|
| Event Acknowledgment | 99% | < 3s | Time to ack() Slack events |
| Response Time (p95) | 95% | < 15s | Time from event to final response |
| Error Rate | < 1% | - | Percentage of failed responses |
| Availability | 99.9% | - | Bot responding to mentions |

---

### 12. Tunnel Orchestration (Local Dev)

**Pattern**: Automate ngrok with manifest updates.

The tunnel script should:
1. Check if `NGROK_AUTH_TOKEN` exists
2. Check if manifest source is `local` in `.slack/config.json`
3. Start ngrok tunnel
4. Update `manifest.json` with tunnel URL
5. Backup original manifest
6. Spawn dev server
7. Restore manifest on Ctrl+C

---

### 13. Cost Control / Pre-flight Checks

**Pattern**: Estimate costs before making expensive API calls.

```typescript
// Estimate tokens (rough: 1 token ≈ 4 characters)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Check before making request
const estimatedCost = calculateCost(inputTokens, estimatedOutputTokens, model);
if (estimatedCost > MAX_REQUEST_COST) {
  return "Your request is too large. Please break it into smaller questions.";
}
```

---

### 14. Operations Runbook Sections

Essential sections for RUNBOOK.md:
1. **Quick Reference** - URLs, contacts, health checks
2. **SLOs** - Metrics and thresholds
3. **Common Issues** - Quick fixes
4. **Deployment** - Deploy and rollback procedures
5. **Incident Response** - Flowchart for diagnosis
6. **Log Investigation** - Common queries
7. **Secret Rotation** - Step-by-step
8. **Monitoring Setup** - Alerts configuration

---

### 15. Zod Validation for Tools/Inputs

**Pattern**: Validate all external inputs with Zod.

```typescript
import { z } from "zod";

const TaskInputSchema = z.object({
  task: z.string().min(1, "Task is required").max(5000, "Task too long"),
  profile: z.string().optional(),
  mcps: z.array(z.string()).optional(),
});

// In handler
const result = TaskInputSchema.safeParse(input);
if (!result.success) {
  return { error: result.error.issues[0].message };
}
const { task, profile, mcps } = result.data;
```

---

### Key Implementation Notes

1. **Use Claude Agent SDK** - Not Vercel AI SDK (we run Claude in sandbox)
2. **Remote MCPs** - Loaded dynamically per profile
3. **Streaming Architecture** - Sandbox → Node process → Slack chatStream
4. **Agent Panel is Primary** - Design for Assistant sidebar first
5. **@mentions Only** - Don't respond to all messages (avoid annoying bot)
6. **Two-App Pattern** - Separate local and production Slack apps
7. **Fail Fast** - Boot checks catch config issues immediately
8. **Correlation IDs** - Trace requests across serverless invocations
