/**
 * Conversation storage using Vercel Blob
 */

import { put, list, del } from "@vercel/blob";

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

export interface Conversation {
  id: string;
  title: string; // First user message, truncated
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

/**
 * Generate a conversation ID
 */
export function generateConversationId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Save or update a conversation
 */
export async function saveConversation(
  conversationId: string,
  messages: ConversationMessage[],
  existingConversation?: Conversation
): Promise<Conversation> {
  const now = new Date().toISOString();

  // Generate title from first user message
  const firstUserMessage = messages.find((m) => m.role === "user");
  const title = firstUserMessage
    ? firstUserMessage.content.slice(0, 100) + (firstUserMessage.content.length > 100 ? "..." : "")
    : "Untitled";

  const conversation: Conversation = {
    id: conversationId,
    title,
    messages: messages.map((m) => ({
      ...m,
      timestamp: m.timestamp || now,
    })),
    createdAt: existingConversation?.createdAt || now,
    updatedAt: now,
  };

  try {
    await put(
      `conversations/${conversationId}.json`,
      JSON.stringify(conversation, null, 2),
      {
        access: "public",
        contentType: "application/json",
      }
    );
  } catch (error) {
    console.error("Failed to save conversation:", error);
    throw error;
  }

  return conversation;
}

/**
 * Get a conversation by ID
 */
export async function getConversation(
  conversationId: string
): Promise<Conversation | null> {
  try {
    const { blobs } = await list({
      prefix: `conversations/${conversationId}.json`,
    });

    if (blobs.length === 0) {
      return null;
    }

    const response = await fetch(blobs[0].url);
    if (!response.ok) {
      return null;
    }

    return (await response.json()) as Conversation;
  } catch (error) {
    console.error("Failed to get conversation:", error);
    return null;
  }
}

/**
 * List all conversations (most recent first)
 */
export async function listConversations(
  limit: number = 50
): Promise<ConversationSummary[]> {
  try {
    const { blobs } = await list({
      prefix: "conversations/",
    });

    // Sort by uploaded date (most recent first)
    const sortedBlobs = blobs.sort(
      (a, b) =>
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );

    // Fetch conversation details (limited)
    const conversations: ConversationSummary[] = [];

    for (const blob of sortedBlobs.slice(0, limit)) {
      try {
        const response = await fetch(blob.url);
        if (response.ok) {
          const conv = (await response.json()) as Conversation;
          conversations.push({
            id: conv.id,
            title: conv.title,
            messageCount: conv.messages.length,
            createdAt: conv.createdAt,
            updatedAt: conv.updatedAt,
          });
        }
      } catch {
        // Skip invalid conversations
      }
    }

    return conversations;
  } catch (error) {
    console.error("Failed to list conversations:", error);
    return [];
  }
}

/**
 * Delete a conversation
 */
export async function deleteConversation(
  conversationId: string
): Promise<boolean> {
  try {
    await del(`conversations/${conversationId}.json`);
    return true;
  } catch (error) {
    console.error("Failed to delete conversation:", error);
    return false;
  }
}
