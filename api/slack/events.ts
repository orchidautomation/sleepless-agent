/**
 * POST /api/slack/events
 * Webhook endpoint for all Slack events
 *
 * This is the single entry point for:
 * - Event subscriptions (app_mention, message.im, etc.)
 * - Interactivity (button clicks, modal submissions)
 * - Slash commands (future)
 */

import crypto from "crypto";
import { WebClient } from "@slack/web-api";
import { waitUntil } from "@vercel/functions";

// Initialize Slack client lazily
let slackClient: WebClient | null = null;
function getSlackClient(): WebClient {
  if (!slackClient) {
    slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);
  }
  return slackClient;
}

// Lazy imports for heavy modules
let routeTask: typeof import("../../lib/router.js").routeTask;
let executeInSandbox: typeof import("../../lib/sandbox.js").executeInSandbox;
let executeDirectly: typeof import("../../lib/direct-executor.js").executeDirectly;

async function loadModules() {
  if (!routeTask) {
    const router = await import("../../lib/router.js");
    routeTask = router.routeTask;
  }
  if (!executeInSandbox) {
    const sandbox = await import("../../lib/sandbox.js");
    executeInSandbox = sandbox.executeInSandbox;
  }
  if (!executeDirectly) {
    const direct = await import("../../lib/direct-executor.js");
    executeDirectly = direct.executeDirectly;
  }
}

// Spinner frames for animation
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/**
 * Convert markdown to Slack mrkdwn format
 */
function markdownToSlack(text: string): string {
  return text
    .replace(/^###\s+(.+)$/gm, "*$1*")
    .replace(/^##\s+(.+)$/gm, "*$1*")
    .replace(/^#\s+(.+)$/gm, "*$1*")
    .replace(/\*\*([^*]+?)\*\*/g, "*$1*")
    .replace(/\*\*\*([^*]+?)\*\*\*/g, "*_$1_*")
    .replace(/__([^_]+?)__/g, "_$1_")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<$2|$1>")
    .replace(/^[-*]{3,}$/gm, "───────────────────")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\*\*+/g, "*");
}

/**
 * Verify Slack request signature
 */
function verifySlackRequest(
  signature: string | null,
  timestamp: string | null,
  body: string
): boolean {
  if (!signature || !timestamp) return false;

  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    console.error("[Events] Missing SLACK_SIGNING_SECRET");
    return false;
  }

  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature =
    "v0=" +
    crypto
      .createHmac("sha256", signingSecret)
      .update(sigBasestring)
      .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(mySignature),
      Buffer.from(signature)
    );
  } catch {
    return false;
  }
}

/**
 * Execute a task and post results to Slack
 */
