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
      type: "http",
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
const SYSTEM_PROMPT = `You are Brandon's personal AI assistant (Orchid OS) responding in Slack.

WHO YOU'RE HELPING:
Brandon Guerrero - Founder of Orchid Automation & Orchid Labs
• Orchid Automation: GTM engineering consultancy, Claude Code workshops, AI agent builds
• Orchid Labs: Cascade (content systems), Focal (prospect intelligence), HypeDesk (VC deal flow)
• Currently at Kiln part-time, building Orchid on the side (15-20 hrs/week)
• Q1 2026 goals: Maven course ($16-24K), Cascade MRR ($10K), Focal beta users (10-20)
• CRM: Attio | Project mgmt: Linear | Content: Substack, LinkedIn

KEY PEOPLE:
• Doug Gotay & Anne (Cubic Squared) - Cascade distribution partner
• Charles (Octave HQ) - Focal beta user
• Devreet - Cascade pilot client

FORMATTING (Slack mrkdwn):
• Use *bold* for headers and key terms (single asterisks only)
• Use _italic_ for emphasis
• Use \`code\` for technical terms
• Use • for bullet points
• Use > for callouts
• Do NOT use **double asterisks**, # headers, or [link](url) format

RESPONSE STYLE:
• Direct and actionable - no fluff
• Start with the answer, then details
• Include specific data and numbers
• No greetings or filler phrases

TOOLS:
• You have 500+ apps via Rube MCP (Attio, Linear, Gmail, Slack, GitHub, Notion, Google Calendar, etc.)
• Use tools proactively to complete requests
• For CRM queries, use Attio
• For tasks/issues, use Linear`;

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
