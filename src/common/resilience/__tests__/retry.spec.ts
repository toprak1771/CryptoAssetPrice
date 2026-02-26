import { withRetry, isRetryableError } from '../retry';

const mockLogger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

describe('isRetryableError', () => {
  it('should return true for retryable HTTP status codes', () => {
    const error = { response: { status: 429 } };
    expect(isRetryableError(error)).toBe(true);
  });

  it('should return true for 503 status', () => {
    const error = { response: { status: 503 } };
    expect(isRetryableError(error)).toBe(true);
  });

  it('should return false for 400 status', () => {
    const error = { response: { status: 400 } };
    expect(isRetryableError(error)).toBe(false);
  });

  it('should return true for network errors', () => {
    expect(isRetryableError(new Error('ECONNRESET'))).toBe(true);
    expect(isRetryableError(new Error('ETIMEDOUT'))).toBe(true);
    expect(isRetryableError(new Error('ECONNREFUSED'))).toBe(true);
  });

  it('should return false for non-retryable errors', () => {
    expect(isRetryableError(new Error('Some random error'))).toBe(false);
  });
});

describe('withRetry', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should return result on first success', async () => {
    const fn = jest.fn().mockResolvedValue('success');

    const result = await withRetry(fn, 'test', mockLogger, {
      maxRetries: 3,
      baseDelayMs: 100,
      maxDelayMs: 1000,
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on retryable errors and succeed', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce({ response: { status: 429 } })
      .mockResolvedValueOnce('success');

    const promise = withRetry(fn, 'test', mockLogger, {
      maxRetries: 3,
      baseDelayMs: 100,
      maxDelayMs: 1000,
    });

    await jest.advanceTimersByTimeAsync(200);
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should throw immediately on non-retryable errors', async () => {
    const error = { response: { status: 400 } };
    const fn = jest.fn().mockRejectedValue(error);

    await expect(
      withRetry(fn, 'test', mockLogger, {
        maxRetries: 3,
        baseDelayMs: 100,
        maxDelayMs: 1000,
      }),
    ).rejects.toEqual(error);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should throw after exhausting all retries', async () => {
    const error = { response: { status: 429 } };
    const fn = jest.fn().mockRejectedValue(error);

    const promise = withRetry(fn, 'test', mockLogger, {
      maxRetries: 2,
      baseDelayMs: 100,
      maxDelayMs: 1000,
    }).catch((e) => e);

    await jest.advanceTimersByTimeAsync(500);
    await jest.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toEqual(error);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
