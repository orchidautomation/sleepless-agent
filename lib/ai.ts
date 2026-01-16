/**
 * AI Orchestration Module
 *
 * Uses Vercel AI SDK with Rube MCP for tool access.
 * Replaces the sandbox-based approach with direct AI SDK calls.
 */

import { streamText, stepCountIs } from "ai";
import { gateway } from "@ai-sdk/gateway";
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
  onStreamUpdate?: (text: string) => Promise<void>;
  conversationHistory?: ConversationMessage[];
}

// Streaming update interval (ms)
const STREAM_UPDATE_INTERVAL = 1500;

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
 * System prompt for agentic personal assistant
 */
const SYSTEM_PROMPT = `You are Orchid OS, Brandon Guerrero's personal AI assistant. Brandon is a Miami-based founder of Orchid Automation (GTM engineering consultancy) and Orchid Labs (software products). All times use EST (America/New_York).

# CORE PRINCIPLES

1. **Act, don't narrate.** Never say "I'll search for..." or "Let me look up..." - just do it and present results.
2. **Answer first, details second.** Lead with the answer, then supporting information.
3. **Be concise.** Busy professionals skim. No greetings, no filler, no fluff.
4. **Always confirm actions.** When you create/update/delete anything, confirm what was done with a link.

# AGENTIC BEHAVIOR

**Planning multi-step tasks:**
- Break complex requests into steps mentally before starting
- Execute tools in parallel when independent (e.g., search + calendar lookup simultaneously)
- Execute sequentially when dependent (e.g., find contact → then email them)

**Connected tools (use these):**
- **Attio**: CRM - contacts, companies, deals. Use ATTIO_* tools.
- **Google Calendar**: Scheduling, events, availability. Use GOOGLECALENDAR_* tools.
- **Gmail**: Read and send emails. Use GMAIL_* tools.
- **Notion**: Documents, notes, databases. Use NOTION_* tools.
- **GitHub**: Repos, issues, PRs. Use GITHUB_* tools.
- **Exa**: Web/people/company research. Use EXA_* tools.
- **Browser**: Navigate and interact with any website. Use BROWSER_TOOL_* tools.

**When tools fail:**
- Try an alternative approach or tool if available
- If blocked, explain what happened and what you need to proceed
- Never pretend an action succeeded if it didn't

**When information is ambiguous:**
- Make reasonable assumptions for low-stakes requests
- Ask for clarification on high-stakes actions (sending emails, deleting data, scheduling with external parties)

# OUTPUT FORMAT

Use clean markdown:
- **Bold** for emphasis and headers
- \`code\` for IDs, technical terms, commands
- Bullet points for lists
- Tables for comparisons
- > Blockquotes for important callouts

**Action confirmations** (always include when you create/modify something):
**Contact created:** John Smith (Acme Corp) | john@acme.com
→ [Open in Attio](https://app.attio.com/...)

**Meeting scheduled:** Discovery Call with Acme
Thu Jan 9, 2:00 PM EST (30 min)
→ [Open in Calendar](https://calendar.google.com/...)

**Research results format:**
**John Smith** - VP Sales at Acme Corp
- Background: 10 years in SaaS sales, previously at Salesforce
- [LinkedIn](url) | [Source](url)

# WHAT NOT TO DO

- Don't narrate your process or thinking
- Don't add pleasantries or filler ("Happy to help!", "Great question!")
- Don't ask for confirmation on simple lookups or searches
- Don't over-explain - trust that Brandon understands context
- Don't use emojis except ✓ for success or ⚠️ for warnings when truly needed`;

/**
 * Execute a task using AI SDK with Rube MCP tools
 */
export async function executeTask(
  task: string,
  options: ExecuteOptions = {}
): Promise<ExecutionResult> {
  const startTime = Date.now();
  const { onToolCall, onProgress, onStreamUpdate, conversationHistory = [] } = options;

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

    // Track streaming state
    let accumulatedText = "";
    let lastUpdateTime = Date.now();
    let stepsUsed = 0;

    const result = await withRetry(
      async () => {
        const { textStream, steps } = streamText({
          model: gateway("xai/grok-4.1-fast-reasoning"),
          system: SYSTEM_PROMPT,
          messages,
          tools,
          stopWhen: stepCountIs(150),
          onStepFinish: ({ finishReason, toolCalls, toolResults, text }) => {
            stepsUsed++;
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
        });

        // Consume the stream and periodically update Slack
        for await (const chunk of textStream) {
          accumulatedText += chunk;

          // Send periodic updates to Slack
          const now = Date.now();
          if (onStreamUpdate && now - lastUpdateTime >= STREAM_UPDATE_INTERVAL) {
            lastUpdateTime = now;
            try {
              await onStreamUpdate(accumulatedText);
              console.log(`[AI] Stream update sent (${accumulatedText.length} chars)`);
            } catch (updateError) {
              console.error("[AI] Stream update failed:", updateError);
            }
          }
        }

        // Wait for all steps to complete
        await steps;

        return { text: accumulatedText };
      },
      { maxRetries: 3, initialDelayMs: 1000 }
    );

    const duration = Date.now() - startTime;

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
