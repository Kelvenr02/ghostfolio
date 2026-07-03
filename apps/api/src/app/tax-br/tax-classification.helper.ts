import { ISymbolClassification, ITaxActivity } from './interfaces/interfaces';
import { CANONICAL_TAG_NAME_TO_FISCAL_CLASS } from './tax-br.constants';

export function resolveSymbolClassifications(
  activities: ITaxActivity[]
): Map<string, ISymbolClassification> {
  const activitiesBySymbol = new Map<string, ITaxActivity[]>();

  for (const activity of activities) {
    const assetProfileIdentifier = `${activity.dataSource}-${activity.symbol}`;
    const group = activitiesBySymbol.get(assetProfileIdentifier) ?? [];

    group.push(activity);
    activitiesBySymbol.set(assetProfileIdentifier, group);
  }

  const classifications = new Map<string, ISymbolClassification>();

  for (const [assetProfileIdentifier, symbolActivities] of activitiesBySymbol) {
    const matchedTagNames = new Set<string>();

    for (const activity of symbolActivities) {
      for (const tagName of activity.tagNames) {
        if (tagName in CANONICAL_TAG_NAME_TO_FISCAL_CLASS) {
          matchedTagNames.add(tagName);
        }
      }
    }

    const matchedFiscalClasses = new Set(
      Array.from(matchedTagNames).map(
        (tagName) => CANONICAL_TAG_NAME_TO_FISCAL_CLASS[tagName]
      )
    );

    const { dataSource, symbol } = symbolActivities[0];

    if (matchedFiscalClasses.size === 1) {
      classifications.set(assetProfileIdentifier, {
        assetProfileIdentifier,
        dataSource,
        symbol,
        conflictingTagNames: [],
        fiscalClass: Array.from(matchedFiscalClasses)[0],
        isConflicted: false
      });
    } else if (matchedFiscalClasses.size > 1) {
      classifications.set(assetProfileIdentifier, {
        assetProfileIdentifier,
        dataSource,
        symbol,
        conflictingTagNames: Array.from(matchedTagNames),
        fiscalClass: null,
        isConflicted: true
      });
    } else {
      classifications.set(assetProfileIdentifier, {
        assetProfileIdentifier,
        dataSource,
        symbol,
        conflictingTagNames: [],
        fiscalClass: null,
        isConflicted: false
      });
    }
  }

  return classifications;
}
