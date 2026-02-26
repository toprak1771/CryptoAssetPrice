import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CoinIdParamDto {
  @ApiProperty({
    description: 'CoinGecko coin identifier',
    example: 'bitcoin',
  })
  @IsString()
  @IsNotEmpty()
  coinId: string;
}
