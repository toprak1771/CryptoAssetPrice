import {
  Injectable,
  OnModuleDestroy,
  Inject,
  LoggerService,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import Redis from 'ioredis';

@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  constructor(
    private readonly configService: ConfigService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {
    const host = configService.getOrThrow<string>('REDIS_HOST');
    const port = configService.getOrThrow<number>('REDIS_PORT');

    super({ host, port: Number(port) });

    this.on('connect', () => {
      this.logger.log?.('Redis connected', RedisService.name);
    });

    this.on('error', (err: Error) => {
      this.logger.error?.(
        `Redis error: ${err.message}`,
        undefined,
        RedisService.name,
      );
    });
  }

  async onModuleDestroy() {
    await this.quit();
  }

  /**
   * Scan keys matching pattern using SCAN (O(1) per iteration) instead of KEYS (O(N)).
   * Safe for production with large key sets.
   */
  async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [nextCursor, matchedKeys] = await this.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = nextCursor;
      keys.push(...matchedKeys);
    } while (cursor !== '0');
    return keys;
  }
}
