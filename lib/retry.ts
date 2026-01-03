/**
 * Retry Logic with Exponential Backoff
 *
 * Provides resilient API calls with:
 * - Exponential backoff (1s -> 2s -> 4s -> 8s)
 * - Rate limit handling with retry-after header
 * - Client error detection (don't retry 4xx except 429)
 */

interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
}

/**
 * Wrap an async function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxRetries = 3, initialDelayMs = 1000, maxDelayMs = 8000 } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Don't retry client errors (except rate limits)
      if (isClientError(error) && !isRateLimited(error)) {
        console.log(`[Retry] Client error (${getStatus(error)}), not retrying`);
        throw error;
      }

      if (attempt === maxRetries) {
        console.log(`[Retry] All ${maxRetries} attempts failed`);
        break;
      }

      // Calculate delay with exponential backoff
      const baseDelay = Math.min(
        initialDelayMs * Math.pow(2, attempt - 1),
        maxDelayMs
      );

      // Respect retry-after header for rate limits
      const retryAfter = getRetryAfter(error);
      const actualDelay = retryAfter ? retryAfter * 1000 : baseDelay;

      console.log(
        `[Retry] Attempt ${attempt} failed, retrying in ${actualDelay}ms`
      );
      await sleep(actualDelay);
    }
  }

  throw lastError;
}

/**
 * Check if error is a client error (4xx)
 */
function isClientError(error: unknown): boolean {
  const status = getStatus(error);
  return status !== null && status >= 400 && status < 500;
}

/**
 * Check if error is a rate limit (429)
 */
function isRateLimited(error: unknown): boolean {
  return getStatus(error) === 429;
}

/**
 * Extract HTTP status from error
 */
function getStatus(error: unknown): number | null {
  if (error instanceof Error && "status" in error) {
    return (error as Error & { status: number }).status;
  }
  return null;
}

/**
 * Extract retry-after header from error
 */
function getRetryAfter(error: unknown): number | null {
  if (error instanceof Error && "headers" in error) {
    const headers = (error as Error & { headers?: Record<string, string> })
      .headers;
    const retryAfter = headers?.["retry-after"];
    if (retryAfter) {
      const parsed = parseInt(retryAfter, 10);
      return isNaN(parsed) ? null : parsed;
    }
  }
  return null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
