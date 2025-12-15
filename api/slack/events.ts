/**
 * POST /api/slack/events
 * Webhook endpoint for all Slack events
 *
 * This is the single entry point for:
 * - Event subscriptions (app_mention, message.im, etc.)
 * - Interactivity (button clicks, modal submissions)
 * - Slash commands (future)
 */

import { app } from "../../server/app.js";
import { routeTask } from "../../lib/router.js";
import { executeInSandbox } from "../../lib/sandbox.js";
import crypto from "crypto";

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET!;

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

  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature =
    "v0=" +
    crypto
      .createHmac("sha256", SLACK_SIGNING_SECRET)
      .update(sigBasestring)
      .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(mySignature),
    Buffer.from(signature)
  );
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

  const updateAssistantStatus = async (status: string) => {
    if (isAssistantThread) {
      try {
        await app.client.assistant.threads.setStatus({
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
    thinkingMsg = await app.client.chat.postMessage({
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
    console.log(`[Events] Routed to: ${routing.profile}`);

    await updateAssistantStatus(`is working with ${routing.profile} tools...`);

    const startTime = Date.now();
    const result = await executeInSandbox({
      task,
      mcps: routing.mcps,
      timeout: "5m",
    });
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    await updateAssistantStatus("");

    // Build result blocks
    const output = markdownToSlack(result.output);
    const resultBlocks = result.success
      ? [
          { type: "section", text: { type: "mrkdwn", text: `✅ *Task completed* _${duration}s_` } },
          { type: "context", elements: [{ type: "mrkdwn", text: `🎯 ${routing.profile} • 📦 ${routing.mcps.join(", ")}` }] },
          { type: "divider" },
          { type: "section", text: { type: "mrkdwn", text: output.slice(0, 2900) } },
        ]
      : [
          { type: "section", text: { type: "mrkdwn", text: `❌ *Task failed*\n\n${result.error || "Unknown error"}` } },
        ];

    if (thinkingMsg?.ts) {
      await app.client.chat.update({
        channel,
        ts: thinkingMsg.ts,
        text: result.success ? `Task completed in ${duration}s` : "Task failed",
        blocks: resultBlocks,
      });
    } else {
      await app.client.chat.postMessage({
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
      await app.client.chat.update({
        channel,
        ts: thinkingMsg.ts,
        text: "Error",
        blocks: [{ type: "section", text: { type: "mrkdwn", text: `❌ *Error*\n\n${errorMsg}` } }],
      });
    } else {
      await app.client.chat.postMessage({
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

    // Handle app_mention
    if (event.type === "app_mention") {
      const text = (event.text || "").replace(/<@[^>]+>/g, "").trim();
      const channel = event.channel;
      const thread_ts = event.thread_ts || event.ts;

      if (text) {
        executeTask(text, channel, thread_ts, false).catch(console.error);
      } else {
        app.client.chat.postMessage({
          channel,
          thread_ts,
          text: "👋 Hi! I'm Personal OS. Tell me what you'd like help with!",
        }).catch(console.error);
      }
    }

    // Handle assistant_thread_started
    if (event.type === "assistant_thread_started") {
      const channel = event.assistant_thread?.channel_id;
      const thread_ts = event.assistant_thread?.thread_ts;

      if (channel && thread_ts) {
        app.client.chat.postMessage({
          channel,
          thread_ts,
          text: "👋 Hi! I'm Personal OS, your AI assistant.",
        }).catch(console.error);

        app.client.assistant.threads.setSuggestedPrompts({
          channel_id: channel,
          thread_ts,
          prompts: [
            { title: "Research a company", message: "Research Stripe and tell me about their products" },
            { title: "Web search", message: "What are the latest AI news today?" },
          ],
        }).catch(console.error);
      }
    }

    // Handle DM messages
    if (event.type === "message" && event.channel_type === "im" && !event.bot_id) {
      const text = event.text || "";
      const channel = event.channel;
      const thread_ts = event.thread_ts || event.ts;

      if (text) {
        executeTask(text, channel, thread_ts, true).catch(console.error);
      }
    }
  }

  return response;
}
