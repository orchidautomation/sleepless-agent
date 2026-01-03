/**
 * POST /api/task
 * Main endpoint for submitting tasks to the Personal OS
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { put } from "@vercel/blob";
import { executeTask } from "../lib/ai.js";

interface TaskRequest {
  task: string;
  context?: Record<string, unknown>;
  webhook?: string; // URL to call when done
  async?: boolean; // Return immediately, process in background
}

interface TaskResponse {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  result?: string;
  error?: string;
  duration?: number;
  stepsUsed?: number;
}

// Simple ID generator
function generateId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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

  // Validate API key (simple auth)
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

  try {
    // If async, queue and return immediately
    if (body.async) {
      res.status(202).json({
        id: taskId,
        status: "queued",
      } as TaskResponse);

      // Process in background
      processTaskAsync(taskId, body);
      return;
    }

    // Synchronous execution
    const prompt = buildPrompt(body.task, body.context);
    const result = await executeTask(prompt);

    // Store result in Blob
    await storeResult(taskId, {
      task: body.task,
      result: result.output,
      success: result.success,
      error: result.error,
      duration: result.duration,
      stepsUsed: result.stepsUsed,
      timestamp: new Date().toISOString(),
    });

    // Send webhook if provided
    if (body.webhook) {
      await sendWebhook(body.webhook, {
        id: taskId,
        status: result.success ? "completed" : "failed",
        result: result.output,
        error: result.error,
      });
    }

    res.status(200).json({
      id: taskId,
      status: result.success ? "completed" : "failed",
      result: result.output,
      error: result.error,
      duration: result.duration,
      stepsUsed: result.stepsUsed,
    } as TaskResponse);
  } catch (error) {
    console.error("Task execution error:", error);

    res.status(500).json({
      id: taskId,
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown error",
    } as TaskResponse);
  }
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

/**
 * Store result in Vercel Blob
 */
async function storeResult(
  taskId: string,
  data: Record<string, unknown>
): Promise<void> {
  try {
    await put(`results/${taskId}.json`, JSON.stringify(data, null, 2), {
      access: "public",
      contentType: "application/json",
    });
  } catch (error) {
    console.error("Failed to store result:", error);
  }
}

/**
 * Send webhook notification
 */
async function sendWebhook(
  url: string,
  data: Record<string, unknown>
): Promise<void> {
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch (error) {
    console.error("Webhook failed:", error);
  }
}

/**
 * Process task asynchronously
 */
async function processTaskAsync(
  taskId: string,
  body: TaskRequest
): Promise<void> {
  try {
    const prompt = buildPrompt(body.task, body.context);
    const result = await executeTask(prompt);

    await storeResult(taskId, {
      task: body.task,
      result: result.output,
      success: result.success,
      error: result.error,
      duration: result.duration,
      stepsUsed: result.stepsUsed,
      timestamp: new Date().toISOString(),
    });

    if (body.webhook) {
      await sendWebhook(body.webhook, {
        id: taskId,
        status: result.success ? "completed" : "failed",
        result: result.output,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("Async task failed:", error);
    await storeResult(taskId, {
      task: body.task,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    });
  }
}
