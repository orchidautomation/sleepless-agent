#!/usr/bin/env npx tsx
/**
 * Simple local development server for Slack webhook testing
 * Handles Slack events directly without @vercel/slack-bolt createHandler
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import crypto from "crypto";
import { app } from "../server/app.js";
import { env } from "../server/env.js";

const PORT = 3000;

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

          try {
            await app.client.chat.postMessage({
              channel,
              thread_ts,
              text: `Hello <@${userId}>! I received your message: "${text}"\n\nThis is Personal OS - your AI assistant. Task execution coming soon!`,
            });
            console.log("  → Response sent!");
          } catch (err) {
            console.error("  → Failed to send response:", err);
          }
        }

        // Handle assistant_thread_started (Agent Panel)
        if (event.type === "assistant_thread_started") {
          const channel = event.assistant_thread?.channel_id;
          const thread_ts = event.assistant_thread?.thread_ts;

          console.log(`  → Assistant thread started in ${channel}`);

          if (channel && thread_ts) {
            try {
              await app.client.chat.postMessage({
                channel,
                thread_ts,
                text: "👋 Hi! I'm Personal OS, your AI assistant.\n\nI can help with:\n• Research tasks\n• CRM management\n• General questions\n\nWhat would you like help with?",
              });
              console.log("  → Welcome message sent!");
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

          try {
            await app.client.chat.postMessage({
              channel,
              thread_ts,
              text: `I received: "${text}"\n\nTask execution coming soon!`,
            });
            console.log("  → Response sent!");
          } catch (err) {
            console.error("  → Failed to send response:", err);
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
