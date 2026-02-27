import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PriceService } from './price.service';
import {
  CoinIdParamDto,
  GetPriceDto,
  GetHistoryDto,
  PriceResponseDto,
  PriceHistoryResponseDto,
} from './dto';

@ApiTags('Price')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('price')
export class PriceController {
  constructor(private readonly priceService: PriceService) {}

  @Get(':coinId')
  @ApiOperation({ summary: 'Get current price for a crypto asset' })
  @ApiResponse({
    status: 200,
    description: 'Current price',
    type: PriceResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Coin not found on CoinGecko' })
  @ApiResponse({ status: 429, description: 'CoinGecko rate limit exceeded' })
  getPrice(
    @Param() params: CoinIdParamDto,
    @Query() query: GetPriceDto,
    @Req() req: { user: { userId: string } },
  ) {
    return this.priceService.getPrice(
      params.coinId,
      query.currency,
      req.user.userId,
    );
  }

  @Get(':coinId/history')
  @ApiOperation({ summary: 'Get price history for a crypto asset' })
  @ApiResponse({
    status: 200,
    description: 'Price history records',
    type: [PriceHistoryResponseDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getHistory(
    @Param() params: CoinIdParamDto,
    @Query() query: GetHistoryDto,
    @Req() req: { user: { userId: string } },
  ) {
    return this.priceService.getHistory(
      params.coinId,
      query.currency,
      req.user.userId,
      query.limit,
    );
  }
}
