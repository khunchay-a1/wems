import { catalogKeys } from '../i18n/locale';
import { ERROR_STATUS } from './error-codes';

describe('error catalog (docs/04-api-conventions.md §13)', () => {
  const codes = Object.keys(ERROR_STATUS).sort();

  it.each(['th', 'en'] as const)(
    'every error code has a %s message and no orphan messages',
    (locale) => {
      expect(catalogKeys(locale).sort()).toEqual(codes);
    },
  );

  it('statuses are valid HTTP error codes', () => {
    for (const status of Object.values(ERROR_STATUS)) {
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(600);
    }
  });
});
