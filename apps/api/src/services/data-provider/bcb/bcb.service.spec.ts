import { Logger } from '@nestjs/common';
import { DataSource } from '@prisma/client';
import { Big } from 'big.js';
import { format } from 'date-fns';

import { BcbService } from './bcb.service';
import { SgsIndexBuilderService } from './sgs-index-builder.service';

function toUtcDate(dateString: string) {
  return new Date(`${dateString}T00:00:00.000Z`);
}

describe('BcbService', () => {
  let bcbService: BcbService;
  let fetchObservationsMock: jest.Mock;
  let findFirstMock: jest.Mock;
  let findManyMock: jest.Mock;

  beforeEach(() => {
    fetchObservationsMock = jest.fn();
    findFirstMock = jest.fn();
    findManyMock = jest.fn();

    const configurationService = {
      get: (key: string) => {
        return key === 'REQUEST_TIMEOUT' ? 2000 : undefined;
      }
    };

    const prismaService = {
      marketData: { findFirst: findFirstMock, findMany: findManyMock }
    };

    const sgsClientService = { fetchObservations: fetchObservationsMock };

    bcbService = new BcbService(
      configurationService as never,
      prismaService as never,
      sgsClientService as never,
      new SgsIndexBuilderService()
    );

    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getHistorical', () => {
    it('returns a dense daily index keyed by symbol and yyyy-MM-dd, starting at base 100', async () => {
      findFirstMock.mockResolvedValue(null);
      fetchObservationsMock.mockResolvedValue([
        { date: '2026-06-01', rate: new Big('0.053400') },
        { date: '2026-06-02', rate: new Big('0.053400') },
        { date: '2026-06-03', rate: new Big('0.053400') }
      ]);

      const result = await bcbService.getHistorical({
        from: new Date('2026-06-01T00:00:00'),
        symbol: 'CDI',
        to: new Date('2026-06-05T00:00:00')
      });

      expect(result.CDI['2026-06-01'].marketPrice).toBe(100);
      expect(result.CDI['2026-06-02'].marketPrice).toBeCloseTo(100.0534, 4);

      // Dense evaluation: weekend days carry the last level
      expect(result.CDI['2026-06-04']).toBeDefined();
      expect(result.CDI['2026-06-05']).toBeDefined();
    });

    it('requests the SGS window extended by the series lookback', async () => {
      findFirstMock.mockResolvedValue(null);
      fetchObservationsMock.mockResolvedValue([]);

      await bcbService.getHistorical({
        from: new Date('2026-06-01T00:00:00'),
        symbol: 'CDI',
        to: new Date('2026-06-30T00:00:00')
      });

      const args = fetchObservationsMock.mock.calls[0][0];

      expect(args.seriesId).toBe(12);
      // CDI lookback is 15 days: 2026-06-01 - 15d = 2026-05-17
      expect(format(args.from, 'yyyy-MM-dd')).toBe('2026-05-17');
      expect(format(args.to, 'yyyy-MM-dd')).toBe('2026-06-30');
    });

    it('chains the index from the persisted anchor before the lookback window', async () => {
      findFirstMock.mockResolvedValue({
        date: toUtcDate('2026-06-17'),
        marketPrice: 100.29918888
      });
      fetchObservationsMock.mockResolvedValue([
        { date: '2026-06-18', rate: new Big('0.052531') }
      ]);

      const result = await bcbService.getHistorical({
        from: new Date('2026-06-18T00:00:00'),
        symbol: 'CDI',
        to: new Date('2026-06-19T00:00:00')
      });

      const expected = new Big('100.29918888')
        .times('1.00052531')
        .round(8)
        .toNumber();

      expect(result.CDI['2026-06-18'].marketPrice).toBe(expected);
      expect(result.CDI['2026-06-19'].marketPrice).toBe(expected);

      const anchorQuery = findFirstMock.mock.calls[0][0];

      expect(anchorQuery.where.symbol).toBe('CDI');
      expect(anchorQuery.where.dataSource).toBe(DataSource.BCB);
      expect(anchorQuery.orderBy).toEqual({ date: 'desc' });
    });

    it('incorporates an IPCA publication into a recent window even without observations inside [from, to]', async () => {
      // Anchor is older than the 120-day lookback horizon, hence final
      findFirstMock.mockResolvedValue({
        date: toUtcDate('2026-02-05'),
        marketPrice: 100
      });

      // Fetched with lookback: March, April and May are all published
      fetchObservationsMock.mockResolvedValue([
        { date: '2026-03-01', rate: new Big('0.88') },
        { date: '2026-04-01', rate: new Big('0.67') },
        { date: '2026-05-01', rate: new Big('0.58') }
      ]);

      const result = await bcbService.getHistorical({
        from: new Date('2026-06-03T00:00:00'),
        symbol: 'IPCA',
        to: new Date('2026-06-10T00:00:00')
      });

      const expected = new Big('100')
        .times('1.0088')
        .round(8)
        .times('1.0067')
        .round(8)
        .times('1.0058')
        .round(8)
        .toNumber();

      expect(result.IPCA['2026-06-03'].marketPrice).toBe(expected);
      expect(result.IPCA['2026-06-10'].marketPrice).toBe(expected);
    });

    it('returns an empty result for a symbol outside the catalog without calling SGS', async () => {
      const result = await bcbService.getHistorical({
        from: new Date('2026-06-01T00:00:00'),
        symbol: 'PETR4',
        to: new Date('2026-06-30T00:00:00')
      });

      expect(result).toEqual({});
      expect(fetchObservationsMock).not.toHaveBeenCalled();
    });

    it('wraps SGS outages in the standard provider error message', async () => {
      findFirstMock.mockResolvedValue(null);
      fetchObservationsMock.mockRejectedValue(
        new Error('RequestError: SGS is down')
      );

      await expect(
        bcbService.getHistorical({
          from: new Date('2026-06-01T00:00:00'),
          symbol: 'CDI',
          to: new Date('2026-06-30T00:00:00')
        })
      ).rejects.toThrow(/Could not get historical market data for CDI/);
    });
  });

  describe('getQuotes', () => {
    it('returns the latest persisted index as a delayed BRL quote', async () => {
      findManyMock.mockResolvedValue([
        { date: toUtcDate('2026-07-01'), marketPrice: 105.5, symbol: 'CDI' }
      ]);

      const response = await bcbService.getQuotes({
        symbols: ['CDI', 'IPCA', 'PETR4']
      });

      expect(response.CDI).toMatchObject({
        currency: 'BRL',
        dataSource: DataSource.BCB,
        marketPrice: 105.5,
        marketState: 'delayed'
      });

      // No fabricated quotes: symbols without persisted data are omitted
      expect(response.IPCA).toBeUndefined();
      expect(response.PETR4).toBeUndefined();
    });

    it('degrades to an empty response and logs when the database read fails', async () => {
      findManyMock.mockRejectedValue(new Error('database down'));

      await expect(bcbService.getQuotes({ symbols: ['CDI'] })).resolves.toEqual(
        {}
      );

      expect(Logger.prototype.error).toHaveBeenCalled();
    });
  });

  describe('static catalog contract', () => {
    it('canHandle only accepts catalog symbols', () => {
      expect(bcbService.canHandle('CDI')).toBe(true);
      expect(bcbService.canHandle('IPCA')).toBe(true);
      expect(bcbService.canHandle('PETR4')).toBe(false);
    });

    it('getAssetProfile returns a BRL profile for catalog symbols (admin prerequisite)', async () => {
      const profile = await bcbService.getAssetProfile({ symbol: 'CDI' });

      expect(profile).toMatchObject({
        currency: 'BRL',
        dataSource: DataSource.BCB,
        symbol: 'CDI'
      });
      expect(profile.name).toContain('CDI');
    });

    it('getAssetProfile returns undefined outside the catalog', async () => {
      await expect(
        bcbService.getAssetProfile({ symbol: 'PETR4' })
      ).resolves.toBeUndefined();
    });

    it('search matches the catalog case-insensitively', async () => {
      const { items } = await bcbService.search({ query: 'cd' });

      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        currency: 'BRL',
        dataSource: DataSource.BCB,
        symbol: 'CDI'
      });

      await expect(bcbService.search({ query: 'petr' })).resolves.toEqual({
        items: []
      });
    });

    it('getDividends honestly returns an empty object', async () => {
      await expect(
        bcbService.getDividends({
          from: new Date('2026-01-01T00:00:00'),
          symbol: 'CDI',
          to: new Date('2026-06-30T00:00:00')
        })
      ).resolves.toEqual({});
    });

    it('identifies itself as the BCB data source', () => {
      expect(bcbService.getName()).toBe(DataSource.BCB);
      expect(bcbService.getTestSymbol()).toBe('CDI');
      expect(bcbService.getDataProviderInfo()).toMatchObject({
        dataSource: DataSource.BCB,
        isPremium: false
      });
    });
  });
});
