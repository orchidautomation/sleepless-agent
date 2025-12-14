/**
 * Interactive router test
 * Run with: npx tsx test-interactive.ts
 *
 * Type a task and see how it gets routed!
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import * as readline from "readline";
import { routeTask } from "./lib/router.js";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("\n=== Personal OS Router Test ===");
console.log("Type a task to see how it gets routed.");
console.log("Type 'quit' to exit.\n");

function prompt() {
  rl.question("Task: ", async (task) => {
    if (task.toLowerCase() === "quit") {
      console.log("Bye!");
      rl.close();
      return;
    }

    if (!task.trim()) {
      prompt();
      return;
    }

    try {
      const result = await routeTask(task);
      console.log("\n┌─────────────────────────────────────────");
      console.log(`│ Profile:    ${result.profile}`);
      console.log(`│ MCPs:       ${result.mcps.join(", ")}`);
      console.log(`│ Confidence: ${(result.confidence * 100).toFixed(0)}%`);
      console.log(`│ Reasoning:  ${result.reasoning}`);
      console.log("└─────────────────────────────────────────\n");
    } catch (error) {
      console.log(`Error: ${error}`);
    }

    prompt();
  });
}

prompt();
