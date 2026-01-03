/**
 * AI Orchestration Module
 *
 * Uses Vercel AI SDK with Rube MCP for tool access.
 * Replaces the sandbox-based approach with direct AI SDK calls.
 */

import { generateText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { createMCPClient } from "@ai-sdk/mcp";
import { withRetry } from "./retry.js";
import {
  estimateMessagesTokens,
  estimateRequestCost,
  shouldRejectRequest,
  getUserFriendlyError,
} from "./cost-control.js";

interface ExecutionResult {
  output: string;
  success: boolean;
  error?: string;
  duration: number;
  stepsUsed: number;
}

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface ExecuteOptions {
  onToolCall?: (toolName: string) => void;
  onProgress?: (text: string) => void;
  conversationHistory?: ConversationMessage[];
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

WHO IS BRANDON:
Brandon Guerrero - Founder of Orchid Automation & Orchid Labs
• Orchid Automation: GTM engineering consultancy, Claude Code workshops, custom AI agent builds
• Orchid Labs: Software products - Cascade, Focal, HypeDesk
• Expertise: GTM tech stacks, RevOps, AI agents, Claude Code
• Based in Miami

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

TOOLS & PREFERENCES:
• You have 500+ apps via Rube MCP - use tools proactively to complete requests
• *CRM*: Use Attio for all contact, company, and deal management
• *People/Company Research*: Use Exa for searching people, companies, LinkedIn profiles
• *Tasks*: Use Linear for issue/task creation and management
• *Email*: Use Gmail for sending and reading emails
• *Calendar*: Use Google Calendar for scheduling
• *Documents*: Use Notion for notes and documentation
• *Code*: Use GitHub for repository operations`;

/**
 * Execute a task using AI SDK with Rube MCP tools
 */
export async function executeTask(
  task: string,
  options: ExecuteOptions = {}
): Promise<ExecutionResult> {
  const startTime = Date.now();
  const { onToolCall, onProgress, conversationHistory = [] } = options;

  console.log(`[AI] Executing task: "${task.slice(0, 80)}..."`);
  if (conversationHistory.length > 0) {
    console.log(`[AI] With ${conversationHistory.length} previous messages in thread`);
  }

  // Pre-flight cost check
  const allMessages = [
    ...conversationHistory,
    { role: "user" as const, content: task },
  ];
  const inputTokens = estimateMessagesTokens(allMessages);
  const estimatedCost = estimateRequestCost(inputTokens);

  const costCheck = shouldRejectRequest(estimatedCost);
  if (costCheck.reject) {
    console.log(`[AI] Request rejected: ${costCheck.reason}`);
    return {
      output:
        "Your request is too large. Please break it into smaller questions or provide less context.",
      success: false,
      error: costCheck.reason,
      duration: 0,
      stepsUsed: 0,
    };
  }

  console.log(
    `[AI] Estimated cost: $${estimatedCost.toFixed(4)} (${inputTokens} input tokens)`
  );

  try {
    const client = await getMCPClient();
    const tools = await client.tools();

    console.log(`[AI] Loaded ${Object.keys(tools).length} tools from Rube MCP`);

    // Build messages array with conversation history
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      ...conversationHistory,
      { role: "user" as const, content: task },
    ];

    const result = await withRetry(
      () =>
        generateText({
          model: anthropic("claude-sonnet-4-5"),
          system: SYSTEM_PROMPT,
          messages,
          tools,
          stopWhen: stepCountIs(25),
          onStepFinish: ({ finishReason, toolCalls, toolResults, text }) => {
            if (finishReason === "tool-calls" && toolCalls.length > 0) {
              for (const call of toolCalls) {
                console.log(`[AI] Tool call: ${call.toolName}`);
                onToolCall?.(call.toolName);
              }
            }
            if (toolResults.length > 0) {
              console.log(`[AI] Tool results received: ${toolResults.length}`);
            }
            if (text && onProgress) {
              onProgress(text);
            }
          },
        }),
      { maxRetries: 3, initialDelayMs: 1000 }
    );

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
      output: getUserFriendlyError(errorMsg),
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
