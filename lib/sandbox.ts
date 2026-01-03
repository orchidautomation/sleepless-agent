/**
 * Vercel Sandbox Executor
 *
 * Executes tasks using Claude Agent SDK inside a Vercel Sandbox.
 * The sandbox provides isolated execution with the CLI pre-installed.
 */

import { Sandbox } from "@vercel/sandbox";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "yaml";
import ms from "ms";

interface SandboxConfig {
  task: string;
  mcps: string[];
  timeout: string;
}

interface SandboxResult {
  output: string;
  success: boolean;
  error?: string;
  duration: number;
}

interface McpConfig {
  name: string;
  type: "http" | "npx" | "stdio";
  url?: string;
  command?: string;
  env?: Record<string, string>;
  auth?: {
    type: "bearer";
    token: string;
  };
  description?: string;
}

interface McpsYaml {
  mcps: Record<string, McpConfig>;
}

// Cache for MCP configs
let mcpsCache: McpsYaml | null = null;

/**
 * Load MCP configurations from YAML
 */
function loadMcpConfigs(): McpsYaml {
  if (mcpsCache) {
    return mcpsCache;
  }

  const configPath = path.join(process.cwd(), "config", "mcps.yaml");
  const configContent = fs.readFileSync(configPath, "utf-8");
  mcpsCache = yaml.parse(configContent) as McpsYaml;
  return mcpsCache;
}

/**
 * Build MCP server config object for the Agent SDK
 * Returns a serializable config that can be passed to the sandbox
 */
function buildMcpServersConfig(mcpIds: string[]): Record<string, object> {
  const mcpConfigs = loadMcpConfigs();
  const mcpServers: Record<string, object> = {};

  for (const mcpId of mcpIds) {
    const mcp = mcpConfigs.mcps[mcpId];
    if (!mcp) {
      console.warn(`[Sandbox] MCP "${mcpId}" not found in config, skipping`);
      continue;
    }

    if (mcp.type === "http" && mcp.url) {
      // HTTP/SSE remote MCPs - substitute env vars in URL
      let url = mcp.url;
      const envMatches = url.match(/\$\{([^}]+)\}/g);
      if (envMatches) {
        for (const match of envMatches) {
          const envVar = match.slice(2, -1);
          const value = process.env[envVar] || "";
          url = url.replace(match, value);
        }
      }

      // Build headers, including auth if configured
      const headers: Record<string, string> = {};
      if (mcp.auth?.type === "bearer" && mcp.auth.token) {
        let token = mcp.auth.token;
        // Substitute env vars in token
        const tokenEnvMatches = token.match(/\$\{([^}]+)\}/g);
        if (tokenEnvMatches) {
          for (const match of tokenEnvMatches) {
            const envVar = match.slice(2, -1);
            const value = process.env[envVar] || "";
            token = token.replace(match, value);
          }
        }
        headers["Authorization"] = `Bearer ${token}`;
      }

      mcpServers[mcpId] = {
        type: "http",
        url,
        headers,
      };
    } else if (mcp.type === "npx" && mcp.command) {
      // NPX-based MCPs
      const env: Record<string, string> = {};
      if (mcp.env) {
        for (const [key, value] of Object.entries(mcp.env)) {
          if (value.startsWith("${") && value.endsWith("}")) {
            const envVar = value.slice(2, -1);
            env[key] = process.env[envVar] || "";
          } else {
            env[key] = value;
          }
        }
      }

      mcpServers[mcpId] = {
        command: "npx",
        args: ["-y", mcp.command],
        env,
      };
    }
  }

  return mcpServers;
}

/**
 * Parse timeout string to milliseconds
 */
function parseTimeout(timeout: string): number {
  const parsed = ms(timeout as Parameters<typeof ms>[0]);
  if (typeof parsed === "number") {
    return parsed;
  }
  return 600000; // Default 10 min
}

/**
 * Execute a task using Claude Agent SDK inside a Vercel Sandbox
 *
 * Pattern:
 * 1. Create ephemeral Vercel Sandbox
 * 2. Install Claude Code CLI inside the sandbox
 * 3. Install Agent SDK inside the sandbox
 * 4. Write and execute agent script inside the sandbox
 * 5. Capture output and cleanup
 */
