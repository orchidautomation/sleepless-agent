/**
 * Environment validation using Zod
 * Fail fast on missing or invalid configuration
 */

import { z } from "zod";

export const envSchema = z.object({
  // Slack credentials (required for Slack integration)
  SLACK_BOT_TOKEN: z.string().min(1, "SLACK_BOT_TOKEN is required").startsWith("xoxb-", "SLACK_BOT_TOKEN must start with xoxb-"),
  SLACK_SIGNING_SECRET: z.string().min(1, "SLACK_SIGNING_SECRET is required"),

  // Anthropic API key (required for AI)
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),

  // Personal OS API key (for direct API access)
  PERSONAL_OS_API_KEY: z.string().optional(),

  // ngrok for local development
  NGROK_AUTH_TOKEN: z.string().optional(),

  // Node environment
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type Env = z.infer<typeof envSchema>;

// Validate environment on import
const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error("Invalid environment configuration:");
  for (const issue of result.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  throw new Error("Environment validation failed. Check your .env.local file.");
}

export const env = result.data;
