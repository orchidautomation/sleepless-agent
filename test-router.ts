/**
 * Simple test script for the router
 * Run with: npx tsx test-router.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { routeTask } from "./lib/router.js";

async function test() {
  console.log("Testing router...\n");

  const testCases = [
    "Research the latest AI news",
    "Remind me to call mom tomorrow",
    "Fix the bug in the login page",
    "Had coffee with Sarah from TechCorp",
    "Find out how React hooks work",
    "Send a message to the team about the release",
  ];

  for (const task of testCases) {
    console.log(`Task: "${task}"`);
    try {
      const result = await routeTask(task);
      console.log(`  Profile: ${result.profile}`);
      console.log(`  MCPs: ${result.mcps.join(", ")}`);
      console.log(`  Confidence: ${result.confidence}`);
      console.log(`  Reasoning: ${result.reasoning}`);
    } catch (error) {
      console.log(`  Error: ${error}`);
    }
    console.log("");
  }
}

test();
