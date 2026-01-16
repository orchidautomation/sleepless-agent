/**
 * GET /api/conversations - List all conversations
 * GET /api/conversations?id=xxx - Get specific conversation
 * DELETE /api/conversations?id=xxx - Delete a conversation
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  listConversations,
  getConversation,
  deleteConversation,
} from "../lib/conversations.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // Validate API key
  const apiKey = req.headers["x-api-key"];
  if (apiKey !== process.env.PERSONAL_OS_API_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const conversationId = req.query.id as string | undefined;

  if (req.method === "GET") {
    if (conversationId) {
      // Get specific conversation
      const conversation = await getConversation(conversationId);
      if (!conversation) {
        res.status(404).json({ error: "Conversation not found" });
        return;
      }
      res.status(200).json(conversation);
    } else {
      // List all conversations
      const limit = parseInt(req.query.limit as string) || 50;
      const conversations = await listConversations(limit);
      res.status(200).json({ conversations });
    }
  } else if (req.method === "DELETE") {
    if (!conversationId) {
      res.status(400).json({ error: "Missing conversation id" });
      return;
    }
    const success = await deleteConversation(conversationId);
    if (success) {
      res.status(200).json({ success: true });
    } else {
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}
