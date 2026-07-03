import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';
import { FetchService } from '@ghostfolio/api/services/fetch/fetch.service';

import { Injectable } from '@nestjs/common';

import { ISgsObservation } from './interfaces/interfaces';

@Injectable()
export class SgsClientService {
  public constructor(
    private readonly configurationService: ConfigurationService,
    private readonly fetchService: FetchService
  ) {}

  public async fetchObservations({}: {
    from: Date;
    requestTimeout?: number;
    seriesId: number;
    to: Date;
  }): Promise<ISgsObservation[]> {
    throw new Error('NOT_IMPLEMENTED');
  }
}
