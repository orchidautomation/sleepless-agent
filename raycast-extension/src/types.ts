export interface TaskResponse {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  result?: string;
  error?: string;
  duration?: number;
  stepsUsed?: number;
}

export interface TaskRequest {
  task: string;
  context?: Record<string, unknown>;
  async?: boolean;
}

export interface HistoryItem {
  id: string;
  task: string;
  result: string;
  timestamp: number;
  duration?: number;
  stepsUsed?: number;
}

export interface Preferences {
  apiKey: string;
  apiEndpoint: string;
  streamResponse: boolean;
  saveHistory: boolean;
}
