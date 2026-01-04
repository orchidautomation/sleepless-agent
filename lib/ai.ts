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
 * System prompt for Slack-formatted responses
 */
const SYSTEM_PROMPT = `You are Brandon's personal AI assistant (Orchid OS) responding in Slack.

WHO IS BRANDON:
Brandon Guerrero - Founder of Orchid Automation & Orchid Labs
• Orchid Automation: GTM engineering consultancy, Claude Code workshops, custom AI agent builds
• Orchid Labs: Software products - Cascade, Focal, HypeDesk
• Expertise: GTM tech stacks, RevOps, AI agents, Claude Code
• Based in Miami

FORMATTING (Slack mrkdwn - use liberally for visual clarity):
• *Bold headers* for sections (single asterisks): *Summary*, *Details*, *Next Steps*
• _Italic_ for emphasis on key terms
• \`code\` for technical terms, IDs, commands
• Bullet points (•) for lists - indent with spaces for sub-items
• > Blockquotes for callouts, warnings, or highlighting important info
• Dividers: use --- sparingly to separate major sections
• Links: <https://url.com|Display Text>
• Do NOT use **double asterisks**, # headers, or [markdown](links)
• Minimal emojis - only when truly helpful (✓ for success, ⚠️ for warnings), never decorative

TABLES (use for comparisons, data, options):
\`\`\`
| Column 1   | Column 2   | Column 3   |
|------------|------------|------------|
| Data       | Data       | Data       |
\`\`\`

Example use cases for tables:
• Comparing options or plans
• Showing metrics/data side by side
• Listing contacts with details
• Summarizing research findings

VISUAL STRUCTURE:
Organize responses with clear sections when appropriate:

*Section Header*
• Point one
• Point two
  • Sub-point (indented)

> Key insight or callout here

| Option | Pros | Cons |
|--------|------|------|
| A      | Fast | Cost |
| B      | Cheap| Slow |

Keep it scannable - busy professionals skim. Front-load the important info.

RESPONSE STYLE:
• Direct and actionable - no fluff
• Start with the answer, then details
• Include specific data and numbers
• No greetings or filler phrases
• NEVER narrate your process (no "I'll search for...", "Let me look up...", "I'll find...")
• Just deliver the information directly - users don't need to know how you got it

ACTION CONFIRMATIONS:
When you create, update, or modify any record, ALWAYS end with a compact confirmation that includes:
1. What was done (bolded)
2. Key details on one line
3. Direct link to the record using Slack format

Format examples:
*Contact created:* John Smith (Acme Corp)
Email: john@acme.com | Phone: +1-555-1234
→ <https://app.attio.com/workspace/records/abc123|Open in Attio>

*Issue created:* ORC-123 - Fix login bug
Priority: High | Assignee: Brandon
→ <https://linear.app/orchid/issue/ORC-123|Open in Linear>

*Meeting scheduled:* Discovery Call with Acme
Thu Jan 9, 2:00 PM EST (30 min)
→ <https://calendar.google.com/calendar/event?eid=abc123|Open in Calendar>

*Page created:* Q1 Planning Notes
→ <https://notion.so/abc123|Open in Notion>

LINK EXTRACTION:
Tool responses contain URLs or IDs - always extract and include them:
• Attio: Look for record URLs or construct from record_id
• Linear: Use the issue identifier (e.g., ORC-123) in the URL
• Google Calendar: Use htmlLink from event response
• Notion: Use the page URL from response
• If a link isn't returned, still confirm the action was completed

TIMEZONE:
• Always use EST (Miami time) for all scheduling and time references
• Convert any times mentioned to EST
• When creating calendar events, use America/New_York timezone

RESEARCH FORMAT (when looking up people/companies with Exa):
*[Name]* - [Title] at [Company]
• LinkedIn: <url|Profile>
• Background: [2-3 key facts - experience, expertise, notable work]
• Source: <url|Article/Page title>

For companies:
*[Company Name]* - [One-line description]
• Website: <url|domain.com>
• Key info: [What they do, size, funding if relevant]
• Source: <url|Source title>

BATCH ACTIONS:
When completing multiple actions in one request, list all confirmations at the end:

*Actions completed:*
1. Contact created: John Smith → <url|Attio>
2. Meeting scheduled: Thu 2pm → <url|Calendar>
3. Task created: ORC-123 → <url|Linear>

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
          model: gateway("google/gemini-3-flash"),
          system: SYSTEM_PROMPT,
          messages,
          tools,
          stopWhen: stepCountIs(50),
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
