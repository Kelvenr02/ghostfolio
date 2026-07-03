import { Injectable } from '@nestjs/common';
import { Big } from 'big.js';

import {
  FixedIncomeRateBracket,
  IFixedIncomeLot,
  IFixedIncomeRedemptionSlice,
  ISymbolClassification,
  ITaxActivity
} from './interfaces/interfaces';
import { FIXED_INCOME_RATE_BRACKETS } from './tax-br.constants';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class FixedIncomeTaxCalculatorService {
  public compute(
    activities: ITaxActivity[],
    classifications: Map<string, ISymbolClassification>
  ): {
    openLots: IFixedIncomeLot[];
    redemptionSlices: IFixedIncomeRedemptionSlice[];
  } {
    const fixedIncomeActivities = activities
      .filter((activity) => activity.type === 'BUY' || activity.type === 'SELL')
      .filter((activity) => {
        const classification = classifications.get(
          `${activity.dataSource}-${activity.symbol}`
        );

        return (
          classification != null &&
          !classification.isConflicted &&
          classification.fiscalClass === 'RENDA_FIXA'
        );
      })
      .sort((a, b) => a.dateBrt.localeCompare(b.dateBrt));

    const lotsBySymbol = new Map<string, IFixedIncomeLot[]>();
    const redemptionSlices: IFixedIncomeRedemptionSlice[] = [];

    for (const activity of fixedIncomeActivities) {
      const assetProfileIdentifier = `${activity.dataSource}-${activity.symbol}`;

      if (activity.type === 'BUY') {
        const principalBrl = activity.grossValueBrl.plus(activity.feeBrl);
        const lots = lotsBySymbol.get(assetProfileIdentifier) ?? [];

        lots.push({
          assetProfileIdentifier,
          principalBrl,
          id: activity.id,
          acquisitionDateBrt: activity.dateBrt,
          quantity: activity.quantity,
          remainingPrincipalBrl: principalBrl,
          remainingQuantity: activity.quantity,
          symbol: activity.symbol
        });
        lotsBySymbol.set(assetProfileIdentifier, lots);
      } else {
        const lots = lotsBySymbol.get(assetProfileIdentifier) ?? [];
        const netRedemptionValueBrl = activity.grossValueBrl.minus(
          activity.feeBrl
        );
        const valuePerUnit = activity.quantity.eq(0)
          ? new Big(0)
          : netRedemptionValueBrl.div(activity.quantity);

        let quantityToRedeem = activity.quantity;

        for (const lot of lots) {
          if (quantityToRedeem.lte(0) || lot.remainingQuantity.lte(0)) {
            continue;
          }

          const unitsFromLot = quantityToRedeem.lt(lot.remainingQuantity)
            ? quantityToRedeem
            : lot.remainingQuantity;
          const principalPerUnit = lot.principalBrl.div(lot.quantity);
          const principalConsumedBrl = unitsFromLot.mul(principalPerUnit);
          const valueAllocatedBrl = unitsFromLot.mul(valuePerUnit);
          const yieldBrl = valueAllocatedBrl.minus(principalConsumedBrl);

          const daysHeld = Math.round(
            (new Date(activity.dateBrt).getTime() -
              new Date(lot.acquisitionDateBrt).getTime()) /
              MILLISECONDS_PER_DAY
          );

          const { bracket, ratePercent } = this.getRateBracket(daysHeld);

          redemptionSlices.push({
            daysHeld,
            ratePercent,
            assetProfileIdentifier,
            acquisitionDateBrt: lot.acquisitionDateBrt,
            lotId: lot.id,
            principalRedeemedBrl: principalConsumedBrl,
            rateBracket: bracket,
            redemptionDateBrt: activity.dateBrt,
            symbol: activity.symbol,
            taxWithheldBrl: yieldBrl.mul(ratePercent).div(100),
            yearMonth: activity.yearMonth,
            yieldBrl
          });

          lot.remainingQuantity = lot.remainingQuantity.minus(unitsFromLot);
          lot.remainingPrincipalBrl =
            lot.remainingPrincipalBrl.minus(principalConsumedBrl);
          quantityToRedeem = quantityToRedeem.minus(unitsFromLot);
        }

        lotsBySymbol.set(
          assetProfileIdentifier,
          lots.filter((lot) => lot.remainingQuantity.gt(0))
        );
      }
    }

    const openLots = Array.from(lotsBySymbol.values()).flat();

    return { openLots, redemptionSlices };
  }

  private getRateBracket(daysHeld: number): {
    bracket: FixedIncomeRateBracket;
    ratePercent: 22.5 | 20 | 17.5 | 15;
  } {
    const match = FIXED_INCOME_RATE_BRACKETS.find(
      ({ maxDays }) => maxDays === null || daysHeld <= maxDays
    );

    return { bracket: match.bracket, ratePercent: match.ratePercent };
  }
}
