# Slack Integration for Personal OS

## Overview

Add Slack integration to Personal OS, enabling users to interact with the Claude agent through Slack DMs and @mentions. The architecture supports real-time streaming updates and maintains the existing direct API access for other clients (web frontends, iOS Shortcuts, curl).

## Architecture

```
┌─────────────────┐
│  Slack Sidebar  │──┐
│  (DM / @mention)│  │
└─────────────────┘  │
                     │    ┌──────────────────┐    ┌─────────────────┐
┌─────────────────┐  │    │  Shared Task     │    │ Vercel Sandbox  │
│  Direct API     │──┼───▶│  Executor        │───▶│ (Agent SDK)     │
│  (existing)     │  │    │                  │    │                 │
└─────────────────┘  │    │  - routeTask()   │    └─────────────────┘
                     │    │  - executeIn...  │
┌─────────────────┐  │    │  - onProgress()  │
│  Web Frontend   │──┘    └──────────────────┘
│  (future SSE)   │              │
└─────────────────┘              ▼
                          ┌──────────────────┐
                          │  Progress Updates│
                          │  - Slack chat.update
                          │  - SSE stream
                          └──────────────────┘
```

---

## Files to Create

### 1. `lib/slack-client.ts`

Slack Web API client with rate limiting and Block Kit formatting.

**Functions:**
- `postSlackMessage(channel, text, threadTs?, blocks?)` - Post new message
- `updateSlackMessage(channel, ts, text, blocks?)` - Update existing message (rate-limited to 1/sec)
- `formatTaskResult(result)` - Format completion with Block Kit
- `formatProgressUpdate(phase, details?)` - Format progress message

**Example:**
```typescript
export async function postSlackMessage(
  channel: string,
  text: string,
  threadTs?: string,
  blocks?: object[]
): Promise<SlackMessageResult | null> {
  const token = process.env.SLACK_BOT_TOKEN;

  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel, text, thread_ts: threadTs, blocks }),
  });

  return response.json();
}
```

---

### 2. `lib/task-executor.ts`

Shared task execution logic with progress callbacks.

**Functions:**
- `executeTaskWithProgress(config)` - Unified execution for all access points
  - Routes task via `routeTask()`
  - Executes via `executeInSandbox()`
  - Emits progress events to callback
  - Stores results in Vercel Blob

**Interface:**
```typescript
interface TaskExecutionConfig {
  task: string;
  context?: Record<string, unknown>;
  profile?: string;
  mcps?: string[];

  // Slack-specific (optional)
  slackChannel?: string;
  slackMessageTs?: string;
  slackThreadTs?: string;
  slackUserId?: string;

  // Generic progress callback (for SSE, webhooks, etc.)
  onProgress?: (event: ProgressEvent) => void | Promise<void>;
}

interface ProgressEvent {
  type: "routing" | "starting" | "thinking" | "tool_use" | "text" | "complete" | "error";
  message?: string;
  details?: string;
  result?: TaskResult;
}
```

---

### 3. `api/slack/events.ts`

Slack Events API endpoint.

**Handles:**
- URL verification challenge (required for Slack setup)
- `app_mention` events (when @mentioned in channels)
- `message.im` events (direct messages)
- Signature verification via `SLACK_SIGNING_SECRET`
- 3-second acknowledgment requirement (respond immediately, process async)
- Event deduplication (Slack may retry)

**Flow:**
```
1. Receive POST from Slack
2. Verify signature (SLACK_SIGNING_SECRET)
3. Respond 200 immediately (within 3 seconds!)
4. Post "Processing..." message to Slack
5. Execute task with progress updates
6. Update message with final result
```

