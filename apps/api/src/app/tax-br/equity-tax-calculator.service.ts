import { Injectable } from '@nestjs/common';
import { Big } from 'big.js';

import {
  IEquityRealizedEvent,
  IEquitySymbolState,
  ISameDayEquityWarning,
  ISymbolClassification,
  ITaxActivity
} from './interfaces/interfaces';

@Injectable()
export class EquityTaxCalculatorService {
  public compute(
    activities: ITaxActivity[],
    classifications: Map<string, ISymbolClassification>
  ): {
    realizedEvents: IEquityRealizedEvent[];
    sameDayWarnings: ISameDayEquityWarning[];
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

    const sameDayWarnings = this.detectSameDayWarnings(equityActivities);

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
          quantitySold: activity.quantity,
          symbol: activity.symbol,
          yearMonth: activity.yearMonth
        });
      }
    }

    return { realizedEvents, sameDayWarnings, symbolStates };
  }

  private detectSameDayWarnings(
    activities: ITaxActivity[]
  ): ISameDayEquityWarning[] {
    const typesBySymbolAndDate = new Map<
      string,
      {
        assetProfileIdentifier: string;
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
        dateBrt: activity.dateBrt,
        symbol: activity.symbol,
        types: new Set<string>()
      };

      entry.types.add(activity.type);
      typesBySymbolAndDate.set(key, entry);
    }

    const warnings: ISameDayEquityWarning[] = [];

    for (const entry of typesBySymbolAndDate.values()) {
      if (entry.types.has('BUY') && entry.types.has('SELL')) {
        warnings.push({
          assetProfileIdentifier: entry.assetProfileIdentifier,
          dateBrt: entry.dateBrt,
          symbol: entry.symbol
        });
      }
    }

    return warnings;
  }
}
