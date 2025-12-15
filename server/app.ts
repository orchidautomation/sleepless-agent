/**
 * Slack Bolt App initialization with Vercel adapter
 * This is the main entry point for the Slack integration
 */

import { App, LogLevel } from "@slack/bolt";
import { VercelReceiver } from "@vercel/slack-bolt";
import { env } from "./env.js";
import { registerListeners } from "./listeners/index.js";

// Set log level based on environment
const logLevel = env.NODE_ENV === "development" ? LogLevel.DEBUG : LogLevel.INFO;

// Create the Vercel receiver for serverless deployment
const receiver = new VercelReceiver({
  signingSecret: env.SLACK_SIGNING_SECRET,
  logLevel,
});

// Create the Bolt app
const app = new App({
  token: env.SLACK_BOT_TOKEN,
  receiver,
  logLevel,
});

// Register all event listeners
registerListeners(app);

export { app, receiver };
