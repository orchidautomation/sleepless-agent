/**
 * Task Router
 * Routes incoming tasks to the appropriate MCP profile using keyword/pattern matching.
 * Falls back to general profile when no match found.
 * (Task execution uses Claude Code with OAuth - no API key needed here)
 */

import * as fs from "fs";
import * as path from "path";
import * as yaml from "yaml";

interface ProfileTriggers {
  keywords: string[];
  patterns: string[];
}

interface Profile {
  name: string;
  description: string;
  mcps: string[];
  triggers: ProfileTriggers;
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
 * Phase 1: Fast keyword/pattern matching
 */
function matchKeywords(
  task: string,
  profiles: ProfilesConfig
): RoutingResult | null {
  const taskLower = task.toLowerCase();
  let bestMatch: { profile: string; score: number; keyword: string } | null =
    null;

  for (const [profileId, profile] of Object.entries(profiles.profiles)) {
    // Skip the general/fallback profile for keyword matching
    if (profileId === "general") continue;

    // Check keywords
    for (const keyword of profile.triggers.keywords) {
      if (taskLower.includes(keyword.toLowerCase())) {
        const score = keyword.length; // Longer keywords = more specific match
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { profile: profileId, score, keyword };
        }
      }
    }

    // Check regex patterns
    for (const pattern of profile.triggers.patterns) {
      try {
        const regex = new RegExp(pattern, "i");
        if (regex.test(task)) {
          // Pattern matches get high confidence
          return {
            profile: profileId,
            mcps: profile.mcps,
            confidence: 0.9,
            reasoning: `Pattern match: "${pattern}"`,
          };
        }
      } catch {
        console.warn(`Invalid regex pattern in profile ${profileId}: ${pattern}`);
      }
    }
  }

  if (bestMatch) {
    const profile = profiles.profiles[bestMatch.profile];
    return {
      profile: bestMatch.profile,
      mcps: profile.mcps,
      confidence: 0.8,
      reasoning: `Keyword match: "${bestMatch.keyword}"`,
    };
  }

  return null;
}

/**
 * Main routing function
 * Uses keyword/pattern matching, falls back to general profile
 */
export async function routeTask(task: string): Promise<RoutingResult> {
  const profiles = loadProfiles();

  // Try keyword/pattern matching (fast, no API call)
  const keywordMatch = matchKeywords(task, profiles);
  if (keywordMatch) {
    console.log(`[Router] Keyword match: ${keywordMatch.profile}`);
    return keywordMatch;
  }

  // No match - use general profile (task execution uses Claude Code with OAuth)
  console.log("[Router] No keyword match, using general profile");
  const defaultProfile = profiles.profiles[profiles.default_profile];
  return {
    profile: profiles.default_profile,
    mcps: defaultProfile.mcps,
    confidence: 0.5,
    reasoning: "No keyword match - using general profile",
  };
}
