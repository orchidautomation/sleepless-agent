/**
 * AI Orchestration Module
 *
 * Uses Vercel AI SDK with Rube MCP for tool access.
 * Replaces the sandbox-based approach with direct AI SDK calls.
 */

import { generateText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { createMCPClient } from "@ai-sdk/mcp";

interface ExecutionResult {
  output: string;
  success: boolean;
  error?: string;
  duration: number;
  stepsUsed: number;
}

// Lazy-initialized MCP client
let mcpClient: Awaited<ReturnType<typeof createMCPClient>> | null = null;

/**
 * Get or create the Rube MCP client
 */
async function getMCPClient() {
  if (mcpClient) {
    return mcpClient;
  }

  const rubeToken = process.env.RUBE_API_TOKEN;
  if (!rubeToken) {
    throw new Error("Missing RUBE_API_TOKEN environment variable");
  }

  mcpClient = await createMCPClient({
    transport: {
      type: "sse",
      url: "https://rube.app/mcp",
      headers: {
        Authorization: `Bearer ${rubeToken}`,
      },
    },
  });

  return mcpClient;
}

/**
 * System prompt for Slack-formatted responses
 */
const SYSTEM_PROMPT = `You are a professional assistant responding in Slack. Your responses must be polished, well-organized, and easy to scan.

FORMATTING RULES (Slack mrkdwn - follow exactly):
• Use *bold* for headers, names, and key terms (single asterisks only)
• Use _italic_ for emphasis and sources
• Use \`code\` for technical terms, URLs, or data
• Use • for bullet points (copy this exact character)
• Use numbered lists (1. 2. 3.) for sequential steps
• Use > for important callouts or quotes

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

TOOL USAGE:
• You have access to 500+ apps via Rube MCP (Slack, Gmail, Attio, HubSpot, Linear, GitHub, Notion, Google Calendar, etc.)
• Use the appropriate tools to complete the user's request
• If a task requires multiple steps, execute them all
• Always verify data before responding`;

/**
 * Execute a task using AI SDK with Rube MCP tools
 */
export async function executeTask(task: string): Promise<ExecutionResult> {
  const startTime = Date.now();
  console.log(`[AI] Executing task: "${task.slice(0, 80)}..."`);

  try {
    const client = await getMCPClient();
    const tools = await client.tools();

    console.log(`[AI] Loaded ${Object.keys(tools).length} tools from Rube MCP`);

    const result = await generateText({
      model: anthropic("claude-sonnet-4-20250514"),
      system: SYSTEM_PROMPT,
      prompt: task,
      tools,
      stopWhen: stepCountIs(25),
      onStepFinish: ({ finishReason, toolCalls, toolResults }) => {
        if (finishReason === "tool-calls" && toolCalls.length > 0) {
          for (const call of toolCalls) {
            console.log(`[AI] Tool call: ${call.toolName}`);
          }
        }
        if (toolResults.length > 0) {
          console.log(`[AI] Tool results received: ${toolResults.length}`);
        }
      },
    });

    const duration = Date.now() - startTime;
    const stepsUsed = result.steps?.length || 1;

    console.log(`[AI] Completed in ${duration}ms using ${stepsUsed} steps`);

    return {
      output: result.text || "Task completed successfully.",
      success: true,
      duration,
      stepsUsed,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[AI] Error: ${errorMsg}`);

    return {
      output: "",
      success: false,
      error: errorMsg,
      duration,
      stepsUsed: 0,
    };
  }
}

/**
 * Close the MCP client connection
 * Call this when shutting down
 */
export async function closeMCPClient(): Promise<void> {
  if (mcpClient) {
    try {
      await mcpClient.close();
      mcpClient = null;
      console.log("[AI] MCP client closed");
    } catch {
      // Ignore close errors
    }
  }
}
