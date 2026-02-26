import { LoggerService } from '@nestjs/common';
import {
  CircuitState,
  CircuitBreakerOptions,
  DEFAULT_CIRCUIT_BREAKER_OPTIONS,
} from './circuit-breaker.options';

export class CircuitBreaker {
  private state = CircuitState.CLOSED;
  private failureCount = 0;
  private halfOpenAttempts = 0;
  private lastFailureTime = 0;
  private readonly options: CircuitBreakerOptions;

  constructor(
    private readonly name: string,
    private readonly logger: LoggerService,
    options?: Partial<CircuitBreakerOptions>,
  ) {
    this.options = { ...DEFAULT_CIRCUIT_BREAKER_OPTIONS, ...options };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.isOpen()) {
      if (this.shouldAttemptReset()) {
        return this.tryHalfOpen(fn);
      }
      this.logger.warn?.(
        `Circuit OPEN for "${this.name}" — failing fast (resets in ${this.msUntilReset()}ms)`,
        'CircuitBreaker',
      );
      throw new CircuitBreakerOpenError(this.name, this.msUntilReset());
    }

    if (this.state === CircuitState.HALF_OPEN) {
      return this.tryHalfOpen(fn);
    }

    return this.executeCall(fn);
  }

  getState(): string {
    return this.state;
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.halfOpenAttempts = 0;
    this.logger.log?.(
      `Circuit manually reset to CLOSED for "${this.name}"`,
      'CircuitBreaker',
    );
  }

  private async executeCall<T>(fn: () => Promise<T>): Promise<T> {
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private async tryHalfOpen<T>(fn: () => Promise<T>): Promise<T> {
    if (this.halfOpenAttempts >= this.options.halfOpenMaxAttempts) {
      throw new CircuitBreakerOpenError(this.name, this.msUntilReset());
    }

    this.state = CircuitState.HALF_OPEN;
    this.halfOpenAttempts++;
    this.logger.log?.(
      `Circuit HALF_OPEN for "${this.name}" — testing (attempt ${this.halfOpenAttempts}/${this.options.halfOpenMaxAttempts})`,
      'CircuitBreaker',
    );

    return this.executeCall(fn);
  }

  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.logger.log?.(
        `Circuit recovered — transitioning to CLOSED for "${this.name}"`,
        'CircuitBreaker',
      );
    }
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.halfOpenAttempts = 0;
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.options.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.halfOpenAttempts = 0;
      this.logger.error?.(
        `Circuit OPEN for "${this.name}" after ${this.failureCount} failures — blocking requests for ${this.options.resetTimeoutMs}ms`,
        undefined,
        'CircuitBreaker',
      );
    }
  }

  private isOpen(): boolean {
    return this.state === CircuitState.OPEN;
  }

  private shouldAttemptReset(): boolean {
    return Date.now() - this.lastFailureTime >= this.options.resetTimeoutMs;
  }

  private msUntilReset(): number {
    const elapsed = Date.now() - this.lastFailureTime;
    return Math.max(0, this.options.resetTimeoutMs - elapsed);
  }
}

export class CircuitBreakerOpenError extends Error {
  constructor(
    public readonly serviceName: string,
    public readonly retryAfterMs: number,
  ) {
    super(
      `Circuit breaker is OPEN for "${serviceName}". Retry after ${retryAfterMs}ms.`,
    );
    this.name = 'CircuitBreakerOpenError';
  }
}
