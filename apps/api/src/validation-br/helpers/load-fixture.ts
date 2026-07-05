import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

/**
 * Carrega uma fixture JSON de `apps/api/src/validation-br/fixtures/`,
 * revivendo strings ISO 8601 para `Date` — o mesmo shape que a
 * yahoo-finance2 devolve em runtime (chart()/quote() entregam `Date` JS).
 */
export function loadValidationFixture<T>(relativePath: string): T {
  return JSON.parse(
    readFileSync(join(__dirname, '..', 'fixtures', relativePath), 'utf8'),
    (_key, value) => {
      if (typeof value === 'string' && ISO_DATE_PATTERN.test(value)) {
        return new Date(value);
      }

      return value;
    }
  ) as T;
}