**Key Code Pattern:**
```typescript
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify signature
  if (!verifySlackSignature(req)) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  // Handle URL verification challenge
  if (req.body.type === "url_verification") {
    return res.status(200).json({ challenge: req.body.challenge });
  }

  // CRITICAL: Respond within 3 seconds
  res.status(200).json({ ok: true });

  // Process async (after response sent)
  const event = req.body.event;
  if (event.type === "app_mention" || event.type === "message") {
    await handleSlackMessage(event);
  }
}
```

---

### 4. `api/task/stream.ts` (Optional - Phase 2)

SSE endpoint for web frontend real-time updates.

```typescript
// Set SSE headers
res.setHeader("Content-Type", "text/event-stream");
res.setHeader("Cache-Control", "no-cache");
res.setHeader("Connection", "keep-alive");

// Stream events
res.write(`event: progress\n`);
res.write(`data: ${JSON.stringify({ type: "thinking" })}\n\n`);
```

---

## Files to Modify

### 1. `lib/sandbox.ts`

Add progress event emission during agent execution.

**Changes:**
- Add `SandboxProgressEvent` interface
- Modify agent script to emit progress to `progress.jsonl`
- Add `executeInSandboxWithProgress()` that reads progress events
- Emit events for: text chunks, tool_use, tool_result

**New Interface:**
```typescript
export interface SandboxProgressEvent {
  type: "text" | "tool_use" | "tool_result" | "thinking";
  text?: string;
  toolName?: string;
  toolInput?: unknown;
}
```

---

### 2. `api/task.ts`

Refactor to use shared task executor.

**Changes:**
- Import and use `executeTaskWithProgress()`
- Remove duplicated execution logic
- Keep same request/response format for backward compatibility

**Before:**
```typescript
const result = await executeInSandbox({
  task: buildPrompt(body.task, body.context),
  mcps,
  timeout: "10m",
});
```

**After:**
```typescript
const result = await executeTaskWithProgress({
  task: body.task,
  context: body.context,
  profile,
  mcps,
});
```

---

### 3. `.env.example`

Add new environment variable:

```bash
# Slack Bot Token (existing)
SLACK_BOT_TOKEN=xoxb-...

# Slack Signing Secret (NEW - for verifying incoming requests)
# Found in: Slack App Settings -> Basic Information -> App Credentials
SLACK_SIGNING_SECRET=...
```

---

## Implementation Order

### Phase 1: Core Infrastructure
1. Create `lib/slack-client.ts` - Slack API functions
2. Create `lib/task-executor.ts` - Shared execution logic
3. Refactor `api/task.ts` - Use shared executor, verify backward compat

### Phase 2: Slack Integration
4. Create `api/slack/events.ts` - Slack webhook handler
5. Update `.env.example` - Document SLACK_SIGNING_SECRET
6. Test: DM to bot, @mention, progress updates

### Phase 3: Streaming Enhancement
7. Modify `lib/sandbox.ts` - Add progress emission
8. Wire progress events to Slack message updates
9. (Optional) Create `api/task/stream.ts` for SSE

---

## Slack App Setup

### 1. Create Slack App

Go to https://api.slack.com/apps and create a new app.

### 2. Bot Token Scopes

Add these OAuth scopes under **OAuth & Permissions**:

| Scope | Purpose |
|-------|---------|
| `app_mentions:read` | Receive @mention events |
| `chat:write` | Post and update messages |
| `im:history` | Read DM history |
| `im:read` | Receive DM events |
| `im:write` | Send DMs |

### 3. Event Subscriptions

Enable events and subscribe to:

| Event | Purpose |
|-------|---------|
| `app_mention` | Bot mentioned in channel |
| `message.im` | DM to bot |

### 4. Request URL

Set the Request URL to:
```
https://<your-app>.vercel.app/api/slack/events
```

### 5. Install to Workspace

