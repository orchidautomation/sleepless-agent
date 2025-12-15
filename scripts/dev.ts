#!/usr/bin/env npx tsx
/**
 * Development script - starts ngrok tunnel + vercel dev
 *
 * IMPORTANT: Run directly, NOT via npm script:
 *   npx tsx scripts/dev.ts
 *
 * Running via npm causes Vercel's recursive invocation detection to trigger.
 */

import ngrok from "@ngrok/ngrok";
import { spawn, type ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";

// Load environment variables from .env.local
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const NGROK_AUTH_TOKEN = process.env.NGROK_AUTH_TOKEN;
const DEV_PORT = 3000;
const MANIFEST_PATH = path.join(process.cwd(), "manifest.json");

let originalManifest: string | null = null;

async function updateManifest(tunnelUrl: string): Promise<void> {
  try {
    originalManifest = fs.readFileSync(MANIFEST_PATH, "utf-8");
    const manifest = JSON.parse(originalManifest);

    if (manifest.settings?.event_subscriptions) {
      manifest.settings.event_subscriptions.request_url = `${tunnelUrl}/api/slack/events`;
    }
    if (manifest.settings?.interactivity) {
      manifest.settings.interactivity.request_url = `${tunnelUrl}/api/slack/events`;
    }

    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
    console.log(`  ✓ Updated manifest.json`);
  } catch (error) {
    console.error("Failed to update manifest:", error);
  }
}

function restoreManifest(): void {
  if (originalManifest) {
    try {
      fs.writeFileSync(MANIFEST_PATH, originalManifest);
      console.log("  ✓ Restored manifest.json");
    } catch (error) {
      console.error("Failed to restore manifest:", error);
    }
  }
}

async function main(): Promise<void> {
  if (!NGROK_AUTH_TOKEN) {
    console.error(`
  Missing NGROK_AUTH_TOKEN in .env.local

  Get your token at: https://dashboard.ngrok.com/get-started/your-authtoken
  Then add: NGROK_AUTH_TOKEN=your_token_here
    `);
    process.exit(1);
  }

  console.log("\n  Personal OS Development Environment\n");

  let listener: ngrok.Listener | null = null;
  let devProcess: ChildProcess | null = null;

  const cleanup = async (): Promise<void> => {
    console.log("\n  Shutting down...");
    if (devProcess) devProcess.kill();
    if (listener) await listener.close();
    restoreManifest();
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  try {
    // 1. Start ngrok
    console.log("  1. Starting ngrok tunnel...");
    listener = await ngrok.connect({
      addr: DEV_PORT,
      authtoken: NGROK_AUTH_TOKEN,
    });

    const tunnelUrl = listener.url();
    if (!tunnelUrl) throw new Error("Failed to get tunnel URL");
    console.log(`     ${tunnelUrl}`);

    // 2. Update manifest
    console.log("\n  2. Updating manifest...");
    await updateManifest(tunnelUrl);

    // 3. Start local dev server (bypasses Vercel CLI issues)
    console.log("\n  3. Starting local dev server...\n");

    console.log(`
  ════════════════════════════════════════
  Tunnel:  ${tunnelUrl}
  Webhook: ${tunnelUrl}/api/slack/events
  ════════════════════════════════════════

  Configure your Slack app at https://api.slack.com/apps:
  • Event Subscriptions → Request URL
  • Interactivity → Request URL

  Press Ctrl+C to stop.
  ────────────────────────────────────────
    `);

    // Spawn local server (bypasses Vercel dev issues)
    devProcess = spawn("npx", ["tsx", "scripts/local-server.ts"], {
      stdio: "inherit",
      cwd: process.cwd(),
      env: {
        ...process.env,
        TUNNEL_URL: tunnelUrl,
      },
    });

    devProcess.on("error", (error) => {
      console.error("Failed to start dev server:", error);
      cleanup();
    });

    devProcess.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        console.error(`Dev server exited with code ${code}`);
      }
      cleanup();
    });
  } catch (error) {
    console.error("Startup failed:", error);
    cleanup();
  }
}

main().catch(console.error);
