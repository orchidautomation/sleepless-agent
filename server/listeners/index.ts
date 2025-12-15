/**
 * Register all Slack event listeners
 */

import type { App } from "@slack/bolt";
import { registerEventListeners } from "./events/index.js";
import { registerMessageListeners } from "./messages/index.js";

export function registerListeners(app: App): void {
  registerEventListeners(app);
  registerMessageListeners(app);
}
