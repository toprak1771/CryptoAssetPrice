import { Module } from '@nestjs/common';
import { PriceModule } from './modules/price/price.module';
import { AuthModule } from './modules/auth/auth.module';
import { CoingeckoModule } from './modules/coingecko/coingecko.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [PriceModule, AuthModule, CoingeckoModule, HealthModule],
})
export class AppModule {}
