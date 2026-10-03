import type { PurposeCode, RevisionScheme } from '../../../generated/prisma/enums';
import { type ExistingLabel, isValidLabel, nextRevisionLabel } from './revision-label';

const a = (...labels: string[]): ExistingLabel[] =>
  labels.map((l) =>
    l.endsWith('(VOID)')
      ? { label: l.replace('(VOID)', ''), state: 'VOID' }
      : { label: l, state: 'ACTIVE' },
  );

// every test vector of docs/modules/M04-design-documents.md §4
const VECTORS: [RevisionScheme, ExistingLabel[], PurposeCode, string][] = [
  ['ALPHA_NUMERIC', a(), 'FR', 'A'],
  ['ALPHA_NUMERIC', a('A'), 'FA', 'B'],
  ['ALPHA_NUMERIC', a('A', 'B'), 'FC', '0'],
  ['ALPHA_NUMERIC', a('A', 'B', '0'), 'FR', '1'],
  ['ALPHA_NUMERIC', a(), 'FC', '0'],
  ['ALPHA_NUMERIC', a('Z'), 'FR', 'AA'],
  ['ALPHA_NUMERIC', a('AZ'), 'FR', 'BA'],
  ['ALPHA_NUMERIC', a('A', 'B(VOID)'), 'FR', 'C'],
  ['ALPHA_NUMERIC', a('9'), 'AB', '10'],
  ['ISO19650', a(), 'FR', 'P01'],
  ['ISO19650', a('P09'), 'FA', 'P10'],
  ['ISO19650', a('P01', 'P02'), 'FC', 'C01'],
  ['ISO19650', a('C01'), 'FI', 'C02'],
];

describe('BR-DOC-020/022/023 revision labels (M04 §4)', () => {
  it.each(VECTORS)('%s %j + %s → %s', (scheme, existing, purpose, expected) => {
    expect(nextRevisionLabel(scheme, existing, purpose)).toBe(expected);
  });

  it('BR-DOC-024 label overrides must follow the scheme format', () => {
    expect(isValidLabel('ALPHA_NUMERIC', 'C')).toBe(true);
    expect(isValidLabel('ALPHA_NUMERIC', '3')).toBe(true);
    expect(isValidLabel('ALPHA_NUMERIC', 'P01')).toBe(false);
    expect(isValidLabel('ISO19650', 'P03')).toBe(true);
    expect(isValidLabel('ISO19650', 'C1')).toBe(false);
    expect(isValidLabel('ISO19650', 'B')).toBe(false);
  });
});
