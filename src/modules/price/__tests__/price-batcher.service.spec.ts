import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { PriceBatcherService } from '../price-batcher.service';
import { CoingeckoService } from '../../coingecko/coingecko.service';
import { RedisService } from '../../../common/redis/redis.service';
import { ConfigService } from '@nestjs/config';

const mockLogger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

const mockCoingeckoService = {
  getPrice: jest.fn(),
};

const mockRedis = {
  get: jest.fn(),
  setex: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
};

const configValues: Record<string, string> = {
  BATCH_WINDOW_MS: '5000',
  BATCH_THRESHOLD: '3',
  CACHE_TTL_SECONDS: '10',
};

const mockConfigService = {
  getOrThrow: jest.fn((key: string) => configValues[key]),
};

describe('PriceBatcherService', () => {
  let service: PriceBatcherService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PriceBatcherService,
        { provide: CoingeckoService, useValue: mockCoingeckoService },
        { provide: RedisService, useValue: mockRedis },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<PriceBatcherService>(PriceBatcherService);
    jest.clearAllMocks();
    mockRedis.incr.mockResolvedValue(1);
    mockRedis.expire.mockResolvedValue(1);
  });

  it('should return cached data with fromCache=true on cache hit', async () => {
    const cachedData = { bitcoin: { usd: 67000 } };
    mockRedis.get.mockResolvedValue(JSON.stringify(cachedData));

    const result = await service.getPrice('bitcoin', 'usd');

    expect(result).toEqual({ data: cachedData, fromCache: true });
    expect(mockCoingeckoService.getPrice).not.toHaveBeenCalled();
  });

  it('should create a batch and flush on timer expiry', async () => {
    jest.useFakeTimers();

    const apiData = { bitcoin: { usd: 67000 } };
    mockRedis.get.mockResolvedValue(null);
    mockCoingeckoService.getPrice.mockResolvedValue(apiData);
    mockRedis.setex.mockResolvedValue('OK');

    const promise = service.getPrice('bitcoin', 'usd');

    await jest.advanceTimersByTimeAsync(5000);

    const result = await promise;

    expect(result).toEqual({ data: apiData, fromCache: false });
    expect(mockCoingeckoService.getPrice).toHaveBeenCalledWith(
      'bitcoin',
      'usd',
    );

    jest.useRealTimers();
  });

  it('should flush immediately when threshold is reached', async () => {
    const apiData = { bitcoin: { usd: 67000 } };
    mockRedis.get.mockResolvedValue(null);
    mockCoingeckoService.getPrice.mockResolvedValue(apiData);
    mockRedis.setex.mockResolvedValue('OK');

    const p1 = service.getPrice('bitcoin', 'usd');
    const p2 = service.getPrice('bitcoin', 'usd');
    const p3 = service.getPrice('bitcoin', 'usd');

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    expect(mockCoingeckoService.getPrice).toHaveBeenCalledTimes(1);
    expect(r1.fromCache).toBe(false);
    expect(r2.fromCache).toBe(false);
    expect(r3.fromCache).toBe(false);
  });

  it('should reject all batch requests when API call fails', async () => {
    jest.useFakeTimers();

    mockRedis.get.mockResolvedValue(null);
    mockCoingeckoService.getPrice.mockRejectedValue(
      new Error('API unavailable'),
    );

    const promise = service.getPrice('bitcoin', 'usd').catch((e) => e);

    await jest.advanceTimersByTimeAsync(5000);

    const error = await promise;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('API unavailable');

    jest.useRealTimers();
  });

  it('should throw 429 when rate limit is exceeded', async () => {
    jest.useFakeTimers();

    mockRedis.get.mockResolvedValue(null);
    mockRedis.incr.mockResolvedValue(31);

    const promise = service.getPrice('bitcoin', 'usd').catch((e) => e);

    await jest.advanceTimersByTimeAsync(5000);

    const error = await promise;
    expect(error).toBeInstanceOf(HttpException);

    jest.useRealTimers();
  });
});
