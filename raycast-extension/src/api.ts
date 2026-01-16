import { getPreferenceValues } from "@raycast/api";
import type {
  Conversation,
  ConversationMessage,
  ConversationSummary,
  Preferences,
  TaskRequest,
  TaskResponse,
} from "./types";

export interface StreamCallbacks {
  onText?: (text: string) => void;
  onTool?: (toolName: string) => void;
  onProgress?: (text: string) => void;
}

export async function executeTask(task: string): Promise<TaskResponse> {
  const preferences = getPreferenceValues<Preferences>();
  const endpoint = preferences.apiEndpoint || "https://sleepless-agent.vercel.app";

  const response = await fetch(`${endpoint}/api/task`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": preferences.apiKey,
    },
    body: JSON.stringify({
      task,
      async: false,
    } satisfies TaskRequest),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API request failed: ${response.status} - ${errorText}`);
  }

  return response.json() as Promise<TaskResponse>;
}

export async function executeTaskAsync(task: string): Promise<TaskResponse> {
  const preferences = getPreferenceValues<Preferences>();
  const endpoint = preferences.apiEndpoint || "https://sleepless-agent.vercel.app";

  const response = await fetch(`${endpoint}/api/task`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": preferences.apiKey,
    },
    body: JSON.stringify({
      task,
      async: true,
    } satisfies TaskRequest),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API request failed: ${response.status} - ${errorText}`);
  }

  return response.json() as Promise<TaskResponse>;
}

/**
 * Execute a task with streaming response via SSE
 */
export async function executeTaskStreaming(
  task: string,
  callbacks: StreamCallbacks,
  options?: {
    conversationHistory?: ConversationMessage[];
    conversationId?: string;
  }
): Promise<TaskResponse> {
  const preferences = getPreferenceValues<Preferences>();
  const endpoint = preferences.apiEndpoint || "https://sleepless-agent.vercel.app";

  const response = await fetch(`${endpoint}/api/task/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": preferences.apiKey,
    },
    body: JSON.stringify({
      task,
      conversationHistory: options?.conversationHistory,
      conversationId: options?.conversationId,
    } satisfies TaskRequest),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API request failed: ${response.status} - ${errorText}`);
  }

  if (!response.body) {
    throw new Error("No response body for streaming");
  }

  // Parse SSE stream
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResponse: TaskResponse | null = null;
  let conversationId: string | undefined;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE events (separated by double newlines)
      const events = buffer.split("\n\n");
      buffer = events.pop() || ""; // Keep incomplete event in buffer

      for (const event of events) {
        if (!event.trim()) continue;

        const lines = event.split("\n");
        let eventType = "";
        let eventData = "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7);
          } else if (line.startsWith("data: ")) {
            eventData = line.slice(6);
          }
        }

        if (!eventType || !eventData) continue;

        try {
          const data = JSON.parse(eventData);

          switch (eventType) {
            case "start":
              conversationId = data.conversationId;
              break;
            case "text":
              callbacks.onText?.(data.text);
              break;
            case "tool":
              callbacks.onTool?.(data.tool);
              break;
            case "progress":
              callbacks.onProgress?.(data.text);
              break;
            case "done":
              finalResponse = {
                id: data.id,
                conversationId: data.conversationId || conversationId,
                status: data.status,
                result: data.result,
                error: data.error,
                duration: data.duration,
                stepsUsed: data.stepsUsed,
              };
              break;
            case "error":
              finalResponse = {
                id: data.id,
                conversationId: data.conversationId || conversationId,
                status: "failed",
                error: data.error,
                duration: data.duration,
              };
              break;
          }
        } catch {
          // Ignore JSON parse errors
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!finalResponse) {
    throw new Error("Stream ended without final response");
  }

  return finalResponse;
}

/**
 * List all conversations
 */
export async function getConversations(limit = 50): Promise<ConversationSummary[]> {
  const preferences = getPreferenceValues<Preferences>();
  const endpoint = preferences.apiEndpoint || "https://sleepless-agent.vercel.app";

  const response = await fetch(`${endpoint}/api/conversations?limit=${limit}`, {
    headers: {
      "X-API-Key": preferences.apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch conversations: ${response.status}`);
  }

  const data = await response.json();
  return data.conversations as ConversationSummary[];
}

/**
 * Get a specific conversation
 */
export async function getConversation(conversationId: string): Promise<Conversation | null> {
  const preferences = getPreferenceValues<Preferences>();
  const endpoint = preferences.apiEndpoint || "https://sleepless-agent.vercel.app";

  const response = await fetch(`${endpoint}/api/conversations?id=${conversationId}`, {
    headers: {
      "X-API-Key": preferences.apiKey,
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch conversation: ${response.status}`);
  }

  return response.json() as Promise<Conversation>;
}

/**
 * Delete a conversation
 */
export async function deleteConversation(conversationId: string): Promise<boolean> {
  const preferences = getPreferenceValues<Preferences>();
  const endpoint = preferences.apiEndpoint || "https://sleepless-agent.vercel.app";

  const response = await fetch(`${endpoint}/api/conversations?id=${conversationId}`, {
    method: "DELETE",
    headers: {
      "X-API-Key": preferences.apiKey,
    },
  });

  return response.ok;
}
