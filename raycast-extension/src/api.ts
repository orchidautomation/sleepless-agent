import { getPreferenceValues } from "@raycast/api";
import type { Preferences, TaskRequest, TaskResponse } from "./types";

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
