/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** API Key - Your Sleepless Agent API key (PERSONAL_OS_API_KEY) */
  "apiKey": string,
  /** API Endpoint - Custom API endpoint (defaults to production) */
  "apiEndpoint": string,
  /** Save History - Save task history locally */
  "saveHistory": boolean
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `ask` command */
  export type Ask = ExtensionPreferences & {}
  /** Preferences accessible in the `quick-ask` command */
  export type QuickAsk = ExtensionPreferences & {}
  /** Preferences accessible in the `history` command */
  export type History = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `ask` command */
  export type Ask = {}
  /** Arguments passed to the `quick-ask` command */
  export type QuickAsk = {
  /** Ask anything... */
  "query": string
}
  /** Arguments passed to the `history` command */
  export type History = {}
}

