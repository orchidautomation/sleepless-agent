/**
 * Task Router
 * Routes incoming tasks to the appropriate MCP profile using LLM classification.
 * Uses Claude Haiku for fast, intelligent routing (~100-200ms).
 */

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "yaml";

interface Profile {
  name: string;
  description: string;
  mcps: string[];
}

interface ProfilesConfig {
  profiles: Record<string, Profile>;
  default_profile: string;
  max_mcps: number;
}

interface RoutingResult {
  profile: string;
  mcps: string[];
  confidence: number;
  reasoning: string;
}

// Cache for loaded profiles
let profilesCache: ProfilesConfig | null = null;

// Anthropic client (lazy init)
let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic();
  }
  return anthropicClient;
}

/**
 * Load profiles from YAML config
 */
function loadProfiles(): ProfilesConfig {
  if (profilesCache) {
    return profilesCache;
  }

  const configPath = path.join(process.cwd(), "config", "profiles.yaml");
  const configContent = fs.readFileSync(configPath, "utf-8");
  profilesCache = yaml.parse(configContent) as ProfilesConfig;
  return profilesCache;
}

/**
 * Build the routing prompt with available profiles
 */
function buildRoutingPrompt(profiles: ProfilesConfig): string {
  const profileDescriptions = Object.entries(profiles.profiles)
    .map(([id, profile]) => {
      // Clean up multi-line descriptions for the prompt
      const desc = profile.description.trim().replace(/\n/g, " ").replace(/\s+/g, " ");
      return `**${id}** (MCPs: ${profile.mcps.join(", ")})\n${desc}`;
    })
    .join("\n\n");

  return `You are a task router. Classify the user's task into the most appropriate profile.

AVAILABLE PROFILES:

${profileDescriptions}

INSTRUCTIONS:
- Read the task carefully
- Match it to the profile whose description best fits
- If the task needs web/internet information → research
- If ambiguous or multi-domain → general
- Respond with ONLY valid JSON, no markdown code blocks

OUTPUT FORMAT:
{"profile": "profile_id", "confidence": 0.95, "reasoning": "brief explanation"}`;
}

/**
 * Route task using Claude Haiku for intelligent classification
 */
async function routeWithLLM(
  task: string,
  profiles: ProfilesConfig
): Promise<RoutingResult> {
  const client = getAnthropicClient();
  const systemPrompt = buildRoutingPrompt(profiles);

  console.log("[Router] Classifying task with Haiku...");
  const startTime = Date.now();

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 150,
      system: systemPrompt,
      messages: [{ role: "user", content: task }],
    });

    const duration = Date.now() - startTime;
    console.log(`[Router] Classification took ${duration}ms`);

    // Extract text response
    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text response from router");
    }

    // Parse JSON response
    const result = JSON.parse(textBlock.text) as {
      profile: string;
      confidence: number;
      reasoning: string;
    };

    // Validate profile exists
    if (!profiles.profiles[result.profile]) {
      console.warn(`[Router] Unknown profile "${result.profile}", using default`);
      const defaultProfile = profiles.profiles[profiles.default_profile];
      return {
        profile: profiles.default_profile,
        mcps: defaultProfile.mcps,
        confidence: 0.5,
        reasoning: `Unknown profile returned, fallback to default`,
      };
    }

    const profile = profiles.profiles[result.profile];
    return {
      profile: result.profile,
      mcps: profile.mcps,
      confidence: result.confidence,
      reasoning: result.reasoning,
    };
  } catch (error) {
    console.error("[Router] LLM routing failed:", error);
    // Fallback to default profile on error
    const defaultProfile = profiles.profiles[profiles.default_profile];
    return {
      profile: profiles.default_profile,
      mcps: defaultProfile.mcps,
      confidence: 0.3,
      reasoning: `LLM routing failed: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }
}

/**
 * Main routing function
 * Uses LLM classification for intelligent routing
 */
export async function routeTask(task: string): Promise<RoutingResult> {
  const profiles = loadProfiles();

  // Use LLM for intelligent routing
  const result = await routeWithLLM(task, profiles);
  console.log(`[Router] Selected: ${result.profile} (${result.confidence}) - ${result.reasoning}`);

  return result;
}
