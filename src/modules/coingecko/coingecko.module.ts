import { Module } from '@nestjs/common';
import { CoingeckoService } from './coingecko.service';

@Module({
  providers: [CoingeckoService],
})
export class CoingeckoModule {}
