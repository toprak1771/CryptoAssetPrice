import { Module } from '@nestjs/common';
import { CoingeckoModule } from '../coingecko/coingecko.module';
import { PriceController } from './price.controller';
import { PriceService } from './price.service';
import { PriceBatcherService } from './price-batcher.service';
import { PriceRepository } from './price.repository';

@Module({
  imports: [CoingeckoModule],
  controllers: [PriceController],
  providers: [PriceService, PriceBatcherService, PriceRepository],
})
export class PriceModule {}
