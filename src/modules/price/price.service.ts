import {
  Inject,
  Injectable,
  LoggerService,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import {
  PriceBatcherService,
  BatchedPriceResult,
} from './price-batcher.service';
import { PriceRepository } from './price.repository';
import { RedisService } from '../../common/redis/redis.service';
import { PriceRecord } from '../../../generated/prisma/client';

@Injectable()
export class PriceService {
  private readonly cacheTtlSeconds: number;

  constructor(
    private readonly priceBatcher: PriceBatcherService,
    private readonly priceRepository: PriceRepository,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {
    this.cacheTtlSeconds = Number(
      this.configService.get<number>('CACHE_TTL_SECONDS', 30),
    );
  }

  async getPrice(coinId: string, currency: string = 'usd', userId?: string) {
    const result: BatchedPriceResult = await this.priceBatcher.getPrice(
      coinId,
      currency,
    );

    const coinData: Record<string, number> | undefined = result.data[coinId];
    if (!coinData || coinData[currency] === undefined) {
      throw new NotFoundException(`Price not found for "${coinId}"`);
    }

    const price = Number(coinData[currency]);

    if (result.fromCache) {
      this.logger.log?.(
        `Price from cache: ${coinId} = ${price} ${currency} (skipping DB write)`,
        PriceService.name,
      );
      return { coinId, price, currency, fromCache: true };
    }

    const record = await this.priceRepository.save({
      coinId,
      price,
      currency,
      userId: userId!,
    });

    await this.invalidateHistoryCacheWithRetry(coinId, currency, userId!);

    this.logger.log?.(
      `Price saved: ${coinId} = ${price} ${currency}`,
      PriceService.name,
    );

    return record;
  }

  async getHistory(
    coinId: string,
    currency: string = 'usd',
    userId: string,
    limit: number = 50,
  ): Promise<PriceRecord[]> {
    const cacheKey = `history:${userId}:${coinId}:${currency}:${limit}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as PriceRecord[];
          this.logger.log?.(
            `History cache hit for "${cacheKey}"`,
            PriceService.name,
          );
          return parsed;
        } catch (err) {
          this.logger.warn?.(
            `Cache parse error for "${cacheKey}", falling back to DB: ${err instanceof Error ? err.message : String(err)}`,
            PriceService.name,
          );
        }
      }
    } catch (err) {
      this.logger.warn?.(
        `Redis unavailable for history read, falling back to DB: ${err instanceof Error ? err.message : String(err)}`,
        PriceService.name,
      );
    }

    const records = await this.priceRepository.findHistory(
      coinId,
      currency,
      userId,
      limit,
    );

    if (records.length > 0) {
      try {
        await this.redis.setex(
          cacheKey,
          this.cacheTtlSeconds,
          JSON.stringify(records),
        );
      } catch (err) {
        this.logger.warn?.(
          `Redis unavailable for history cache write: ${err instanceof Error ? err.message : String(err)}`,
          PriceService.name,
        );
      }
    }

    return records;
  }

  private async invalidateHistoryCache(
    coinId: string,
    currency: string,
    userId: string,
  ): Promise<void> {
    const pattern = `history:${userId}:${coinId}:${currency}:*`;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-call
    const keys: string[] = await this.redis.scanKeys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  private async invalidateHistoryCacheWithRetry(
    coinId: string,
    currency: string,
    userId: string,
    maxRetries = 3,
  ): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.invalidateHistoryCache(coinId, currency, userId);
        return;
      } catch (err) {
        this.logger.warn?.(
          `History cache invalidation failed (attempt ${attempt}/${maxRetries}): ${err instanceof Error ? err.message : String(err)}`,
          PriceService.name,
        );
        if (attempt === maxRetries) {
          this.logger.warn?.(
            'Cache invalidation skipped after retries; cache will expire via TTL',
            PriceService.name,
          );
        }
      }
    }
  }
}
