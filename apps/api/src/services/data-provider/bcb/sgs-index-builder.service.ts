import { Injectable } from '@nestjs/common';

import {
  IIndexAnchor,
  IIndexPoint,
  ISgsObservation,
  ISgsSeriesConfig
} from './interfaces/interfaces';

@Injectable()
export class SgsIndexBuilderService {
  public buildDailyIndex({}: {
    anchor?: IIndexAnchor;
    config: ISgsSeriesConfig;
    from: Date;
    observations: ISgsObservation[];
    to: Date;
  }): IIndexPoint[] {
    throw new Error('NOT_IMPLEMENTED');
  }
}
