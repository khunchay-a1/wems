import { renderNumber, requiredContext, sequenceKey, validatePattern } from './pattern';

const now = new Date('2026-09-28T03:00:00Z');

describe('P0-08 numbering patterns (M01 §4)', () => {
  it('renders the default document number (BR-DOC-010)', () => {
    const ctx = { project: 'P26-001', discipline: 'PR', type: 'DWG' };
    expect(renderNumber('{PROJECT}-{DISCIPLINE}-{TYPE}-{SEQ:3}', ctx, 1, now)).toBe(
      'P26-001-PR-DWG-001',
    );
    expect(
      sequenceKey('DOCUMENT', '{PROJECT}-{DISCIPLINE}-{TYPE}-{SEQ:3}', 'NEVER', ctx, now),
    ).toBe('DOCUMENT|P26-001|PR|DWG');
  });

  it('BR-PLT-010 Buddhist-era year tokens', () => {
    expect(renderNumber('ป{BYY}-{SEQ:3}'.replace('ป', 'P'), {}, 7, now)).toBe('P69-007');
    expect(renderNumber('{BYYYY}/{SEQ:4}', {}, 12, now)).toBe('2569/0012');
    expect(renderNumber('LJ{YY}-{SEQ:5}', {}, 1, now)).toBe('LJ26-00001');
    expect(renderNumber('B{YY}{MM}-{SEQ:4}', {}, 1, now)).toBe('B2609-0001');
  });

  it('uses Bangkok time for year boundaries', () => {
    const newYearBkk = new Date('2026-12-31T17:30:00Z'); // 2027-01-01 00:30 in Bangkok
    expect(renderNumber('P{YY}-{SEQ:3}', {}, 1, newYearBkk)).toBe('P27-001');
    expect(sequenceKey('PROJECT', 'P{YY}-{SEQ:3}', 'YEARLY', {}, newYearBkk)).toBe('PROJECT|2027');
  });

  it('reset policy is part of the sequence key', () => {
    expect(sequenceKey('SAMPLE', 'S{YY}-{SEQ:6}', 'YEARLY', {}, now)).toBe('SAMPLE|2026');
    expect(sequenceKey('ANALYSIS_BATCH', 'B{YY}{MM}-{SEQ:4}', 'MONTHLY', {}, now)).toBe(
      'ANALYSIS_BATCH|2026-09',
    );
    expect(
      sequenceKey('TRANSMITTAL', 'TR-{PROJECT}-{SEQ:3}', 'NEVER', { project: 'P26-001' }, now),
    ).toBe('TRANSMITTAL|P26-001');
  });

  it('SEQ grows past its width instead of wrapping', () => {
    expect(renderNumber('X-{SEQ:3}', {}, 1234, now)).toBe('X-1234');
  });

  it('validates patterns', () => {
    expect(validatePattern('{PROJECT}-{DISCIPLINE}-{TYPE}-{SEQ:3}')).toBeNull();
    expect(validatePattern('P{YY}-001')).toBe('NO_SEQ');
    expect(validatePattern('{SEQ:3}-{SEQ:2}')).toBe('MULTIPLE_SEQ');
    expect(validatePattern('{FOO}-{SEQ:3}')).toBe('UNKNOWN_TOKEN');
    expect(validatePattern('{SEQ:0}')).toBe('BAD_SEQ_WIDTH');
    expect(validatePattern('{SEQ}')).toBe('BAD_SEQ_WIDTH');
    expect(validatePattern('A B{SEQ:3}')).toBe('UNSAFE_CHARACTERS');
    expect(requiredContext('TR-{PROJECT}-{SEQ:3}')).toEqual(['project']);
  });

  it('missing context values fail loudly', () => {
    expect(() => renderNumber('{PROJECT}-{SEQ:3}', {}, 1, now)).toThrow(/project/);
  });
});
