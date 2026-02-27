import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { User } from '../../../generated/prisma/client';

type TxClient = Pick<PrismaService, 'user'>;

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findUserByEmail(email: string, tx?: TxClient): Promise<User | null> {
    const client = tx ?? this.prisma;
    return await client.user.findUnique({ where: { email } });
  }

  async createUser(
    data: { email: string; password: string },
    tx?: TxClient,
  ): Promise<{ id: string; email: string }> {
    const client = tx ?? this.prisma;
    const user = await client.user.create({
      data,
      select: { id: true, email: true },
    });
    return user;
  }
}
