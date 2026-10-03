import {
  codeVariant,
  isValidThaiTaxId,
  siteFieldViolations,
  suggestClientCode,
  suggestedBuildingStandardCode,
} from './client-rules';

describe('client rules', () => {
  describe('BR-CRM-002 Thai tax id checksum', () => {
    it.each(['0105536092641', '0994000165510', '3100600445589'])('accepts %s', (v) =>
      expect(isValidThaiTaxId(v)).toBe(true),
    );
    it.each(['0105536092642', '123', '01055360926411', 'abcdefghijklm'])('rejects %s', (v) =>
      expect(isValidThaiTaxId(v)).toBe(false),
    );
  });

  describe('BR-CRM-001 code suggestion', () => {
    it('uses initials for long names and skips legal suffixes', () => {
      expect(suggestClientCode('Siam Water Supply Co., Ltd.')).toBe('SWS');
    });
    it('joins two words', () => {
      expect(suggestClientCode('Aquatech Engineering')).toBe('AQUA-ENGI');
    });
    it('keeps a single word', () => {
      expect(suggestClientCode('Bangkokwater PCL')).toBe('BANGKOKW');
    });
    it('returns null without Latin text', () => {
      expect(suggestClientCode(null)).toBeNull();
      expect(suggestClientCode('การประปา')).toBeNull();
    });
    it('makes unique variants within 12 chars', () => {
      expect(codeVariant('ABC', 1)).toBe('ABC');
      expect(codeVariant('ABC', 2)).toBe('ABC-2');
      expect(codeVariant('ABCDEFGHIJKL', 12)).toBe('ABCDEFGHI-12');
    });
  });

  describe('BR-CRM-005 site fields per type', () => {
    it('allows building class only for buildings', () => {
      expect(siteFieldViolations({ siteType: 'BUILDING', buildingClass: 'B' })).toEqual([]);
      expect(siteFieldViolations({ siteType: 'FACTORY', buildingClass: 'B' })).toEqual([
        { field: 'buildingClass', code: 'ONLY_FOR_BUILDING' },
      ]);
    });
    it('allows factory registration only for factories', () => {
      expect(
        siteFieldViolations({ siteType: 'BUILDING', factoryRegistrationNo: '3-101-1/55' }),
      ).toEqual([{ field: 'factoryRegistrationNo', code: 'ONLY_FOR_FACTORY' }]);
    });
  });

  it('AT-CRM-03 BR-CRM-006 building class B proposes BLD-2548-B', () => {
    expect(suggestedBuildingStandardCode('B')).toBe('BLD-2548-B');
  });
});