async function executeTask(
  task: string,
  channel: string,
  thread_ts: string,
  isAssistantThread: boolean = false
): Promise<void> {
  console.log(`[Events] Executing task: "${task.slice(0, 50)}..."`);

  // Load heavy modules
  await loadModules();
  const client = getSlackClient();

  const updateAssistantStatus = async (status: string) => {
    if (isAssistantThread) {
      try {
        await client.assistant.threads.setStatus({
          channel_id: channel,
          thread_ts,
          status,
        });
      } catch {
        // Ignore
      }
    }
  };

  await updateAssistantStatus("is thinking...");

  // For channels, post a thinking message
  let thinkingMsg: { ts?: string } | null = null;
  if (!isAssistantThread) {
    thinkingMsg = await client.chat.postMessage({
      channel,
      thread_ts,
      text: "Analyzing your request...",
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: `${SPINNER[0]} *Analyzing your request...*` },
        },
      ],
    });
  }

  try {
    await updateAssistantStatus("is analyzing the request...");
    const routing = await routeTask(task);
    console.log(`[Events] Routed to: ${routing.profile} (${routing.complexity})`);

    let result: { output: string; success: boolean; error?: string };
    let duration: string;
    const startTime = Date.now();

    // HYBRID ROUTING: Use direct execution for simple tasks, sandbox for complex
    if (routing.complexity === "simple") {
      console.log(`[Events] Using FAST direct execution`);
      await updateAssistantStatus("is responding...");
      result = await executeDirectly(task);
      duration = ((Date.now() - startTime) / 1000).toFixed(1);
    } else {
      console.log(`[Events] Using FULL sandbox execution`);
      await updateAssistantStatus(`is working with ${routing.profile} tools...`);
      result = await executeInSandbox({
        task,
        mcps: routing.mcps,
        timeout: "5m",
      });
      duration = ((Date.now() - startTime) / 1000).toFixed(1);
    }

    await updateAssistantStatus("");

    // Build result blocks - different format for simple vs complex
    const output = markdownToSlack(result.output);
    const resultBlocks = result.success
      ? routing.complexity === "simple"
        ? [
            // Simple: Just show the response, minimal chrome
            { type: "section", text: { type: "mrkdwn", text: output.slice(0, 2900) } },
            { type: "context", elements: [{ type: "mrkdwn", text: `⚡ _${duration}s_` }] },
          ]
        : [
            // Complex: Show full metadata
            { type: "section", text: { type: "mrkdwn", text: `✅ *Task completed* _${duration}s_` } },
            { type: "context", elements: [{ type: "mrkdwn", text: `🎯 ${routing.profile} • 📦 ${routing.mcps.join(", ")}` }] },
            { type: "divider" },
            { type: "section", text: { type: "mrkdwn", text: output.slice(0, 2900) } },
          ]
      : [
          { type: "section", text: { type: "mrkdwn", text: `❌ *Task failed*\n\n${result.error || "Unknown error"}` } },
        ];

    if (thinkingMsg?.ts) {
      await client.chat.update({
        channel,
        ts: thinkingMsg.ts,
        text: result.success ? `Task completed in ${duration}s` : "Task failed",
        blocks: resultBlocks,
      });
    } else {
      await client.chat.postMessage({
        channel,
        thread_ts,
        text: result.success ? `Task completed in ${duration}s` : "Task failed",
        blocks: resultBlocks,
        unfurl_links: false,
      });
    }
  } catch (error) {
    await updateAssistantStatus("");
    const errorMsg = error instanceof Error ? error.message : "Unknown error";

    if (thinkingMsg?.ts) {
      await client.chat.update({
        channel,
        ts: thinkingMsg.ts,
        text: "Error",
        blocks: [{ type: "section", text: { type: "mrkdwn", text: `❌ *Error*\n\n${errorMsg}` } }],
      });
    } else {
      await client.chat.postMessage({
        channel,
        thread_ts,
        text: `Error: ${errorMsg}`,
      });
    }
  }
}

/**
 * POST handler for Slack events
 */
export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Handle URL verification challenge
  if (body.type === "url_verification") {
    console.log("[Events] URL verification challenge");
    return new Response(JSON.stringify({ challenge: body.challenge }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Verify signature
  const signature = req.headers.get("x-slack-signature");
  const timestamp = req.headers.get("x-slack-request-timestamp");
  const isValid = verifySlackRequest(signature, timestamp, rawBody);

  if (!isValid) {
    console.log("[Events] Invalid signature");
    return new Response("Invalid signature", { status: 401 });
  }

  // Acknowledge immediately
  const response = new Response("ok", { status: 200 });

  // Process event asynchronously
  if (body.event) {
    const event = body.event;
    console.log(`[Events] Event type: ${event.type}`);

    const client = getSlackClient();

    // Handle app_mention
    if (event.type === "app_mention") {
      const text = (event.text || "").replace(/<@[^>]+>/g, "").trim();
      const channel = event.channel;
      const thread_ts = event.thread_ts || event.ts;

      if (text) {
        // Use waitUntil to keep function alive during async processing
        waitUntil(executeTask(text, channel, thread_ts, false));
      } else {
        waitUntil(client.chat.postMessage({
          channel,
          thread_ts,
          text: "👋 Hi! I'm Personal OS. Tell me what you'd like help with!",
        }));
      }
    }

    // Handle assistant_thread_started
    if (event.type === "assistant_thread_started") {
      const channel = event.assistant_thread?.channel_id;
      const thread_ts = event.assistant_thread?.thread_ts;

      if (channel && thread_ts) {
        waitUntil(client.chat.postMessage({
          channel,
          thread_ts,
          text: "👋 Hi! I'm Personal OS, your AI assistant.",
        }));

        waitUntil(client.assistant.threads.setSuggestedPrompts({
          channel_id: channel,
          thread_ts,
          prompts: [
            { title: "Research a company", message: "Research Stripe and tell me about their products" },
            { title: "Web search", message: "What are the latest AI news today?" },
          ],
        }));
      }
    }

    // Handle DM messages
    if (event.type === "message" && event.channel_type === "im" && !event.bot_id) {
      const text = event.text || "";
      const channel = event.channel;
      const thread_ts = event.thread_ts || event.ts;

      if (text) {
        // Use waitUntil to keep function alive during async processing
        waitUntil(executeTask(text, channel, thread_ts, true));
      }
    }
  }

  return response;
}
