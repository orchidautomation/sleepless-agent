/**
 * POST /api/task/stream
 * Streaming endpoint for tasks - returns Server-Sent Events (SSE)
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { executeTask } from "../../lib/ai.js";

interface TaskRequest {
  task: string;
  context?: Record<string, unknown>;
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
  sendEvent("start", { id: taskId, status: "processing" });

  const startTime = Date.now();

  try {
    const prompt = buildPrompt(body.task, body.context);

    let lastText = "";

    const result = await executeTask(prompt, {
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

    // Send final result
    sendEvent("done", {
      id: taskId,
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
      status: "failed",
      error: errorMsg,
      duration,
    });
  } finally {
    res.end();
  }
}
