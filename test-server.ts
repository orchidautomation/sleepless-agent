/**
 * Simple local HTTP server for testing
 * Run with: npx tsx test-server.ts
 * Then test with: curl -X POST http://localhost:3000/api/task -H "Content-Type: application/json" -H "x-api-key: test" -d '{"task":"Research AI news"}'
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createServer } from "http";
import { routeTask } from "./lib/router.js";
import { executeInSandbox } from "./lib/sandbox.js";

const PORT = 3000;

const server = createServer(async (req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method !== "POST" || !req.url?.startsWith("/api/task")) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found. Use POST /api/task" }));
    return;
  }

  // Check API key
  const apiKey = req.headers["x-api-key"];
  const expectedKey = process.env.PERSONAL_OS_API_KEY || "test";
  if (apiKey !== expectedKey && apiKey !== "test") {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  // Parse body
  let body = "";
  for await (const chunk of req) {
    body += chunk;
  }

  try {
    const { task, profile: forceProfile, mcps: forceMcps } = JSON.parse(body);

    if (!task) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing required field: task" }));
      return;
    }

    console.log(`\n${"=".repeat(50)}`);
    console.log(`Task: "${task}"`);
    console.log("=".repeat(50));

    // Route the task
    let profile: string;
    let mcps: string[];

    if (forceProfile && forceMcps) {
      profile = forceProfile;
      mcps = forceMcps;
      console.log(`[Forced] Profile: ${profile}, MCPs: ${mcps.join(", ")}`);
    } else {
      const routing = await routeTask(task);
      profile = routing.profile;
      mcps = routing.mcps;
      console.log(`[Routed] Profile: ${profile} (${(routing.confidence * 100).toFixed(0)}%)`);
      console.log(`[Routed] MCPs: ${mcps.join(", ")}`);
      console.log(`[Routed] Reasoning: ${routing.reasoning}`);
    }

    // Execute (stub)
    console.log(`\n[Executing in sandbox...]`);
    const result = await executeInSandbox({
      task,
      mcps,
      timeout: "10m",
    });

    console.log(`[Result] Success: ${result.success}`);
    console.log(`[Result] Duration: ${result.duration}ms`);

    const response = {
      id: `task_${Date.now()}`,
      status: result.success ? "completed" : "failed",
      profile,
      mcps,
      result: result.output,
      duration: result.duration,
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response, null, 2));
  } catch (error) {
    console.error("Error:", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: String(error) }));
  }
});

server.listen(PORT, () => {
  console.log(`\n🚀 Personal OS Test Server running on http://localhost:${PORT}`);
  console.log(`\nTest with:`);
  console.log(`  curl -X POST http://localhost:${PORT}/api/task \\`);
  console.log(`    -H "Content-Type: application/json" \\`);
  console.log(`    -H "x-api-key: test" \\`);
  console.log(`    -d '{"task":"Research the latest AI news"}'`);
  console.log(`\nPress Ctrl+C to stop.\n`);
});
