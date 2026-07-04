import { Big } from 'big.js';

export function roundToCents(value: Big): Big {
  return new Big(value).round(2, Big.roundHalfUp);
}
