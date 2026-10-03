import type { BuildingClass, SiteType } from '../../../generated/prisma/enums';

/** BR-CRM-001 client code format. */
export const CLIENT_CODE_PATTERN = /^[A-Z0-9-]{2,12}$/;

/**
 * BR-CRM-002: Thai taxpayer id — 13 digits, last digit is the checksum
 * (11 − Σ dᵢ·(13−i) mod 11) mod 10 over the first 12 digits.
 */
export function isValidThaiTaxId(value: string): boolean {
  if (!/^\d{13}$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(value[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(value[12]);
}

const STOP_WORDS = new Set([
  'CO',
  'COMPANY',
  'LTD',
  'LIMITED',
  'PCL',
  'PUBLIC',
  'INC',
  'CORP',
  'CORPORATION',
  'THE',
  'AND',
  'OF',
  'GROUP',
  'THAILAND',
]);

/**
 * BR-CRM-001: proposes a code from the English name ("Siam Water Supply Co., Ltd." → "SWS",
 * "Aquatech Engineering" → "AQUA-ENGI"). Returns null when there is nothing Latin to use —
 * the service then falls back to a running "CL0001" style code.
 */
export function suggestClientCode(nameEn: string | null | undefined): string | null {
  const words = (nameEn ?? '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w));
  if (words.length === 0) return null;
  if (words.length >= 3)
    return words
      .map((w) => w[0])
      .join('')
      .slice(0, 12);
  if (words.length === 1) return words[0]!.slice(0, 8).padEnd(2, 'X');
  return words
    .map((w) => w.slice(0, 4))
    .join('-')
    .slice(0, 12);
}

/** Unique variant of a code: "ABC", "ABC-2", "ABC-3"… trimmed to 12 chars. */
export function codeVariant(base: string, attempt: number): string {
  if (attempt <= 1) return base;
  const suffix = `-${attempt}`;
  return base.slice(0, 12 - suffix.length) + suffix;
}

/** BR-CRM-005: fields that only make sense for one site type. */
export function siteFieldViolations(input: {
  siteType: SiteType;
  buildingClass?: BuildingClass | null;
  factoryRegistrationNo?: string | null;
  factoryTypeCode?: string | null;
}): { field: string; code: string }[] {
  const out: { field: string; code: string }[] = [];
  if (input.buildingClass && input.siteType !== 'BUILDING')
    out.push({ field: 'buildingClass', code: 'ONLY_FOR_BUILDING' });
  if (input.factoryRegistrationNo && input.siteType !== 'FACTORY')
    out.push({ field: 'factoryRegistrationNo', code: 'ONLY_FOR_FACTORY' });
  if (input.factoryTypeCode && input.siteType !== 'FACTORY')
    out.push({ field: 'factoryTypeCode', code: 'ONLY_FOR_FACTORY' });
  return out;
}

/** BR-CRM-006: building effluent standard proposed for a building class (seeded `BLD-2548-<class>`). */
export function suggestedBuildingStandardCode(buildingClass: BuildingClass): string {
  return `BLD-2548-${buildingClass}`;
}
