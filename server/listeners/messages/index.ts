/**
 * Register message listeners
 * Handles direct messages and message events
 */

import type { App } from "@slack/bolt";

export function registerMessageListeners(app: App): void {
  // TODO: Phase 2 - Add DM handler
  // app.message handler for direct messages

  app.logger.info("Message listeners registered (none active yet)");
}
