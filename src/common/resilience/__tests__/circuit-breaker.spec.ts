import { CircuitBreaker, CircuitBreakerOpenError } from '../circuit-breaker';
import { CircuitState } from '../circuit-breaker.options';

const mockLogger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker('TestService', mockLogger, {
      failureThreshold: 3,
      resetTimeoutMs: 1000,
      halfOpenMaxAttempts: 1,
    });
    jest.clearAllMocks();
  });

  it('should start in CLOSED state', () => {
    expect(cb.getState()).toBe(CircuitState.CLOSED);
  });

  it('should pass through successful calls in CLOSED state', async () => {
    const result = await cb.execute(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
    expect(cb.getState()).toBe(CircuitState.CLOSED);
  });

  it('should open after reaching failure threshold', async () => {
    const failingFn = () => Promise.reject(new Error('fail'));

    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(failingFn)).rejects.toThrow('fail');
    }

    expect(cb.getState()).toBe(CircuitState.OPEN);
  });

  it('should throw CircuitBreakerOpenError when OPEN', async () => {
    const failingFn = () => Promise.reject(new Error('fail'));

    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(failingFn)).rejects.toThrow('fail');
    }

    await expect(cb.execute(() => Promise.resolve('ok'))).rejects.toThrow(
      CircuitBreakerOpenError,
    );
  });

  it('should transition to HALF_OPEN after reset timeout', async () => {
    jest.useFakeTimers();

    const failingFn = () => Promise.reject(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(failingFn)).rejects.toThrow('fail');
    }

    jest.advanceTimersByTime(1001);

    const result = await cb.execute(() => Promise.resolve('recovered'));
    expect(result).toBe('recovered');
    expect(cb.getState()).toBe(CircuitState.CLOSED);

    jest.useRealTimers();
  });

  it('should re-open if HALF_OPEN attempt fails', async () => {
    jest.useFakeTimers();

    const failingFn = () => Promise.reject(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(failingFn)).rejects.toThrow('fail');
    }

    jest.advanceTimersByTime(1001);

    await expect(cb.execute(failingFn)).rejects.toThrow('fail');
    expect(cb.getState()).toBe(CircuitState.OPEN);

    jest.useRealTimers();
  });

  it('should reset state with reset()', async () => {
    const failingFn = () => Promise.reject(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(failingFn)).rejects.toThrow('fail');
    }

    expect(cb.getState()).toBe(CircuitState.OPEN);

    cb.reset();
    expect(cb.getState()).toBe(CircuitState.CLOSED);

    const result = await cb.execute(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
  });
});