export async function executeInSandbox(
  config: SandboxConfig
): Promise<SandboxResult> {
  const startTime = Date.now();
  let sandbox: Sandbox | null = null;

  console.log(`[Sandbox] Starting execution`);
  console.log(`[Sandbox] Task: ${config.task.slice(0, 100)}...`);
  console.log(`[Sandbox] MCPs: ${config.mcps.join(", ") || "none"}`);
  console.log(`[Sandbox] Timeout: ${config.timeout}`);

  // Check for required auth
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      output: "",
      success: false,
      error: "Missing ANTHROPIC_API_KEY environment variable",
      duration: Date.now() - startTime,
    };
  }

  try {
    // Step 1: Create the sandbox
    console.log(`[Sandbox] Creating Vercel Sandbox...`);
    sandbox = await Sandbox.create({
      resources: { vcpus: 4 },
      timeout: parseTimeout(config.timeout),
      runtime: "node22",
    });
    console.log(`[Sandbox] Created: ${sandbox.sandboxId}`);

    // Step 2: Install Claude Code CLI globally
    console.log(`[Sandbox] Installing Claude Code CLI...`);
    const installCLI = await sandbox.runCommand({
      cmd: "npm",
      args: ["install", "-g", "@anthropic-ai/claude-code"],
      sudo: true,
    });

    if (installCLI.exitCode !== 0) {
      throw new Error("Failed to install Claude Code CLI");
    }
    console.log(`[Sandbox] CLI installed`);

    // Step 3: Install Agent SDK
    console.log(`[Sandbox] Installing Agent SDK...`);
    const installSDK = await sandbox.runCommand({
      cmd: "npm",
      args: ["install", "@anthropic-ai/claude-agent-sdk", "@anthropic-ai/sdk"],
    });

    if (installSDK.exitCode !== 0) {
      throw new Error("Failed to install Agent SDK");
    }
    console.log(`[Sandbox] SDK installed`);

    // Step 4: Build MCP config and agent script
    const mcpServers = buildMcpServersConfig(config.mcps);
    const hasMcps = Object.keys(mcpServers).length > 0;

    console.log(
      `[Sandbox] MCP servers: ${Object.keys(mcpServers).join(", ") || "none"}`
    );

    // Build the agent script to run inside the sandbox
    // Results are written to a file so we can read them back
    const agentScript = `
import { query } from '@anthropic-ai/claude-agent-sdk';
import { writeFileSync } from 'fs';

const userTask = ${JSON.stringify(config.task)};
const mcpServers = ${JSON.stringify(mcpServers)};
const hasMcps = ${hasMcps};

// Format task with Slack mrkdwn instructions
const task = \`You are a professional research assistant responding in Slack. Your responses must be polished, well-organized, and easy to scan.

FORMATTING RULES (Slack mrkdwn - follow exactly):
• Use *bold* for headers, names, and key terms (single asterisks only)
• Use _italic_ for emphasis and sources
• Use \\\`code\\\` for technical terms, URLs, or data
• Use • for bullet points (copy this exact character)
• Use numbered lists (1. 2. 3.) for sequential steps
• Use > for important callouts or quotes
• Use ───── for section dividers

STRUCTURE YOUR RESPONSE:
• Start with a brief 1-2 sentence summary
• Use clear section headers in *bold*
• Break information into scannable bullet points
• Include specific data, numbers, and facts
• End with key takeaways or next steps if relevant

NEVER DO:
• Do NOT use **double asterisks** - Slack doesn't support them
• Do NOT use # ## ### headers - Slack doesn't support them
• Do NOT use [link](url) format - Slack uses <url|text> format
• Do NOT add metadata like timestamps or tool names
• Do NOT start with greetings or filler phrases

Task: \${userTask}\`;

function writeResult(result) {
  writeFileSync('/vercel/sandbox/result.json', JSON.stringify(result));
}

async function runAgent() {
  let fullOutput = "";
  let hasError = false;
  let errorMessages = [];

  try {
    const options = {
      allowedTools: ["Read", "Write", "Edit", "Bash", "Grep", "Glob", "WebFetch", "WebSearch"],
      permissionMode: "bypassPermissions",
    };

    // Only add MCP servers if we have any
    if (hasMcps && Object.keys(mcpServers).length > 0) {
      options.mcpServers = mcpServers;
    }

    for await (const message of query({
      prompt: task,
      options,
    })) {
      if (message.type === "assistant") {
        const content = message.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "text") {
              fullOutput += block.text;
            }
          }
        }
      } else if (message.type === "result") {
        if (message.subtype === "success") {
          if (message.result) {
            fullOutput = message.result;
          }
        } else {
          hasError = true;
          errorMessages = message.errors || [message.subtype];
        }
      }
    }

    writeResult({
      success: !hasError,
      output: fullOutput,
      errors: errorMessages,
    });

  } catch (error) {
    writeResult({
      success: false,
      output: "",
      errors: [error.message || String(error)],
    });
  }
}

runAgent();
`;

    // Step 5: Write the agent script to the sandbox
    await sandbox.writeFiles([
      {
        path: "/vercel/sandbox/agent-task.mjs",
        content: Buffer.from(agentScript),
      },
    ]);

    // Step 7: Run the agent script
    console.log(`[Sandbox] Running agent...`);

    const agentRun = await sandbox.runCommand({
      cmd: "node",
      args: ["agent-task.mjs"],
      env: {
        ANTHROPIC_API_KEY: apiKey,
      },
      stderr: process.stderr,
      stdout: process.stdout,
    });

    const duration = Date.now() - startTime;

    // Step 8: Read the result file (readFile returns a ReadableStream)
    let result = { success: false, output: "", errors: [] as string[] };

    try {
      const resultStream = await sandbox.readFile({ path: "/vercel/sandbox/result.json" });
      if (resultStream) {
        // Consume the stream to get the file contents
        const chunks: Buffer[] = [];
        for await (const chunk of resultStream) {
          chunks.push(Buffer.from(chunk));
        }
        const resultContent = Buffer.concat(chunks).toString();
        result = JSON.parse(resultContent);
        console.log(`[Sandbox] Result file read successfully`);
      }
    } catch (readError) {
      // Result file may not exist if agent crashed early
      console.log(`[Sandbox] Could not read result file: ${readError instanceof Error ? readError.message : String(readError)}`);
    }

    // Cleanup
    console.log(`[Sandbox] Stopping sandbox...`);
    await sandbox.stop();

    if (agentRun.exitCode !== 0 && !result.success) {
      return {
        output: result.output,
        success: false,
        error: result.errors?.join(", ") || `Exit code: ${agentRun.exitCode}`,
        duration,
      };
    }

    console.log(`[Sandbox] Completed successfully in ${duration}ms`);
    return {
      output: result.output || "Task completed",
      success: result.success,
      error: result.errors?.length ? result.errors.join(", ") : undefined,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Sandbox] Error: ${errorMsg}`);

    // Cleanup on error
    if (sandbox) {
      try {
        await sandbox.stop();
      } catch {
        // Ignore cleanup errors
      }
    }

    return {
      output: "",
      success: false,
      error: errorMsg,
      duration,
    };
  }
}
