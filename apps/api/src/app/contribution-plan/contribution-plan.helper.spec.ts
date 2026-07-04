import { Big } from 'big.js';

import { roundToCents } from './contribution-plan.helper';

describe('roundToCents', () => {
  it('rounds a Big value to two decimals using half-up', () => {
    const value = new Big('10.125');

    expect(roundToCents(value).toString()).toBe('10.13');
  });

  it('rounds down when the third decimal is below 5', () => {
    const value = new Big('10.124');

    expect(roundToCents(value).toString()).toBe('10.12');
  });

  it('does not mutate the original Big value passed in', () => {
    const value = new Big('10.125');

    roundToCents(value);

    expect(value.toString()).toBe('10.125');
  });
});
