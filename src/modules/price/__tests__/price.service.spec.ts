import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { PriceService } from '../price.service';
import { PriceBatcherService } from '../price-batcher.service';
import { PriceRepository } from '../price.repository';
import { RedisService } from '../../../common/redis/redis.service';
import { ConfigService } from '@nestjs/config';

const mockLogger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

const mockPriceBatcher = {
  getPrice: jest.fn(),
};

const mockPriceRepository = {
  save: jest.fn(),
  findHistory: jest.fn(),
};

const mockRedis = {
  get: jest.fn(),
  setex: jest.fn(),
  scanKeys: jest.fn(),
  del: jest.fn(),
};

const mockConfigService = {
  get: jest.fn().mockReturnValue(10),
};

describe('PriceService', () => {
  let service: PriceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PriceService,
        { provide: PriceBatcherService, useValue: mockPriceBatcher },
        { provide: PriceRepository, useValue: mockPriceRepository },
        { provide: RedisService, useValue: mockRedis },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<PriceService>(PriceService);
    jest.clearAllMocks();
  });

  describe('getPrice', () => {
    it('should save to DB and invalidate history cache when data is fresh', async () => {
      const batchResult = {
        data: { bitcoin: { usd: 67000 } },
        fromCache: false,
      };
      const savedRecord = {
        id: 'uuid-1',
        coinId: 'bitcoin',
        price: 67000,
        currency: 'usd',
        fetchedAt: new Date(),
      };

      mockPriceBatcher.getPrice.mockResolvedValue(batchResult);
      mockPriceRepository.save.mockResolvedValue(savedRecord);
      mockRedis.scanKeys.mockResolvedValue([]);

      const result = await service.getPrice('bitcoin', 'usd', 'user-123');

      expect(result).toEqual(savedRecord);
      expect(mockPriceRepository.save).toHaveBeenCalledWith({
        coinId: 'bitcoin',
        price: 67000,
        currency: 'usd',
        userId: 'user-123',
      });
      expect(mockRedis.scanKeys).toHaveBeenCalledWith(
        'history:user-123:bitcoin:usd:*',
      );
    });

    it('should skip DB write when data comes from cache', async () => {
      const batchResult = {
        data: { bitcoin: { usd: 67000 } },
        fromCache: true,
      };

      mockPriceBatcher.getPrice.mockResolvedValue(batchResult);

      const result = await service.getPrice('bitcoin', 'usd', 'user-123');

      expect(result).toEqual({
        coinId: 'bitcoin',
        price: 67000,
        currency: 'usd',
        fromCache: true,
      });
      expect(mockPriceRepository.save).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when coin is not found', async () => {
      const batchResult = {
        data: {},
        fromCache: false,
      };

      mockPriceBatcher.getPrice.mockResolvedValue(batchResult);

      await expect(
        service.getPrice('invalidcoin', 'usd', 'user-123'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should invalidate history cache keys after saving', async () => {
      const batchResult = {
        data: { bitcoin: { usd: 67000 } },
        fromCache: false,
      };
      mockPriceBatcher.getPrice.mockResolvedValue(batchResult);
      mockPriceRepository.save.mockResolvedValue({});
      mockRedis.scanKeys.mockResolvedValue([
        'history:user-123:bitcoin:usd:50',
        'history:user-123:bitcoin:usd:10',
      ]);
      mockRedis.del.mockResolvedValue(2);

      await service.getPrice('bitcoin', 'usd', 'user-123');

      expect(mockRedis.del).toHaveBeenCalledWith(
        'history:user-123:bitcoin:usd:50',
        'history:user-123:bitcoin:usd:10',
      );
    });
  });

  describe('getHistory', () => {
    it('should return cached history when available', async () => {
      const cachedRecords = [
        { id: '1', coinId: 'bitcoin', price: 67000, currency: 'usd' },
      ];
      mockRedis.get.mockResolvedValue(JSON.stringify(cachedRecords));

      const result = await service.getHistory('bitcoin', 'usd', 'user-123', 50);

      expect(result).toEqual(cachedRecords);
      expect(mockPriceRepository.findHistory).not.toHaveBeenCalled();
    });

    it('should query DB and cache result on cache miss', async () => {
      const dbRecords = [
        { id: '1', coinId: 'bitcoin', price: 67000, currency: 'usd' },
      ];
      mockRedis.get.mockResolvedValue(null);
      mockPriceRepository.findHistory.mockResolvedValue(dbRecords);

      const result = await service.getHistory('bitcoin', 'usd', 'user-123', 50);

      expect(result).toEqual(dbRecords);
      expect(mockPriceRepository.findHistory).toHaveBeenCalledWith(
        'bitcoin',
        'usd',
        'user-123',
        50,
      );
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'history:user-123:bitcoin:usd:50',
        10,
        JSON.stringify(dbRecords),
      );
    });

    it('should not cache empty results', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPriceRepository.findHistory.mockResolvedValue([]);

      await service.getHistory('bitcoin', 'usd', 'user-123', 50);

      expect(mockRedis.setex).not.toHaveBeenCalled();
    });

    it('should fall back to DB when cache parse fails', async () => {
      mockRedis.get.mockResolvedValue('invalid-json');
      const dbRecords = [
        { id: '1', coinId: 'bitcoin', price: 67000, currency: 'usd' },
      ];
      mockPriceRepository.findHistory.mockResolvedValue(dbRecords);

      const result = await service.getHistory('bitcoin', 'usd', 'user-123', 50);

      expect(result).toEqual(dbRecords);
      expect(mockPriceRepository.findHistory).toHaveBeenCalledWith(
        'bitcoin',
        'usd',
        'user-123',
        50,
      );
    });
  });
});
