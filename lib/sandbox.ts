/**
 * Agent SDK Executor
 *
 * Executes tasks using Claude Agent SDK with dynamic MCP loading.
 * Runs directly in the Vercel Function (no sandbox isolation needed).
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
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
 * Build MCP server config for Agent SDK
 */
function buildMcpServers(mcpIds: string[]): Record<string, object> {
  const mcpConfigs = loadMcpConfigs();
  const mcpServers: Record<string, object> = {};

  for (const mcpId of mcpIds) {
    const mcp = mcpConfigs.mcps[mcpId];
    if (!mcp) {
      console.warn(`[Agent] MCP "${mcpId}" not found in config, skipping`);
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

      mcpServers[mcpId] = {
        type: "http",
        url,
        headers: {},
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
 * Execute a task using Claude Agent SDK directly
 * (No Vercel Sandbox isolation - runs in the Vercel Function itself)
 */
export async function executeInSandbox(
  config: SandboxConfig
): Promise<SandboxResult> {
  const startTime = Date.now();

  console.log(`[Agent] Starting execution`);
  console.log(`[Agent] Task: ${config.task}`);
  console.log(`[Agent] MCPs: ${config.mcps.join(", ") || "none"}`);
  console.log(`[Agent] Timeout: ${config.timeout}`);

  // Check for required auth
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY;
  if (!authToken) {
    return {
      output: "",
      success: false,
      error: "Missing ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY environment variable",
      duration: Date.now() - startTime,
    };
  }

  console.log(`[Agent] API Key present: true (length: ${authToken.length})`);

  try {
    // Build MCP servers config
    const mcpServers = buildMcpServers(config.mcps);
    console.log(`[Agent] MCP servers configured: ${Object.keys(mcpServers).join(", ") || "none"}`);

    // Run the Agent SDK query directly
    let fullOutput = "";
    let hasError = false;
    let errorMessages: string[] = [];

    console.log("[Agent] Starting query...");

    for await (const message of query({
      prompt: config.task,
      options: {
        allowedTools: ["Read", "Write", "Edit", "Bash", "Grep", "Glob", "WebFetch", "WebSearch"],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mcpServers: mcpServers as any,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
      },
    })) {
      if (message.type === "assistant") {
        // Assistant message with content blocks
        const content = message.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "text") {
              fullOutput += block.text;
            }
          }
        }
      } else if (message.type === "result") {
        // Final result message
        if (message.subtype === "success") {
          fullOutput = message.result || fullOutput;
          console.log(`[Agent] Result success`);
        } else {
          hasError = true;
          errorMessages = message.errors || [message.subtype];
          console.error(`[Agent] Result error: ${message.subtype}`);
        }
      } else if (message.type === "system") {
        console.log(`[Agent] System: ${message.subtype}`);
      }
    }

    const duration = Date.now() - startTime;

    if (hasError) {
      return {
        output: fullOutput,
        success: false,
        error: errorMessages.join(", "),
        duration,
      };
    }

    console.log(`[Agent] Completed successfully in ${duration}ms`);
    return {
      output: fullOutput || "Task completed",
      success: true,
      duration,
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Agent] Error: ${errorMsg}`);

    return {
      output: "",
      success: false,
      error: errorMsg,
      duration,
    };
  }
}
