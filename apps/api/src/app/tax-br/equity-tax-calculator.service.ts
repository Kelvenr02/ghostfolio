import { Injectable } from '@nestjs/common';
import { Big } from 'big.js';

import {
  IEquityDataWarning,
  IEquityRealizedEvent,
  IEquitySymbolState,
  ISymbolClassification,
  ITaxActivity
} from './interfaces/interfaces';

@Injectable()
export class EquityTaxCalculatorService {
  public compute(
    activities: ITaxActivity[],
    classifications: Map<string, ISymbolClassification>
  ): {
    dataWarnings: IEquityDataWarning[];
    realizedEvents: IEquityRealizedEvent[];
    symbolStates: Map<string, IEquitySymbolState>;
  } {
    const equityActivities = activities
      .filter((activity) => activity.type === 'BUY' || activity.type === 'SELL')
      .filter((activity) => {
        const classification = classifications.get(
          `${activity.dataSource}-${activity.symbol}`
        );

        return (
          classification != null &&
          !classification.isConflicted &&
          classification.fiscalClass != null &&
          classification.fiscalClass !== 'RENDA_FIXA'
        );
      })
      .sort((a, b) => a.dateBrt.localeCompare(b.dateBrt));

    const { dataWarnings, dayTradeKeys } =
      this.detectSameDayActivity(equityActivities);

    const symbolStates = new Map<string, IEquitySymbolState>();
    const realizedEvents: IEquityRealizedEvent[] = [];

    for (const activity of equityActivities) {
      const assetProfileIdentifier = `${activity.dataSource}-${activity.symbol}`;
      const classification = classifications.get(assetProfileIdentifier);
      const fiscalClass = classification.fiscalClass as Exclude<
        ISymbolClassification['fiscalClass'],
        'RENDA_FIXA' | null
      >;
      const priorState = symbolStates.get(assetProfileIdentifier);

      if (activity.type === 'SELL' && priorState == null) {
        dataWarnings.push({
          assetProfileIdentifier,
          dataSource: activity.dataSource,
          dateBrt: activity.dateBrt,
          reason: 'SOLD_WITHOUT_PRIOR_PURCHASE',
          symbol: activity.symbol
        });
      }

      if (activity.type === 'BUY') {
        const costBasisBrl = (priorState?.costBasisBrl ?? new Big(0))
          .plus(activity.grossValueBrl)
          .plus(activity.feeBrl);
        const quantity = (priorState?.quantity ?? new Big(0)).plus(
          activity.quantity
        );

        symbolStates.set(assetProfileIdentifier, {
          assetProfileIdentifier,
          costBasisBrl,
          quantity,
          averagePriceBrl: quantity.eq(0)
            ? new Big(0)
            : costBasisBrl.div(quantity),
          dateOfFirstActivity:
            priorState?.dateOfFirstActivity ?? activity.dateBrt
        });
      } else {
        const priorQuantity = priorState?.quantity ?? new Big(0);
        const priorAveragePriceBrl = priorState?.averagePriceBrl ?? new Big(0);
        const priorCostBasisBrl = priorState?.costBasisBrl ?? new Big(0);

        const costOfSoldBrl = activity.quantity.mul(priorAveragePriceBrl);
        const netSaleValueBrl = activity.grossValueBrl.minus(activity.feeBrl);
        const realizedGainBrl = netSaleValueBrl.minus(costOfSoldBrl);

        let quantity = priorQuantity.minus(activity.quantity);
        let costBasisBrl = priorCostBasisBrl.minus(costOfSoldBrl);

        if (quantity.abs().lt(Number.EPSILON)) {
          quantity = new Big(0);
          costBasisBrl = new Big(0);
        }

        symbolStates.set(assetProfileIdentifier, {
          assetProfileIdentifier,
          costBasisBrl,
          quantity,
          averagePriceBrl: quantity.eq(0)
            ? new Big(0)
            : costBasisBrl.div(quantity),
          dateOfFirstActivity:
            priorState?.dateOfFirstActivity ?? activity.dateBrt
        });

        realizedEvents.push({
          assetProfileIdentifier,
          costOfSoldBrl,
          fiscalClass,
          realizedGainBrl,
          dataSource: activity.dataSource,
          dateBrt: activity.dateBrt,
          feeBrl: activity.feeBrl,
          grossSaleValueBrl: activity.grossValueBrl,
          isDayTrade: dayTradeKeys.has(
            `${assetProfileIdentifier}|${activity.dateBrt}`
          ),
          quantitySold: activity.quantity,
          symbol: activity.symbol,
          yearMonth: activity.yearMonth
        });
      }
    }

    return { dataWarnings, realizedEvents, symbolStates };
  }

  private detectSameDayActivity(activities: ITaxActivity[]): {
    dataWarnings: IEquityDataWarning[];
    dayTradeKeys: Set<string>;
  } {
    const typesBySymbolAndDate = new Map<
      string,
      {
        assetProfileIdentifier: string;
        dataSource: ITaxActivity['dataSource'];
        dateBrt: string;
        symbol: string;
        types: Set<string>;
      }
    >();

    for (const activity of activities) {
      const assetProfileIdentifier = `${activity.dataSource}-${activity.symbol}`;
      const key = `${assetProfileIdentifier}|${activity.dateBrt}`;
      const entry = typesBySymbolAndDate.get(key) ?? {
        assetProfileIdentifier,
        dataSource: activity.dataSource,
        dateBrt: activity.dateBrt,
        symbol: activity.symbol,
        types: new Set<string>()
      };

      entry.types.add(activity.type);
      typesBySymbolAndDate.set(key, entry);
    }

    const dataWarnings: IEquityDataWarning[] = [];
    const dayTradeKeys = new Set<string>();

    for (const [key, entry] of typesBySymbolAndDate) {
      if (entry.types.has('BUY') && entry.types.has('SELL')) {
        dataWarnings.push({
          assetProfileIdentifier: entry.assetProfileIdentifier,
          dataSource: entry.dataSource,
          dateBrt: entry.dateBrt,
          reason: 'SAME_DAY_ACTIVITY',
          symbol: entry.symbol
        });
        dayTradeKeys.add(key);
      }
    }

    return { dataWarnings, dayTradeKeys };
  }
}
