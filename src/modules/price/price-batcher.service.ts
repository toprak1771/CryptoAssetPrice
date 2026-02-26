import {
  Inject,
  Injectable,
  LoggerService,
  OnModuleDestroy,
  HttpException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { RedisService } from '../../common/redis/redis.service';
import { CoingeckoService } from '../coingecko/coingecko.service';
import { CoinGeckoPriceResponse } from '../coingecko/interfaces/coingecko-response.interface';

export interface BatchedPriceResult {
  data: CoinGeckoPriceResponse;
  fromCache: boolean;
}

interface PendingRequest {
  resolve: (value: BatchedPriceResult) => void;
  reject: (reason: Error) => void;
}

interface Batch {
  requests: PendingRequest[];
  timer: NodeJS.Timeout;
  createdAt: number;
}

@Injectable()
export class PriceBatcherService implements OnModuleDestroy {
  private readonly batches = new Map<string, Batch>();
  private readonly batchWindowMs: number;
  private readonly batchThreshold: number;
  private readonly cacheTtlSeconds: number;
  private readonly rateLimitPerMinute = 30;

  constructor(
    private readonly coingeckoService: CoingeckoService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {
    this.batchWindowMs = Number(
      this.configService.getOrThrow('BATCH_WINDOW_MS'),
    );
    this.batchThreshold = Number(
      this.configService.getOrThrow('BATCH_THRESHOLD'),
    );
    this.cacheTtlSeconds = Number(
      this.configService.getOrThrow('CACHE_TTL_SECONDS'),
    );
  }

  async getPrice(
    coinId: string,
    currency: string = 'usd',
  ): Promise<BatchedPriceResult> {
    const key = `${coinId}:${currency}`;

    const cached = await this.getFromCache(coinId, currency);
    if (cached) {
      this.logger.log?.(`Cache hit for "${key}"`, PriceBatcherService.name);
      return { data: cached, fromCache: true };
    }

    return new Promise<BatchedPriceResult>((resolve, reject) => {
      const existing = this.batches.get(key);

      if (existing) {
        existing.requests.push({ resolve, reject });

        this.logger.log?.(
          `Request added to batch "${key}" (${existing.requests.length}/${this.batchThreshold})`,
          PriceBatcherService.name,
        );

        if (existing.requests.length >= this.batchThreshold) {
          clearTimeout(existing.timer);
          this.logger.log?.(
            `Threshold triggered for "${key}" — flushing ${existing.requests.length} requests`,
            PriceBatcherService.name,
          );
          void this.flush(key);
        }
        return;
      }

      const timer = setTimeout(() => {
        this.logger.log?.(
          `Timer expired for "${key}" — flushing ${this.batches.get(key)?.requests.length ?? 0} requests`,
          PriceBatcherService.name,
        );
        void this.flush(key);
      }, this.batchWindowMs);

      this.batches.set(key, {
        requests: [{ resolve, reject }],
        timer,
        createdAt: Date.now(),
      });

      this.logger.log?.(
        `New batch created for "${key}" (window: ${this.batchWindowMs}ms, threshold: ${this.batchThreshold})`,
        PriceBatcherService.name,
      );
    });
  }

  async onModuleDestroy() {
    const keys = [...this.batches.keys()];
    for (const key of keys) {
      await this.flush(key);
    }
  }

  private async flush(key: string): Promise<void> {
    const batch = this.batches.get(key);
    if (!batch) return;

    this.batches.delete(key);
    clearTimeout(batch.timer);

    const [coinId, currency] = key.split(':');
    const elapsed = Date.now() - batch.createdAt;

    try {
      await this.checkRateLimit();

      const data = await this.coingeckoService.getPrice(coinId, currency);

      await this.setCache(coinId, currency, data);

      batch.requests.forEach((req) => req.resolve({ data, fromCache: false }));

      this.logger.log?.(
        `Batch flushed: "${key}" — ${batch.requests.length} requests resolved in ${elapsed}ms`,
        PriceBatcherService.name,
      );
    } catch (error) {
      const err =
        error instanceof Error ? error : new Error('Unknown batch error');

      batch.requests.forEach((req) => req.reject(err));

      this.logger.error?.(
        `Batch failed: "${key}" — ${batch.requests.length} requests rejected: ${err.message}`,
        undefined,
        PriceBatcherService.name,
      );
    }
  }

  private async getFromCache(
    coinId: string,
    currency: string,
  ): Promise<CoinGeckoPriceResponse | null> {
    const raw = await this.redis.get(`price:${coinId}:${currency}`);
    if (!raw) return null;

    return JSON.parse(raw) as CoinGeckoPriceResponse;
  }

  private async setCache(
    coinId: string,
    currency: string,
    data: CoinGeckoPriceResponse,
  ): Promise<void> {
    await this.redis.setex(
      `price:${coinId}:${currency}`,
      this.cacheTtlSeconds,
      JSON.stringify(data),
    );
  }

  private async checkRateLimit(): Promise<void> {
    const now = new Date();
    const minuteKey = `ratelimit:coingecko:${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}-${now.getUTCMinutes()}`;

    const count = await this.redis.incr(minuteKey);

    if (count === 1) {
      await this.redis.expire(minuteKey, 60);
    }

    if (count > this.rateLimitPerMinute) {
      throw new HttpException(
        {
          code: 'RATE_LIMIT_EXCEEDED',
          message:
            'CoinGecko API rate limit reached. Please try again shortly.',
        },
        429,
      );
    }
  }
}
