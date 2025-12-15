/**
 * Register event listeners
 */

import type { App } from "@slack/bolt";
import { appMentionHandler } from "./app-mention.js";

export function registerEventListeners(app: App): void {
  // @mention handler - primary way users interact with the bot
  app.event("app_mention", appMentionHandler);

  // Log when events are registered
  app.logger.info("Event listeners registered: app_mention");
}
