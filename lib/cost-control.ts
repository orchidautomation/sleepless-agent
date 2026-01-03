/**
 * Cost Control Module
 *
 * Pre-flight cost estimation to prevent expensive requests:
 * - Token estimation from text
 * - Cost calculation based on model pricing
 * - Request rejection for over-budget queries
 */

// Claude pricing (per 1K tokens) - January 2025
const PRICING = {
  "claude-sonnet-4": { input: 0.003, output: 0.015 },
  "claude-haiku": { input: 0.00025, output: 0.00125 },
} as const;

type ModelName = keyof typeof PRICING;

// Maximum cost per request ($0.10)
const MAX_REQUEST_COST = 0.1;

/**
 * Estimate tokens from text
 * Rule of thumb: ~4 characters per token for English
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Estimate tokens from conversation messages
 */
export function estimateMessagesTokens(
  messages: Array<{ content: string }>
): number {
  return messages.reduce((sum, msg) => sum + estimateTokens(msg.content), 0);
}

/**
 * Calculate estimated request cost
 */
export function estimateRequestCost(
  inputTokens: number,
  estimatedOutputTokens: number = 500,
  model: ModelName = "claude-sonnet-4"
): number {
  const price = PRICING[model];
  return (
    (inputTokens / 1000) * price.input +
    (estimatedOutputTokens / 1000) * price.output
  );
}

/**
 * Pre-flight check: should we reject this request?
 */
export function shouldRejectRequest(estimatedCost: number): {
  reject: boolean;
  reason?: string;
} {
  if (estimatedCost > MAX_REQUEST_COST) {
    return {
      reject: true,
      reason: `Request would cost ~$${estimatedCost.toFixed(4)}, exceeds $${MAX_REQUEST_COST} limit`,
    };
  }
  return { reject: false };
}

/**
 * Get user-friendly error message based on error type
 */
export function getUserFriendlyError(errorMsg: string): string {
  if (errorMsg.includes("rate limit") || errorMsg.includes("429")) {
    return "I'm experiencing high demand. Please try again in a moment.";
  }
  if (errorMsg.includes("timeout")) {
    return "The request took too long. Please try a simpler question.";
  }
  if (errorMsg.includes("context") || errorMsg.includes("token")) {
    return "Your request is too large. Please break it into smaller questions.";
  }
  return "Something went wrong. Please try again.";
}
