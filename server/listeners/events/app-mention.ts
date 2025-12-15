/**
 * Handler for @mention events
 * This is triggered when someone @mentions the bot in a channel
 */

import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";

type AppMentionArgs = AllMiddlewareArgs & SlackEventMiddlewareArgs<"app_mention">;

export async function appMentionHandler({
  event,
  client,
  logger,
}: AppMentionArgs): Promise<void> {
  const channel = event.channel;
  const thread_ts = event.thread_ts || event.ts;
  const userId = event.user;

  // Extract the message text, removing the @mention
  const rawText = event.text || "";
  const text = rawText.replace(/<@[^>]+>/g, "").trim();

  logger.debug(`app_mention from user ${userId}: "${text}"`);

  try {
    // Phase 1: Simple response to verify integration works
    // Phase 2 will add actual task execution
    await client.chat.postMessage({
      channel,
      thread_ts,
      text: `Hello <@${userId}>! I received your message: "${text}"\n\nThis is Personal OS - your AI assistant. Task execution coming soon!`,
    });

    logger.info(`Responded to app_mention in channel ${channel}`);
  } catch (error) {
    logger.error("Failed to respond to app_mention:", error);

    // Try to send error message
    try {
      await client.chat.postMessage({
        channel,
        thread_ts,
        text: "Sorry, something went wrong. Please try again.",
      });
    } catch {
      // Failed to send error message, just log it
      logger.error("Failed to send error message to user");
    }
  }
}
