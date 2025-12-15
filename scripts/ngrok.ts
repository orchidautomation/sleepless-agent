/**
 * ngrok tunnel script (standalone)
 * Starts ngrok tunnel and updates manifest.json
 *
 * Usage: npx tsx scripts/ngrok.ts
 */

import ngrok from "@ngrok/ngrok";
import * as fs from "fs";
import * as path from "path";

// Load environment variables from .env.local
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const NGROK_AUTH_TOKEN = process.env.NGROK_AUTH_TOKEN;
const DEV_PORT = 3000;
const MANIFEST_PATH = path.join(process.cwd(), "manifest.json");

// Store original manifest for restoration
let originalManifest: string | null = null;

async function updateManifest(tunnelUrl: string): Promise<void> {
  try {
    originalManifest = fs.readFileSync(MANIFEST_PATH, "utf-8");
    const manifest = JSON.parse(originalManifest);

    // Update event subscriptions URL
    if (manifest.settings?.event_subscriptions) {
      manifest.settings.event_subscriptions.request_url = `${tunnelUrl}/api/slack/events`;
    }

    // Update interactivity URL
    if (manifest.settings?.interactivity) {
      manifest.settings.interactivity.request_url = `${tunnelUrl}/api/slack/events`;
    }

    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
    console.log(`  Updated manifest.json with tunnel URL`);
  } catch (error) {
    console.error("Failed to update manifest:", error);
  }
}

function restoreManifest(): void {
  if (originalManifest) {
    try {
      fs.writeFileSync(MANIFEST_PATH, originalManifest);
      console.log("\n  Restored original manifest.json");
    } catch (error) {
      console.error("Failed to restore manifest:", error);
    }
  }
}

async function main(): Promise<void> {
  // Check for ngrok auth token
  if (!NGROK_AUTH_TOKEN) {
    console.error(`
  Missing NGROK_AUTH_TOKEN in environment variables.

  To get a token:
  1. Sign up at https://dashboard.ngrok.com/signup
  2. Get your auth token from https://dashboard.ngrok.com/get-started/your-authtoken
  3. Add it to .env.local: NGROK_AUTH_TOKEN=your_token_here
    `);
    process.exit(1);
  }

  console.log("\n  Starting ngrok tunnel...\n");

  let listener: ngrok.Listener | null = null;

  // Cleanup function
  const cleanup = async (): Promise<void> => {
    console.log("\n  Shutting down ngrok...");

    // Close ngrok tunnel
    if (listener) {
      await listener.close();
    }

    // Restore manifest
    restoreManifest();

    process.exit(0);
  };

  // Handle shutdown signals
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  try {
    // Start ngrok tunnel
    listener = await ngrok.connect({
      addr: DEV_PORT,
      authtoken: NGROK_AUTH_TOKEN,
    });

    const tunnelUrl = listener.url();
    if (!tunnelUrl) {
      throw new Error("Failed to get tunnel URL");
    }

    // Update manifest with tunnel URL
    await updateManifest(tunnelUrl);

    // Print instructions
    console.log(`
  ========================================
  Personal OS Development Tunnel
  ========================================

  Tunnel URL: ${tunnelUrl}
  Webhook URL: ${tunnelUrl}/api/slack/events

  STEP 1: Start dev server (in a new terminal):
  ───────────────────────────────────────
  npm run dev
  ───────────────────────────────────────

  STEP 2: Configure Slack App:
  1. Go to: https://api.slack.com/apps
  2. Event Subscriptions -> Request URL:
     ${tunnelUrl}/api/slack/events
  3. Interactivity -> Request URL:
     ${tunnelUrl}/api/slack/events
  4. Wait for URL verification ✓

  STEP 3: Test by @mentioning the bot in Slack!

  Press Ctrl+C to stop the tunnel.
  ========================================
    `);

    // Keep running
    await new Promise(() => {});
  } catch (error) {
    console.error("Startup failed:", error);
    cleanup();
  }
}

main().catch(console.error);
