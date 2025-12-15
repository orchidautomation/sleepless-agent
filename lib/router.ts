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
  complexity: "simple" | "complex";
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

  return `You are a task router. Classify the user's task into the most appropriate profile AND complexity level.

AVAILABLE PROFILES:

${profileDescriptions}

ROUTING RULES (follow strictly):
1. If the task asks to SEARCH, RESEARCH, FIND OUT, LOOK UP, or needs INTERNET INFO → "research"
2. If the task involves SALES, CRM, CLIENTS, DEALS, FOLLOW-UPS → "crm"
3. If the task is a PERSONAL REMINDER, TODO, or SCHEDULING → "personal"
4. If the task involves CODE, BUGS, PRS, GITHUB, LINEAR → "dev"
5. If the task involves WRITING, NOTES, DOCUMENTATION, NOTION → "notes"
6. If the task involves MESSAGING, SLACK, EMAIL, COMMUNICATION → "comms"
7. ONLY use "general" if NONE of the above apply

COMPLEXITY RULES:
- "simple": ONLY for greetings, math, time/timezone, unit conversions, or single factual questions
- "complex": ANY task with the word "research", ANY URL/domain, ANY company lookup, summarization, multi-step tasks

CRITICAL: If the message contains "research" OR a URL/domain (like example.com) → ALWAYS "complex"

Examples:
- "hi" / "hello" / "hey" → simple + general
- "what time is it in Tokyo?" → simple + general
- "what's 25 * 47?" → simple + general
- "who is the CEO of Stripe?" → simple + research
- "research tryprofound.com" → complex + research (HAS "research" AND domain)
- "research Stripe" → complex + research (HAS "research")
- "tell me about example.com" → complex + research (HAS domain)
- "add John to CRM" → complex + crm
- "summarize the latest AI news" → complex + research

DEFAULT: When in doubt, choose "complex".

Respond with ONLY valid JSON (no markdown):
{"profile": "profile_id", "confidence": 0.95, "reasoning": "brief reason", "complexity": "simple"}`;
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

    // Parse JSON response (strip markdown code blocks if present)
    let jsonText = textBlock.text.trim();
    if (jsonText.startsWith("```")) {
      // Remove markdown code blocks
      jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const result = JSON.parse(jsonText) as {
      profile: string;
      confidence: number;
      reasoning: string;
      complexity?: "simple" | "complex";
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
        complexity: "complex", // Default to complex for safety
      };
    }

    const profile = profiles.profiles[result.profile];
    const complexity = result.complexity === "simple" ? "simple" : "complex";

    console.log(`[Router] Complexity: ${complexity}`);

    return {
      profile: result.profile,
      mcps: profile.mcps,
      confidence: result.confidence,
      reasoning: result.reasoning,
      complexity,
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
      complexity: "complex", // Default to complex for safety
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
