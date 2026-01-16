/**
 * POST /api/task/stream
 * Streaming endpoint for tasks - returns Server-Sent Events (SSE)
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { executeTask } from "../../lib/ai.js";
import {
  saveConversation,
  getConversation,
  generateConversationId,
  type ConversationMessage,
} from "../../lib/conversations.js";

interface TaskRequest {
  task: string;
  context?: Record<string, unknown>;
  conversationHistory?: ConversationMessage[];
  conversationId?: string; // Optional - will generate if not provided
}

// Simple ID generator
function generateId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Build the full prompt with context
 */
function buildPrompt(
  task: string,
  context?: Record<string, unknown>
): string {
  let prompt = task;

  if (context && Object.keys(context).length > 0) {
    prompt += "\n\nAdditional context:\n";
    for (const [key, value] of Object.entries(context)) {
      prompt += `- ${key}: ${JSON.stringify(value)}\n`;
    }
  }

  return prompt;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // Only accept POST
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Validate API key
  const apiKey = req.headers["x-api-key"];
  if (apiKey !== process.env.PERSONAL_OS_API_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const body = req.body as TaskRequest;

  if (!body.task) {
    res.status(400).json({ error: "Missing required field: task" });
    return;
  }

  const taskId = generateId();

  // Get or generate conversation ID
  const conversationId = body.conversationId || generateConversationId();

  // Set up SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering

  // Helper to send SSE events
  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Send initial event
  sendEvent("start", { id: taskId, conversationId, status: "processing" });

  const startTime = Date.now();

  try {
    // Load existing conversation if ID provided but no history sent
    let conversationHistory = body.conversationHistory;
    let existingConversation = null;

    console.log(`Request: conversationId=${body.conversationId}, hasHistory=${!!conversationHistory}`);

    if (body.conversationId && !conversationHistory) {
      console.log(`Loading conversation: ${body.conversationId}`);
      existingConversation = await getConversation(body.conversationId);
      if (existingConversation) {
        conversationHistory = existingConversation.messages;
        console.log(`Loaded ${conversationHistory.length} messages from conversation`);
      } else {
        console.log(`Conversation not found: ${body.conversationId}`);
      }
    }

    const prompt = buildPrompt(body.task, body.context);

    let lastText = "";

    const result = await executeTask(prompt, {
      conversationHistory,
      onStreamUpdate: async (text: string) => {
        // Only send if there's new content
        if (text !== lastText) {
          lastText = text;
          sendEvent("text", { text });
        }
      },
      onToolCall: (toolName: string) => {
        sendEvent("tool", { tool: toolName });
      },
      onProgress: (text: string) => {
        // Send step progress
        sendEvent("progress", { text: text.slice(0, 200) });
      },
    });

    const duration = Date.now() - startTime;

    // Save conversation with new exchange
    if (result.success && result.output) {
      const updatedMessages: ConversationMessage[] = [
        ...(conversationHistory || []),
        { role: "user", content: body.task },
        { role: "assistant", content: result.output },
      ];

      // Save in background - don't block response
      saveConversation(conversationId, updatedMessages, existingConversation ?? undefined).catch(
        (err) => console.error("Failed to save conversation:", err)
      );
    }

    // Send final result
    sendEvent("done", {
      id: taskId,
      conversationId,
      status: result.success ? "completed" : "failed",
      result: result.output,
      error: result.error,
      duration,
      stepsUsed: result.stepsUsed,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : "Unknown error";

    sendEvent("error", {
      id: taskId,
      conversationId,
      status: "failed",
      error: errorMsg,
      duration,
    });
  } finally {
    res.end();
  }
}
