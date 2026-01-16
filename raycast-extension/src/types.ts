export interface TaskResponse {
  id: string;
  conversationId?: string;
  status: "queued" | "processing" | "completed" | "failed";
  result?: string;
  error?: string;
  duration?: number;
  stepsUsed?: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ConversationMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface TaskRequest {
  task: string;
  context?: Record<string, unknown>;
  conversationHistory?: ConversationMessage[];
  conversationId?: string;
  async?: boolean;
}

export interface HistoryItem {
  id: string;
  task: string;
  result: string;
  status?: "completed" | "failed";
  timestamp: number;
  duration?: number;
  stepsUsed?: number;
}

export interface Preferences {
  apiKey: string;
  apiEndpoint: string;
  saveHistory: boolean;
}
