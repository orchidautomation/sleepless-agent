/**
 * Direct Executor for Simple Tasks
 *
 * Handles simple queries directly using Claude without the sandbox overhead.
 * Much faster (~3-8s) compared to sandbox execution (~40-60s).
 */

import Anthropic from "@anthropic-ai/sdk";

interface DirectExecutionResult {
  output: string;
  success: boolean;
  error?: string;
  duration: number;
}

// Lazy init Anthropic client
let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic();
  }
  return anthropicClient;
}

// Tool definitions for simple tasks
const tools: Anthropic.Tool[] = [
  {
    name: "web_search",
    description: "Search the web for current information. Use for questions about facts, people, companies, news, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "The search query",
        },
      },
      required: ["query"],
    },
  },
];

/**
 * Simple web search using a free API (DuckDuckGo instant answers)
 */
interface DuckDuckGoResponse {
  Abstract?: string;
  AbstractSource?: string;
  AbstractURL?: string;
  RelatedTopics?: Array<{ Text?: string }>;
}

async function executeWebSearch(query: string): Promise<string> {
  try {
    // Use DuckDuckGo Instant Answer API (no key required)
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
    const response = await fetch(url);
    const data = (await response.json()) as DuckDuckGoResponse;

    if (data.Abstract) {
      return `${data.Abstract}\n\nSource: ${data.AbstractSource || "DuckDuckGo"} (${data.AbstractURL || ""})`;
    }

    if (data.RelatedTopics && data.RelatedTopics.length > 0) {
      const topics = data.RelatedTopics
        .slice(0, 3)
        .filter((t) => t.Text)
        .map((t) => `• ${t.Text}`)
        .join("\n");
      return topics || "No results found. Try rephrasing your question.";
    }

    return "No instant answer available. For more detailed research, try asking me to 'research' the topic.";
  } catch (error) {
    console.error("[DirectExecutor] Web search failed:", error);
    return "Search failed. Please try again.";
  }
}

/**
 * Execute a simple task directly without sandbox
 */
export async function executeDirectly(task: string): Promise<DirectExecutionResult> {
  const startTime = Date.now();
  console.log(`[DirectExecutor] Executing simple task: "${task.slice(0, 50)}..."`);

  try {
    const client = getClient();

    // First, try to answer directly or decide if we need tools
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: `You are a helpful assistant responding in Slack. Keep responses concise and friendly.

Format for Slack mrkdwn:
- Use *bold* for emphasis (single asterisks)
- Use _italic_ for subtle emphasis
- Use \`code\` for inline code
- Keep responses SHORT and to the point

For simple questions (greetings, time, calculations), answer directly.
For questions needing current info (news, facts about companies/people), use the web_search tool.`,
      messages: [{ role: "user", content: task }],
      tools,
    });

    let finalOutput = "";

    // Check if we need to use tools
    if (response.stop_reason === "tool_use") {
      const toolUse = response.content.find((block) => block.type === "tool_use");

      if (toolUse && toolUse.type === "tool_use") {
        console.log(`[DirectExecutor] Using tool: ${toolUse.name}`);

        let toolResult = "";
        if (toolUse.name === "web_search") {
          const input = toolUse.input as { query: string };
          toolResult = await executeWebSearch(input.query);
        }

        // Get final response with tool result
        const finalResponse = await client.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          system: `You are a helpful assistant responding in Slack. Format for Slack mrkdwn (*bold*, _italic_). Be concise.`,
          messages: [
            { role: "user", content: task },
            { role: "assistant", content: response.content },
            {
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: toolUse.id,
                  content: toolResult,
                },
              ],
            },
          ],
          tools,
        });

        const textBlock = finalResponse.content.find((b) => b.type === "text");
        finalOutput = textBlock && textBlock.type === "text" ? textBlock.text : toolResult;
      }
    } else {
      // Direct response without tools
      const textBlock = response.content.find((b) => b.type === "text");
      finalOutput = textBlock && textBlock.type === "text" ? textBlock.text : "";
    }

    const duration = Date.now() - startTime;
    console.log(`[DirectExecutor] Completed in ${duration}ms`);

    return {
      output: finalOutput || "I processed your request but have no specific output.",
      success: true,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error("[DirectExecutor] Error:", error);
    return {
      output: "",
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      duration,
    };
  }
}
