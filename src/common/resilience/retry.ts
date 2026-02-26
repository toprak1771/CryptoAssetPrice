import { LoggerService } from '@nestjs/common';
import {
  RetryOptions,
  DEFAULT_RETRY_OPTIONS,
  RETRYABLE_STATUS_CODES,
} from './retry.options';

export function isRetryableError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const status = (error as { response?: { status?: number } }).response
      ?.status;
    return status !== undefined && RETRYABLE_STATUS_CODES.has(status);
  }
  if (error instanceof Error) {
    return ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'].some((code) =>
      error.message.includes(code),
    );
  }
  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  logger: LoggerService,
  options?: Partial<RetryOptions>,
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  const check = opts.retryableCheck ?? isRetryableError;

  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt >= opts.maxRetries || !check(error)) {
        throw error;
      }

      const delay = calculateDelay(attempt, opts.baseDelayMs, opts.maxDelayMs);
      logger.warn?.(
        `"${label}" failed (attempt ${attempt + 1}/${opts.maxRetries + 1}) — retrying in ${delay}ms`,
        'RetryHandler',
      );

      await sleep(delay);
    }
  }

  throw lastError;
}

function calculateDelay(
  attempt: number,
  baseMs: number,
  maxMs: number,
): number {
  const exponential = baseMs * Math.pow(2, attempt);
  const jitter = exponential * 0.2 * Math.random();
  return Math.min(exponential + jitter, maxMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
