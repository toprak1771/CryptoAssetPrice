import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PriceResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id?: string;

  @ApiProperty({ example: 'bitcoin' })
  coinId: string;

  @ApiPropertyOptional({ example: 'btc', nullable: true })
  symbol?: string | null;

  @ApiProperty({ example: 67761 })
  price: number;

  @ApiProperty({ example: 'usd' })
  currency: string;

  @ApiPropertyOptional({
    example: true,
    description: 'True when served from cache (no DB write)',
  })
  fromCache?: boolean;

  @ApiProperty({ example: '2026-02-26T23:22:52.000Z' })
  fetchedAt?: Date;
}

export class PriceHistoryResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({ example: 'bitcoin' })
  coinId: string;

  @ApiPropertyOptional({ example: 'btc', nullable: true })
  symbol?: string | null;

  @ApiProperty({ example: 67761 })
  price: number;

  @ApiProperty({ example: 'usd' })
  currency: string;

  @ApiProperty({ example: '2026-02-26T23:22:52.000Z' })
  fetchedAt: Date;
}
