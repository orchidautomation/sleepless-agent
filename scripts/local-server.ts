#!/usr/bin/env npx tsx
/**
 * Simple local development server for Slack webhook testing
 * Handles Slack events directly without @vercel/slack-bolt createHandler
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import crypto from "crypto";
import { app } from "../server/app.js";
import { env } from "../server/env.js";
import { routeTask } from "../lib/router.js";
import { executeInSandbox } from "../lib/sandbox.js";

const PORT = 3000;

// Spinner frames for animation
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/**
 * Convert markdown to Slack mrkdwn format
 */
function markdownToSlack(text: string): string {
  return text
    // Headers: ## Header → *Header*
    .replace(/^###\s+(.+)$/gm, "*$1*")
    .replace(/^##\s+(.+)$/gm, "*$1*")
    .replace(/^#\s+(.+)$/gm, "*$1*")
    // Bold: **text** → *text* (handle multi-line and nested)
    .replace(/\*\*([^*]+?)\*\*/g, "*$1*")
    // Also handle ***bold italic*** → *_text_*
    .replace(/\*\*\*([^*]+?)\*\*\*/g, "*_$1_*")
    // Italic with underscores: __text__ → _text_
    .replace(/__([^_]+?)__/g, "_$1_")
    // Links: [text](url) → <url|text>
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<$2|$1>")
    // Horizontal rules: --- or *** → ───
    .replace(/^[-*]{3,}$/gm, "───────────────────")
    // Clean up extra newlines
    .replace(/\n{3,}/g, "\n\n")
    // Ensure no double asterisks remain
    .replace(/\*\*+/g, "*");
}

/**
 * Execute a task and post results to Slack
 */
async function executeTask(
  task: string,
  channel: string,
  thread_ts: string,
  userId: string,
  isAssistantThread: boolean = false
): Promise<void> {
  console.log(`\n  ═══ TASK EXECUTION ═══`);
  console.log(`  Task: "${task}"`);
  console.log(`  Assistant Thread: ${isAssistantThread}`);

  // For Assistant Panel: use setStatus for shimmer effect
  // For channels: use message updates with spinner
  const updateAssistantStatus = async (status: string) => {
    if (isAssistantThread) {
      try {
        await app.client.assistant.threads.setStatus({
          channel_id: channel,
          thread_ts,
          status: status,
        });
      } catch {
        // Ignore status update errors
      }
    }
  };

  // Set initial status for Assistant Panel
  await updateAssistantStatus("is thinking...");

  // For non-assistant threads (channel @mentions), show spinner message
  // For assistant threads, just use the native shimmer status bar
  let thinkingMsg: { ts?: string } | null = null;
  let spinnerInterval: NodeJS.Timeout | null = null;

  if (!isAssistantThread) {
    // Post initial "thinking" message with blocks
    thinkingMsg = await app.client.chat.postMessage({
      channel,
      thread_ts,
      text: "Analyzing your request...",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `${SPINNER[0]} *Analyzing your request...*`,
          },
        },
      ],
    });

    // Start spinner animation for channel messages
    let spinnerIndex = 0;
    let currentStatus = "Analyzing your request...";
    spinnerInterval = setInterval(async () => {
      spinnerIndex = (spinnerIndex + 1) % SPINNER.length;
      try {
        await app.client.chat.update({
          channel,
          ts: thinkingMsg!.ts!,
          text: currentStatus,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `${SPINNER[spinnerIndex]} *${currentStatus}*`,
              },
            },
          ],
        });
      } catch {
        // Ignore update errors
      }
    }, 500);
  }

  try {
    // Route the task to get profile + MCPs
    console.log("  → Routing task...");
    await updateAssistantStatus("is analyzing the request...");
    const routing = await routeTask(task);
    console.log(`  → Routed to: ${routing.profile} (${routing.confidence * 100}% confidence)`);
    console.log(`  → MCPs: ${routing.mcps.join(", ")}`);
    console.log(`  → Reasoning: ${routing.reasoning}`);

    // Update status for assistant threads
    await updateAssistantStatus(`is working with ${routing.profile} tools...`);

    // Execute in sandbox
    console.log("  → Executing in sandbox...");
    const startTime = Date.now();
    const result = await executeInSandbox({
      task,
      mcps: routing.mcps,
      timeout: "5m",
    });
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    // Stop spinner and clear assistant status
    if (spinnerInterval) clearInterval(spinnerInterval);
    await updateAssistantStatus("");

    console.log(`  → Execution ${result.success ? "succeeded" : "failed"} in ${duration}s`);

    // Build result blocks
    const resultBlocks = result.success
      ? [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `✅ *Task completed* _${duration}s_`,
            },
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `🎯 ${routing.profile} • 📦 ${routing.mcps.join(", ")}`,
              },
            ],
          },
          {
            type: "divider",
          },
          // Split long content into multiple blocks (max 3000 chars each)
          ...(() => {
            const output = markdownToSlack(result.output);
            const blocks: Array<{ type: string; text: { type: string; text: string } }> = [];
            const maxLen = 2900; // Leave some buffer under 3000

            if (output.length <= maxLen) {
              blocks.push({
                type: "section",
                text: { type: "mrkdwn", text: output },
              });
            } else {
              // Split by paragraphs first, then by length
              let remaining = output;
              while (remaining.length > 0) {
                let chunk: string;
                if (remaining.length <= maxLen) {
                  chunk = remaining;
                  remaining = "";
                } else {
                  // Try to break at a paragraph
                  let breakPoint = remaining.lastIndexOf("\n\n", maxLen);
                  if (breakPoint < maxLen / 2) {
                    // No good paragraph break, try newline
                    breakPoint = remaining.lastIndexOf("\n", maxLen);
                  }
                  if (breakPoint < maxLen / 2) {
                    // No good break point, just cut
                    breakPoint = maxLen;
                  }
                  chunk = remaining.slice(0, breakPoint);
                  remaining = remaining.slice(breakPoint).trimStart();
                }
                blocks.push({
                  type: "section",
                  text: { type: "mrkdwn", text: chunk },
                });
              }
            }
            return blocks;
          })(),
        ]
      : [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `❌ *Task failed*\n\n${result.error || "Unknown error"}`,
            },
          },
        ];

    // Post result - update existing message for channels, new message for assistant threads
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
    if (spinnerInterval) clearInterval(spinnerInterval);
    await updateAssistantStatus("");
    console.error("  → Task execution error:", error);

    const errorBlocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `❌ *Error executing task*\n\n${error instanceof Error ? error.message : "Unknown error"}`,
        },
      },
    ];

    if (thinkingMsg?.ts) {
      await app.client.chat.update({
        channel,
        ts: thinkingMsg.ts,
        text: "Error executing task",
        blocks: errorBlocks,
      });
    } else {
      await app.client.chat.postMessage({
        channel,
        thread_ts,
        text: "Error executing task",
        blocks: errorBlocks,
      });
    }
  }

  console.log(`  ═══════════════════════\n`);
}

