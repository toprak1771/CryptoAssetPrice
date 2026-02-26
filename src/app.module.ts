import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WinstonModule } from 'nest-winston';
import { createWinstonConfig } from './common/logger/winston.config';
import { DatabaseModule } from './common/database/database.module';
import { RedisModule } from './common/redis/redis.module';
import { PriceModule } from './modules/price/price.module';
import { AuthModule } from './modules/auth/auth.module';
import { CoingeckoModule } from './modules/coingecko/coingecko.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    WinstonModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => createWinstonConfig(config),
    }),
    DatabaseModule,
    RedisModule,
    PriceModule,
    AuthModule,
    CoingeckoModule,
    HealthModule,
  ],
})
export class AppModule {}
