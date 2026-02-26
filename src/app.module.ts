import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WinstonModule } from 'nest-winston';
import { winstonConfig } from './common/logger/winston.config';
import { PriceModule } from './modules/price/price.module';
import { AuthModule } from './modules/auth/auth.module';
import { CoingeckoModule } from './modules/coingecko/coingecko.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    WinstonModule.forRoot(winstonConfig),
    PriceModule,
    AuthModule,
    CoingeckoModule,
    HealthModule,
  ],
})
export class AppModule {}
