import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';
import { FetchService } from '@ghostfolio/api/services/fetch/fetch.service';

import { Injectable, Logger } from '@nestjs/common';
import { Big } from 'big.js';
import { addDays, addYears, format, isAfter, min } from 'date-fns';

import {
  SGS_API_BASE_URL,
  SGS_FETCH_BASE_RETRY_DELAY_IN_MS,
  SGS_FETCH_MAX_ATTEMPTS,
  SGS_MAX_WINDOW_IN_YEARS
} from './bcb.constants';
import { ISgsObservation, ISgsRawObservation } from './interfaces/interfaces';

const SGS_DATE_FORMAT = 'dd/MM/yyyy';
const SGS_OBSERVATION_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;

class SgsRequestError extends Error {
  public constructor(
    message: string,
    public readonly isRetryable: boolean
  ) {
    super(message);

    this.name = 'SgsRequestError';
  }
}

@Injectable()
export class SgsClientService {
  private readonly logger = new Logger(SgsClientService.name);

  public constructor(
    private readonly configurationService: ConfigurationService,
    private readonly fetchService: FetchService
  ) {}

  public async fetchObservations({
    from,
    requestTimeout = this.configurationService.get('REQUEST_TIMEOUT'),
    seriesId,
    to
  }: {
    from: Date;
    requestTimeout?: number;
    seriesId: number;
    to: Date;
  }): Promise<ISgsObservation[]> {
    const observationByDate: { [date: string]: ISgsObservation } = {};

    for (const window of this.getWindows({ from, to })) {
      const rawObservations = await this.fetchWindowWithRetry({
        requestTimeout,
        seriesId,
        window
      });

      for (const rawObservation of rawObservations) {
        const observation = this.parseObservation({ rawObservation, seriesId });

        if (observation) {
          observationByDate[observation.date] = observation;
        }
      }
    }

    return Object.values(observationByDate).sort((a, b) => {
      return a.date.localeCompare(b.date);
    });
  }

  private async fetchWindow({
    requestTimeout,
    seriesId,
    window
  }: {
    requestTimeout: number;
    seriesId: number;
    window: { from: Date; to: Date };
  }): Promise<ISgsRawObservation[]> {
    const url = `${SGS_API_BASE_URL}/bcdata.sgs.${seriesId}/dados?formato=json&dataInicial=${format(
      window.from,
      SGS_DATE_FORMAT
    )}&dataFinal=${format(window.to, SGS_DATE_FORMAT)}`;

    const response = await this.fetchService.fetch(url, {
      signal: AbortSignal.timeout(requestTimeout)
    });

    if (!response.ok) {
      // 4xx means the request itself is wrong (e.g. 406 window limit):
      // retrying cannot help
      throw new SgsRequestError(
        `HTTP ${response.status} fetching SGS series ${seriesId}`,
        response.status >= 500
      );
    }

    const body = await response.json();

    if (!Array.isArray(body)) {
      throw new SgsRequestError(
        `Unexpected SGS payload for series ${seriesId}: expected an array`,
        false
      );
    }

    return body;
  }

  private async fetchWindowWithRetry({
    requestTimeout,
    seriesId,
    window
  }: {
    requestTimeout: number;
    seriesId: number;
    window: { from: Date; to: Date };
  }): Promise<ISgsRawObservation[]> {
    let lastError = new Error('UNKNOWN');

    for (let attempt = 0; attempt < SGS_FETCH_MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => {
          setTimeout(
            resolve,
            SGS_FETCH_BASE_RETRY_DELAY_IN_MS * 2 ** (attempt - 1)
          );
        });
      }

      try {
        return await this.fetchWindow({ requestTimeout, seriesId, window });
      } catch (error) {
        if (error instanceof SgsRequestError && !error.isRetryable) {
          throw error;
        }

        lastError = error;
      }
    }

    const message = `RequestError: Could not fetch SGS series ${seriesId} from ${format(
      window.from,
      SGS_DATE_FORMAT
    )} to ${format(window.to, SGS_DATE_FORMAT)} after ${SGS_FETCH_MAX_ATTEMPTS} attempts: [${lastError.name}] ${lastError.message}`;

    this.logger.error(message);

    throw new SgsRequestError(message, false);
  }

  private getWindows({ from, to }: { from: Date; to: Date }) {
    const windows: { from: Date; to: Date }[] = [];

    let windowStart = from;

    while (!isAfter(windowStart, to)) {
      const windowEnd = min([
        addDays(addYears(windowStart, SGS_MAX_WINDOW_IN_YEARS), -1),
        to
      ]);

      windows.push({ from: windowStart, to: windowEnd });

      windowStart = addDays(windowEnd, 1);
    }

    return windows;
  }

  private parseObservation({
    rawObservation,
    seriesId
  }: {
    rawObservation: ISgsRawObservation;
    seriesId: number;
  }): ISgsObservation | undefined {
    const { data, valor } = rawObservation ?? {};

    const dateMatch =
      typeof data === 'string'
        ? SGS_OBSERVATION_DATE_PATTERN.exec(data)
        : undefined;

    if (!dateMatch || typeof valor !== 'string') {
      throw new SgsRequestError(
        `Unexpected observation shape in SGS series ${seriesId}: ${JSON.stringify(
          rawObservation
        )}`,
        false
      );
    }

    if (valor.trim() === '') {
      this.logger.warn(
        `Skipping empty value in SGS series ${seriesId} at ${data}`
      );

      return undefined;
    }

    const [, day, month, year] = dateMatch;

    try {
      return { date: `${year}-${month}-${day}`, rate: new Big(valor) };
    } catch {
      throw new SgsRequestError(
        `Invalid numeric value "${valor}" in SGS series ${seriesId} at ${data}`,
        false
      );
    }
  }
}
