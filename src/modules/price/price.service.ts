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

  async getPrice(coinId: string, currency: string = 'usd') {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
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
    });

    await this.invalidateHistoryCache(coinId, currency);

    this.logger.log?.(
      `Price saved: ${coinId} = ${price} ${currency}`,
      PriceService.name,
    );

    return record;
  }

  async getHistory(
    coinId: string,
    currency: string = 'usd',
    limit: number = 50,
  ): Promise<PriceRecord[]> {
    const cacheKey = `history:${coinId}:${currency}:${limit}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      this.logger.log?.(
        `History cache hit for "${cacheKey}"`,
        PriceService.name,
      );
      return JSON.parse(cached) as PriceRecord[];
    }

    const records = await this.priceRepository.findHistory(
      coinId,
      currency,
      limit,
    );

    if (records.length > 0) {
      await this.redis.setex(
        cacheKey,
        this.cacheTtlSeconds,
        JSON.stringify(records),
      );
    }

    return records;
  }

  private async invalidateHistoryCache(
    coinId: string,
    currency: string,
  ): Promise<void> {
    const pattern = `history:${coinId}:${currency}:*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