Install the app and copy:
- `SLACK_BOT_TOKEN` (starts with `xoxb-`)
- `SLACK_SIGNING_SECRET` (from Basic Information)

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Streaming approach** | Emit events from sandbox, forward to Slack | Agent SDK already streams; add callback pattern |
| **Update frequency** | Max 1/sec, on significant events | Slack rate limit; update on tool calls, completions |
| **Thread management** | One thread per task | Clean UX; allows follow-up in thread |
| **Dependencies** | None new (use native fetch) | Keep bundle lean for serverless |
| **Signature verification** | Always verify | Security requirement |

---

## Rate Limiting

Slack has strict rate limits for message updates:

| Method | Rate Limit | Our Strategy |
|--------|------------|--------------|
| `chat.postMessage` | ~1/sec per channel | Batch initial posts |
| `chat.update` | ~1/sec per message | Throttle updates |

**Implementation:**
```typescript
const lastUpdateTime = new Map<string, number>();
const MIN_UPDATE_INTERVAL = 1000; // 1 second

export async function updateSlackMessage(channel, ts, text, blocks?) {
  const key = `${channel}:${ts}`;
  const now = Date.now();
  const lastUpdate = lastUpdateTime.get(key) || 0;

  if (now - lastUpdate < MIN_UPDATE_INTERVAL) {
    return null; // Skip, too soon
  }
  lastUpdateTime.set(key, now);

  // ... make API call
}
```

---

## Error Handling

| Error | User Sees | Action |
|-------|-----------|--------|
| Invalid signature | Nothing | Reject silently, log |
| Missing bot token | "Configuration error" | Alert admin |
| Task timeout | "Task timed out after 5 minutes" | Show partial result if available |
| Agent error | "Error: [message]" | Log full trace, show user-friendly message |

---

## Block Kit Message Formats

### Progress Update
```json
{
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": ":hourglass_flowing_sand: *Processing...*\n> Analyzing task and selecting tools"
      }
    }
  ]
}
```

### Completed Task
```json
{
  "blocks": [
    {
      "type": "header",
      "text": { "type": "plain_text", "text": "✅ Task Completed" }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "Created contact Sarah (TechCorp)\nLogged meeting note\nScheduled follow-up for Thursday"
      }
    },
    {
      "type": "context",
      "elements": [
        { "type": "mrkdwn", "text": "Profile: `crm` | Duration: 45.2s" }
      ]
    }
  ]
}
```

---

## Testing

### Local Development

1. Start local server: `vercel dev`
2. Use ngrok to expose: `ngrok http 3000`
3. Update Slack app Request URL with ngrok URL
4. Test DM and @mention

### Vercel Preview

1. Push to branch
2. Vercel auto-deploys preview
3. Update Slack app Request URL
4. Test with real Slack events

### Verification Checklist

- [ ] URL verification challenge works
- [ ] Signature verification rejects invalid requests
- [ ] Bot responds to DMs
- [ ] Bot responds to @mentions
- [ ] Progress updates appear (not too fast)
- [ ] Final result formatted with Block Kit
- [ ] Errors show user-friendly message
- [ ] Direct API (`POST /api/task`) still works

---

## Dependencies

**No new dependencies required!**

Uses:
- Native `fetch` for Slack API (Node 18+)
- Built-in `crypto` for signature verification
- Existing: `@vercel/blob`, `@vercel/sandbox`, `@anthropic-ai/claude-agent-sdk`

---

## Security Considerations

1. **Always verify Slack signatures** - Never process unverified requests
2. **Reject old timestamps** - Prevent replay attacks (>5 min old)
3. **Ignore bot messages** - Prevent infinite loops (check `bot_id`)
4. **Never log secrets** - Tokens and signing secrets stay out of logs
5. **Sandbox isolation** - Agent runs in Vercel Sandbox, limiting blast radius

---

## Future Enhancements

- [ ] Slash commands (`/task`, `/status`)
- [ ] Interactive buttons (cancel, retry)
- [ ] Home tab with task history
- [ ] Thread-based conversations (follow-up questions)
- [ ] Web UI with SSE streaming
- [ ] iOS Shortcuts integration guide