// Parse request body
async function parseBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

// Verify Slack request signature
function verifySlackRequest(
  signature: string | undefined,
  timestamp: string | undefined,
  body: string
): boolean {
  if (!signature || !timestamp) return false;

  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature =
    "v0=" +
    crypto
      .createHmac("sha256", env.SLACK_SIGNING_SECRET)
      .update(sigBasestring)
      .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(mySignature),
    Buffer.from(signature)
  );
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = req.url || "/";
  const method = req.method || "GET";

  console.log(`${method} ${url}`);

  // Health check
  if (url === "/" || url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  // Slack events endpoint
  if (url === "/api/slack/events" && method === "POST") {
    try {
      const rawBody = await parseBody(req);
      const body = JSON.parse(rawBody);

      // Handle URL verification challenge
      if (body.type === "url_verification") {
        console.log("  → URL verification challenge");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ challenge: body.challenge }));
        return;
      }

      // Verify signature (skip in dev for speed, but log it)
      const signature = req.headers["x-slack-signature"] as string;
      const timestamp = req.headers["x-slack-request-timestamp"] as string;
      const isValid = verifySlackRequest(signature, timestamp, rawBody);
      console.log(`  → Signature valid: ${isValid}`);

      // Acknowledge immediately (Slack 3-second rule)
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");

      // Process event asynchronously
      if (body.event) {
        const event = body.event;
        console.log(`  → Event type: ${event.type}`);

        // Handle app_mention
        if (event.type === "app_mention") {
          const text = (event.text || "").replace(/<@[^>]+>/g, "").trim();
          const channel = event.channel;
          const thread_ts = event.thread_ts || event.ts;
          const userId = event.user;

          console.log(`  → @mention from ${userId}: "${text}"`);

          if (text) {
            // Execute the task
            executeTask(text, channel, thread_ts, userId).catch((err) => {
              console.error("  → Task execution failed:", err);
            });
          } else {
            // No task provided, send help message
            await app.client.chat.postMessage({
              channel,
              thread_ts,
              text: "👋 Hi! I'm Personal OS. Tell me what you'd like help with!\n\nExamples:\n• Research company X\n• Add contact to CRM\n• Schedule a meeting",
            });
          }
        }

        // Handle assistant_thread_started (Agent Panel)
        if (event.type === "assistant_thread_started") {
          const channel = event.assistant_thread?.channel_id;
          const thread_ts = event.assistant_thread?.thread_ts;

          console.log(`  → Assistant thread started in ${channel}`);

          if (channel && thread_ts) {
            try {
              // Send welcome message
              await app.client.chat.postMessage({
                channel,
                thread_ts,
                text: "👋 Hi! I'm Personal OS, your AI assistant.\n\nI can help with:\n• Research tasks\n• CRM management\n• General questions\n\nWhat would you like help with?",
              });
              console.log("  → Welcome message sent!");

              // Set suggested prompts for quick actions
              await app.client.assistant.threads.setSuggestedPrompts({
                channel_id: channel,
                thread_ts,
                prompts: [
                  {
                    title: "Research a company",
                    message: "Research Stripe and tell me about their products",
                  },
                  {
                    title: "Add to CRM",
                    message: "Add John Smith from Acme Corp to my CRM",
                  },
                  {
                    title: "Web search",
                    message: "What are the latest AI news today?",
                  },
                ],
              });
              console.log("  → Suggested prompts set!");
            } catch (err) {
              console.error("  → Failed to send welcome:", err);
            }
          }
        }

        // Handle message in assistant thread (DM to bot)
        if (event.type === "message" && event.channel_type === "im" && !event.bot_id) {
          const text = event.text || "";
          const channel = event.channel;
          const thread_ts = event.thread_ts || event.ts;
          const userId = event.user;

          console.log(`  → DM from ${userId}: "${text}"`);

          if (text) {
            // Execute the task (isAssistantThread = true for shimmer effect)
            executeTask(text, channel, thread_ts, userId, true).catch((err) => {
              console.error("  → Task execution failed:", err);
            });
          }
        }
      }
    } catch (error) {
      console.error("Error handling Slack event:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
    return;
  }

  // 404 for everything else
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`
  ════════════════════════════════════════
  Local Development Server
  ════════════════════════════════════════

  Server running at http://localhost:${PORT}

  Endpoints:
  • GET  /              - Health check
  • POST /api/slack/events - Slack webhook

  ════════════════════════════════════════
  `);
});
