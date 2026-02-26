import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { PriceRecord } from '../../../generated/prisma/client';

@Injectable()
export class PriceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(data: {
    coinId: string;
    symbol?: string;
    price: number;
    currency: string;
  }): Promise<PriceRecord> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
    return await this.prisma.priceRecord.create({ data });
  }

  async findHistory(
    coinId: string,
    currency: string,
    limit: number = 50,
  ): Promise<PriceRecord[]> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
    return await this.prisma.priceRecord.findMany({
      where: { coinId, currency },
      orderBy: { fetchedAt: 'desc' },
      take: limit,
    });
  }
}
