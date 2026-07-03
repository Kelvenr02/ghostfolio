import { Logger } from '@nestjs/common';
import { Big } from 'big.js';

import { SgsClientService } from './sgs-client.service';

function createJsonResponse(body: unknown, { status = 200 } = {}) {
  return {
    status,
    json: async () => body,
    ok: status >= 200 && status < 300
  };
}

describe('SgsClientService', () => {
  let client: SgsClientService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();

    const configurationService = {
      get: (key: string) => {
        return key === 'REQUEST_TIMEOUT' ? 2000 : undefined;
      }
    };

    const fetchService = { fetch: fetchMock };

    client = new SgsClientService(
      configurationService as never,
      fetchService as never
    );

    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('parses the real SGS payload shape into ISO dates and Big rates', async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse([
        { data: '01/06/2026', valor: '0.053400' },
        { data: '02/06/2026', valor: '0.053400' }
      ])
    );

    const observations = await client.fetchObservations({
      from: new Date('2026-06-01T00:00:00'),
      seriesId: 12,
      to: new Date('2026-06-30T00:00:00')
    });

    expect(observations).toHaveLength(2);
    expect(observations[0].date).toBe('2026-06-01');
    expect(observations[0].rate.eq(new Big('0.053400'))).toBe(true);

    const requestedUrl = fetchMock.mock.calls[0][0] as string;

    expect(requestedUrl).toContain('bcdata.sgs.12/dados');
    expect(requestedUrl).toContain('formato=json');
    expect(requestedUrl).toContain('dataInicial=01/06/2026');
    expect(requestedUrl).toContain('dataFinal=30/06/2026');
  });

  it('paginates windows larger than the SGS limit into chunks of at most 5 years', async () => {
    fetchMock.mockResolvedValue(createJsonResponse([]));

    await client.fetchObservations({
      from: new Date('2014-01-01T00:00:00'),
      seriesId: 12,
      to: new Date('2026-01-01T00:00:00')
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);

    const urls = fetchMock.mock.calls.map(([url]) => url as string);

    expect(urls[0]).toContain('dataInicial=01/01/2014');
    expect(urls[0]).toContain('dataFinal=31/12/2018');
    expect(urls[1]).toContain('dataInicial=01/01/2019');
    expect(urls[1]).toContain('dataFinal=31/12/2023');
    expect(urls[2]).toContain('dataInicial=01/01/2024');
    expect(urls[2]).toContain('dataFinal=01/01/2026');
  });

  it('sorts observations and keeps the last occurrence of duplicated dates', async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse([
        { data: '03/06/2026', valor: '0.03' },
        { data: '01/06/2026', valor: '0.01' },
        { data: '01/06/2026', valor: '0.02' }
      ])
    );

    const observations = await client.fetchObservations({
      from: new Date('2026-06-01T00:00:00'),
      seriesId: 12,
      to: new Date('2026-06-30T00:00:00')
    });

    expect(observations.map(({ date }) => date)).toEqual([
      '2026-06-01',
      '2026-06-03'
    ]);
    expect(observations[0].rate.eq(new Big('0.02'))).toBe(true);
  });

  it('returns an empty list for an empty series', async () => {
    fetchMock.mockResolvedValueOnce(createJsonResponse([]));

    await expect(
      client.fetchObservations({
        from: new Date('2026-06-01T00:00:00'),
        seriesId: 12,
        to: new Date('2026-06-30T00:00:00')
      })
    ).resolves.toEqual([]);
  });

  it('skips observations with an empty value and logs a warning', async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse([
        { data: '01/06/2026', valor: '' },
        { data: '02/06/2026', valor: '0.05' }
      ])
    );

    const observations = await client.fetchObservations({
      from: new Date('2026-06-01T00:00:00'),
      seriesId: 12,
      to: new Date('2026-06-30T00:00:00')
    });

    expect(observations).toHaveLength(1);
    expect(observations[0].date).toBe('2026-06-02');
    expect(Logger.prototype.warn).toHaveBeenCalled();
  });

  it('throws on a payload that is not an array, without retrying', async () => {
    fetchMock.mockResolvedValue(createJsonResponse({ error: 'unexpected' }));

    await expect(
      client.fetchObservations({
        from: new Date('2026-06-01T00:00:00'),
        seriesId: 12,
        to: new Date('2026-06-30T00:00:00')
      })
    ).rejects.toThrow(/SGS/);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws on malformed observations (missing fields or non-numeric value)', async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse([{ data: '01/06/2026', valor: 'abc' }])
    );

    await expect(
      client.fetchObservations({
        from: new Date('2026-06-01T00:00:00'),
        seriesId: 12,
        to: new Date('2026-06-30T00:00:00')
      })
    ).rejects.toThrow(/SGS/);
  });

  it('does not retry on HTTP 406 (window too large is a contract bug, not an outage)', async () => {
    fetchMock.mockResolvedValue(
      createJsonResponse(
        {
          error:
            'O sistema aceita uma janela de consulta de, no máximo, 10 anos'
        },
        { status: 406 }
      )
    );

    await expect(
      client.fetchObservations({
        from: new Date('2026-06-01T00:00:00'),
        seriesId: 12,
        to: new Date('2026-06-30T00:00:00')
      })
    ).rejects.toThrow(/406/);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries with exponential backoff on network errors and eventually succeeds', async () => {
    jest.useFakeTimers();

    fetchMock
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(
        createJsonResponse([{ data: '01/06/2026', valor: '0.05' }])
      );

    const promise = client.fetchObservations({
      from: new Date('2026-06-01T00:00:00'),
      seriesId: 12,
      to: new Date('2026-06-30T00:00:00')
    });

    // First retry waits 1000 ms
    await jest.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Second retry waits 2000 ms (exponential)
    await jest.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const observations = await promise;

    expect(observations).toHaveLength(1);
  });

  it('retries on HTTP 5xx', async () => {
    jest.useFakeTimers();

    fetchMock
      .mockResolvedValueOnce(createJsonResponse({}, { status: 500 }))
      .mockResolvedValueOnce(
        createJsonResponse([{ data: '01/06/2026', valor: '0.05' }])
      );

    const promise = client.fetchObservations({
      from: new Date('2026-06-01T00:00:00'),
      seriesId: 12,
      to: new Date('2026-06-30T00:00:00')
    });

    await jest.runAllTimersAsync();

    const observations = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(observations).toHaveLength(1);
  });

  it('gives up after 3 attempts with a typed error and a structured log', async () => {
    jest.useFakeTimers();

    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const promise = client.fetchObservations({
      from: new Date('2026-06-01T00:00:00'),
      seriesId: 12,
      to: new Date('2026-06-30T00:00:00')
    });

    const assertion = expect(promise).rejects.toThrow(/SGS series 12/);

    await jest.runAllTimersAsync();
    await assertion;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(Logger.prototype.error).toHaveBeenCalled();
  });
});
