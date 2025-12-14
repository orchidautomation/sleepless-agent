/**
 * Integration test for the refactored sandbox executor
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { executeInSandbox } from "./lib/sandbox.js";

async function main() {
  console.log("Testing refactored sandbox executor...\n");

  const result = await executeInSandbox({
    task: "What is the capital of France? Reply with just the city name.",
    mcps: [],
    timeout: "5m",
  });

  console.log("\n--- Result ---");
  console.log("Success:", result.success);
  console.log("Output:", result.output);
  console.log("Error:", result.error || "none");
  console.log("Duration:", result.duration, "ms");
}

main().catch((err) => {
  console.error("Test failed:", err.message);
  process.exit(1);
});
