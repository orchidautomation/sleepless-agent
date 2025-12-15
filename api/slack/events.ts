/**
 * POST /api/slack/events
 * Webhook endpoint for all Slack events
 *
 * This is the single entry point for:
 * - Event subscriptions (app_mention, message.im, etc.)
 * - Interactivity (button clicks, modal submissions)
 * - Slash commands (future)
 */

import { createHandler } from "@vercel/slack-bolt";
import { app, receiver } from "../../server/app.js";

// Create the handler using createHandler from @vercel/slack-bolt
const handler = createHandler(app, receiver);

/**
 * POST handler for Slack events
 * Uses the new Vercel function signature (Request -> Response)
 */
export async function POST(req: Request): Promise<Response> {
  return handler(req);
}
