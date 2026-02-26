import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PriceService } from './price.service';
import {
  CoinIdParamDto,
  GetPriceDto,
  GetHistoryDto,
  PriceResponseDto,
  PriceHistoryResponseDto,
} from './dto';

@ApiTags('Price')
@Controller('price')
export class PriceController {
  constructor(private readonly priceService: PriceService) {}

  @Get(':coinId')
  @ApiOperation({ summary: 'Get current price for a crypto asset' })
  @ApiResponse({
    status: 200,
    description: 'Current price',
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    type: PriceResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Coin not found on CoinGecko' })
  @ApiResponse({ status: 429, description: 'CoinGecko rate limit exceeded' })
  getPrice(@Param() params: CoinIdParamDto, @Query() query: GetPriceDto) {
    return this.priceService.getPrice(params.coinId, query.currency);
  }

  @Get(':coinId/history')
  @ApiOperation({ summary: 'Get price history for a crypto asset' })
  @ApiResponse({
    status: 200,
    description: 'Price history records',
    type: [PriceHistoryResponseDto],
  })
  getHistory(@Param() params: CoinIdParamDto, @Query() query: GetHistoryDto) {
    return this.priceService.getHistory(
      params.coinId,
      query.currency,
      query.limit,
    );
  }
}
