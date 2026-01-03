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
import { executeTask } from "../../lib/ai.js";

// Initialize Slack client lazily
let slackClient: WebClient | null = null;
function getSlackClient(): WebClient {
  if (!slackClient) {
    slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);
  }
  return slackClient;
}

// Cache bot user ID
let botUserId: string | null = null;
async function getBotUserId(): Promise<string> {
  if (botUserId) {
    return botUserId;
  }

  const client = getSlackClient();
  const result = await client.auth.test();
  botUserId = result.user_id || "";
  return botUserId;
}

// Spinner frames for animation
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/**
 * Convert markdown to Slack mrkdwn format
 * Handles: headings, bold, italic, links, code, lists, tables, dividers
 */
function markdownToSlack(text: string): string {
  let result = text;

  // Convert headings to bold with line breaks for visual hierarchy
  result = result.replace(/^###\s+(.+)$/gm, "\n*$1*");
  result = result.replace(/^##\s+(.+)$/gm, "\n*$1*");
  result = result.replace(/^#\s+(.+)$/gm, "\n*$1*\n");

  // Convert bold (** or __)
  result = result.replace(/\*\*\*([^*]+?)\*\*\*/g, "*_$1_*"); // bold italic
  result = result.replace(/\*\*([^*]+?)\*\*/g, "*$1*");
  result = result.replace(/__([^_]+?)__/g, "*$1*");

  // Convert links [text](url) to Slack format <url|text>
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<$2|$1>");

  // Convert inline code (but not code blocks)
  result = result.replace(/`([^`\n]+)`/g, "`$1`");

  // Convert markdown tables to formatted text
  // Detect table rows and format them nicely
  result = result.replace(/^\|(.+)\|$/gm, (match, content) => {
    const cells = content.split("|").map((c: string) => c.trim());
    // Skip separator rows (----)
    if (cells.every((c: string) => /^[-:]+$/.test(c))) {
      return "─".repeat(40);
    }
    return cells.join("  |  ");
  });

  // Convert markdown lists with proper bullets
  result = result.replace(/^[-*]\s+/gm, "• ");
  result = result.replace(/^\d+\.\s+/gm, (match) => match); // Keep numbered lists as-is

  // Convert horizontal rules
  result = result.replace(/^[-*]{3,}$/gm, "────────────────────────────");

  // Clean up excessive whitespace
  result = result.replace(/\n{3,}/g, "\n\n");

  // Fix any double asterisks that slipped through
  result = result.replace(/\*\*+/g, "*");

  // Trim leading/trailing whitespace
  result = result.trim();

  return result;
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
 * Fetch thread history and convert to conversation format
 */
async function getThreadHistory(
  client: WebClient,
  channel: string,
  thread_ts: string,
  botUserId: string
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  try {
    const result = await client.conversations.replies({
      channel,
      ts: thread_ts,
      limit: 20, // Last 20 messages should be enough context
    });

    if (!result.messages || result.messages.length <= 1) {
      return [];
    }

    // Convert to conversation format, excluding the current message (last one)
    const history: Array<{ role: "user" | "assistant"; content: string }> = [];
    const messages = result.messages.slice(0, -1); // Exclude last message (current)

    for (const msg of messages) {
      if (!msg.text) continue;

      // Clean up bot mentions from text
      const cleanText = msg.text.replace(/<@[^>]+>/g, "").trim();
      if (!cleanText) continue;

      const role = msg.user === botUserId ? "assistant" : "user";
      history.push({ role, content: cleanText });
    }

    return history;
  } catch (error) {
    console.error("[Events] Failed to fetch thread history:", error);
    return [];
  }
}

/**
 * Send ephemeral response to slash command
 */
async function sendEphemeral(responseUrl: string, text: string): Promise<void> {
  await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: markdownToSlack(text), response_type: "ephemeral" }),
  });
}

/**
 * Handle /ask command - quick private query
 */
async function handleAskCommand(
  text: string,
  responseUrl: string
): Promise<void> {
  if (!text) {
    await sendEphemeral(responseUrl, "Usage: `/ask [your question]`");
    return;
  }

  console.log(`[Commands] /ask: "${text.slice(0, 50)}..."`);

  const result = await executeTask(text);
  await sendEphemeral(
    responseUrl,
    result.success ? result.output : "Something went wrong. Please try again."
  );
}

/**
 * Handle /research command - research then post to channel
 */
async function handleResearchCommand(
  text: string,
  responseUrl: string,
  channelId: string
): Promise<void> {
  if (!text) {
    await sendEphemeral(responseUrl, "Usage: `/research [company or topic]`");
    return;
  }

  console.log(`[Commands] /research: "${text.slice(0, 50)}..."`);

  await sendEphemeral(responseUrl, `Researching "${text}"...`);

  const result = await executeTask(
    `Research ${text} thoroughly. Include company overview, products, team, funding, and recent news.`
  );

  const client = getSlackClient();
  await client.chat.postMessage({
    channel: channelId,
    text: result.success ? result.output.slice(0, 200) : "Research failed",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: markdownToSlack(
            result.success ? result.output.slice(0, 2900) : "Something went wrong. Please try again."
          ),
        },
      },
    ],
    unfurl_links: false,
  });
}

/**
 * Handle /task command - create Linear issue
 */
async function handleTaskCommand(
  text: string,
  responseUrl: string
): Promise<void> {
  if (!text) {
    await sendEphemeral(responseUrl, "Usage: `/task [description]`");
    return;
  }

  console.log(`[Commands] /task: "${text.slice(0, 50)}..."`);

  const result = await executeTask(
    `Create a Linear issue with this description: ${text}. Use the Linear MCP tools.`
  );

  await sendEphemeral(
    responseUrl,
    result.success
      ? `Task created: ${result.output}`
      : "Failed to create task. Try again."
  );
}

/**
 * Execute a task and post results to Slack
 */
async function handleTask(
  task: string,
  channel: string,
  thread_ts: string,
  isAssistantThread: boolean = false,
  botUserId: string = ""
): Promise<void> {
  console.log(`[Events] Executing task: "${task.slice(0, 50)}..."`);

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

  // Fetch thread history for context
  const conversationHistory = await getThreadHistory(client, channel, thread_ts, botUserId);
  if (conversationHistory.length > 0) {
    console.log(`[Events] Loaded ${conversationHistory.length} previous messages from thread`);
  }

  // Post initial status message
  let statusMsg: { ts?: string } | null = null;
  const toolsCalled: string[] = [];

  if (!isAssistantThread) {
    statusMsg = await client.chat.postMessage({
      channel,
      thread_ts,
      text: "Working...",
      blocks: [
        {
          type: "context",
          elements: [{ type: "mrkdwn", text: `${SPINNER[0]} _Thinking..._` }],
        },
      ],
    });
  }

  // Helper to update status message with tool progress
  const updateStatusMessage = async (toolName?: string) => {
    if (toolName) {
      toolsCalled.push(toolName);
    }

    const statusText = toolsCalled.length > 0
      ? `_Using: ${toolsCalled.slice(-3).join(" → ")}_`
      : "_Thinking..._";

    if (isAssistantThread) {
      await updateAssistantStatus(toolsCalled.length > 0 ? `is using ${toolsCalled[toolsCalled.length - 1]}...` : "is thinking...");
    } else if (statusMsg?.ts) {
      try {
        await client.chat.update({
          channel,
          ts: statusMsg.ts,
          text: "Working...",
          blocks: [
            {
              type: "context",
              elements: [{ type: "mrkdwn", text: `${SPINNER[toolsCalled.length % SPINNER.length]} ${statusText}` }],
            },
          ],
        });
      } catch {
        // Ignore update errors
      }
    }
  };

  try {
    const result = await executeTask(task, {
      conversationHistory,
      onToolCall: (toolName) => {
        // Fire and forget - don't await
        updateStatusMessage(toolName);
      },
    });

    const duration = (result.duration / 1000).toFixed(1);
    console.log(`[Events] Task completed in ${duration}s (${result.stepsUsed} steps, ${toolsCalled.length} tools)`);

    await updateAssistantStatus("");

    // Build result blocks - clean output only, no metadata
    const output = markdownToSlack(result.output);
    const resultBlocks = result.success
      ? [{ type: "section", text: { type: "mrkdwn", text: output.slice(0, 2900) } }]
      : [{ type: "section", text: { type: "mrkdwn", text: `Something went wrong. Please try again.` } }];

    if (statusMsg?.ts) {
      await client.chat.update({
        channel,
        ts: statusMsg.ts,
        text: result.success ? result.output.slice(0, 200) : "Something went wrong",
        blocks: resultBlocks,
      });
    } else {
      await client.chat.postMessage({
        channel,
        thread_ts,
        text: result.success ? result.output.slice(0, 200) : "Something went wrong",
        blocks: resultBlocks,
        unfurl_links: false,
      });
    }
  } catch (error) {
    await updateAssistantStatus("");
    console.error("[Events] Task error:", error);

    const errorBlock = [{ type: "section", text: { type: "mrkdwn", text: `Something went wrong. Please try again.` } }];

    if (statusMsg?.ts) {
      await client.chat.update({
        channel,
        ts: statusMsg.ts,
        text: "Something went wrong",
        blocks: errorBlock,
      });
    } else {
      await client.chat.postMessage({
        channel,
        thread_ts,
        text: "Something went wrong. Please try again.",
        blocks: errorBlock,
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

  // Handle slash commands
  if (body.command) {
    const command = body.command as string;
    const text = (body.text as string) || "";
    const responseUrl = body.response_url as string;
    const channelId = body.channel_id as string;

    console.log(`[Commands] Received ${command}`);

    // Acknowledge immediately with empty response
    const response = new Response("", { status: 200 });

    switch (command) {
      case "/ask":
        waitUntil(handleAskCommand(text, responseUrl));
        break;
      case "/research":
        waitUntil(handleResearchCommand(text, responseUrl, channelId));
        break;
      case "/task":
        waitUntil(handleTaskCommand(text, responseUrl));
        break;
      default:
        console.log(`[Commands] Unknown command: ${command}`);
    }

    return response;
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
        waitUntil((async () => {
          const botId = await getBotUserId();
          await handleTask(text, channel, thread_ts, false, botId);
        })());
      } else {
        waitUntil(client.chat.postMessage({
          channel,
          thread_ts,
          text: "What can I help you with?",
        }));
      }
    }

    // Handle assistant_thread_started - just set suggested prompts, no greeting
    if (event.type === "assistant_thread_started") {
      const channel = event.assistant_thread?.channel_id;
      const thread_ts = event.assistant_thread?.thread_ts;

      if (channel && thread_ts) {
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
        waitUntil((async () => {
          const botId = await getBotUserId();
          await handleTask(text, channel, thread_ts, true, botId);
        })());
      }
    }
  }

  return response;
}
