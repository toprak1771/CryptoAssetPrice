import {
  Inject,
  Injectable,
  HttpException,
  LoggerService,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import {
  CoinGeckoPriceResponse,
  CoinListItem,
} from './interfaces/coingecko-response.interface';
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
  withRetry,
} from '../../common/resilience';

@Injectable()
export class CoingeckoService {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly circuitBreaker: CircuitBreaker;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {
    this.baseUrl = this.configService.getOrThrow<string>('COINGECKO_API_URL');
    this.apiKey = this.configService.getOrThrow<string>('COINGECKO_API_KEY');
    this.circuitBreaker = new CircuitBreaker('CoinGecko', this.logger, {
      failureThreshold: 5,
      resetTimeoutMs: 30_000,
      halfOpenMaxAttempts: 1,
    });
  }

  async getPrice(
    ids: string,
    vsCurrencies: string = 'usd',
  ): Promise<CoinGeckoPriceResponse> {
    return this.resilientCall<CoinGeckoPriceResponse>('getPrice', () =>
      firstValueFrom(
        this.httpService.get<CoinGeckoPriceResponse>(
          `${this.baseUrl}/simple/price`,
          {
            params: { ids, vs_currencies: vsCurrencies },
            headers: { 'x-cg-demo-api-key': this.apiKey },
          },
        ),
      ).then((res) => res.data),
    );
  }

  async getCoinsList(): Promise<CoinListItem[]> {
    return this.resilientCall<CoinListItem[]>('getCoinsList', () =>
      firstValueFrom(
        this.httpService.get<CoinListItem[]>(`${this.baseUrl}/coins/list`, {
          headers: { 'x-cg-demo-api-key': this.apiKey },
        }),
      ).then((res) => res.data),
    );
  }

  private async resilientCall<T>(
    label: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    try {
      return await this.circuitBreaker.execute(() =>
        withRetry(fn, `CoinGecko:${label}`, this.logger, {
          maxRetries: 3,
          baseDelayMs: 200,
          maxDelayMs: 5_000,
        }),
      );
    } catch (error) {
      if (error instanceof CircuitBreakerOpenError) {
        this.logger.error?.(
          `Circuit breaker OPEN — ${error.serviceName} unavailable`,
          undefined,
          CoingeckoService.name,
        );
        throw new HttpException(
          {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Price service is temporarily unavailable',
            retryAfterMs: error.retryAfterMs,
          },
          503,
        );
      }

      const axiosError = error as AxiosError<{ error?: string }>;
      throw new HttpException(
        axiosError.response?.data?.error ?? 'CoinGecko API error',
        axiosError.response?.status ?? 502,
      );
    }
  }
}
