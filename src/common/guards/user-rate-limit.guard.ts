import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class UserRateLimitGuard implements CanActivate {
  private readonly ttlSeconds: number;
  private readonly maxRequests: number;

  constructor(
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.ttlSeconds = Number(
      this.configService.get<number>('RATE_LIMIT_TTL_SECONDS', 60),
    );
    this.maxRequests = Number(
      this.configService.get<number>('RATE_LIMIT_MAX_PER_USER', 100),
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: { userId: string };
    }>();

    const userId = request.user?.userId;
    if (!userId) {
      return true;
    }

    const now = new Date();
    const windowKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}-${now.getUTCMinutes()}`;
    const key = `ratelimit:api:user:${userId}:${windowKey}`;

    const count = await this.redis.incr(key);

    if (count === 1) {
      await this.redis.expire(key, this.ttlSeconds);
    }

    if (count > this.maxRequests) {
      throw new HttpException(
        {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Rate limit exceeded. Max ${this.maxRequests} requests per ${this.ttlSeconds} seconds.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
