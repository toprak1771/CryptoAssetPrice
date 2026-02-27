import {
  ConflictException,
  Inject,
  Injectable,
  LoggerService,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthRepository } from './auth.repository';

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  async register(email: string, password: string) {
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const existing = await this.authRepository.findUserByEmail(email, tx);
        if (existing) {
          throw new ConflictException('Email already registered');
        }
        return await this.authRepository.createUser(
          { email, password: hashedPassword },
          tx,
        );
      });

      this.logger.log?.(`User registered: ${email}`, AuthService.name);
      return this.generateToken(user.id, user.email);
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code: string }).code === 'P2002'
      ) {
        throw new ConflictException('Email already registered');
      }
      throw error;
    }
  }

  async login(email: string, password: string) {
    const user = await this.authRepository.findUserByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    this.logger.log?.(`User logged in: ${email}`, AuthService.name);
    return this.generateToken(user.id, user.email);
  }

  private generateToken(userId: string, email: string) {
    const payload = { sub: userId, email };
    return {
      accessToken: this.jwtService.sign(payload),
    };
  }
}
