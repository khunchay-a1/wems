import type { PurposeCode, RevisionScheme } from '../../../generated/prisma/enums';

export interface ExistingLabel {
  label: string;
  state: 'ACTIVE' | 'VOID';
}

/** FC (for construction) and AB (as-built) use the numeric / C series (BR-DOC-020/022). */
export function isConstructionPurpose(purpose: PurposeCode): boolean {
  return purpose === 'FC' || purpose === 'AB';
}

/** Bijective base-26: A=1 … Z=26, AA=27 … */
function alphaToNumber(label: string): number {
  let n = 0;
  for (const ch of label) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function numberToAlpha(n: number): string {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const ALPHA = /^[A-Z]+$/;
const NUMERIC = /^\d+$/;
const ISO = /^([PC])(\d{2,})$/;

/**
 * Next revision label (M04 §4, BR-DOC-020/022/023). `existing` excludes discarded drafts;
 * VOID labels count as used.
 */
export function nextRevisionLabel(
  scheme: RevisionScheme,
  existing: ExistingLabel[],
  purpose: PurposeCode,
): string {
  const labels = existing.map((e) => e.label);
  if (scheme === 'ALPHA_NUMERIC') {
    const numbers = labels.filter((l) => NUMERIC.test(l)).map(Number);
    // once a numeric revision exists, every following one is numeric
    if (numbers.length) return String(Math.max(...numbers) + 1);
    if (isConstructionPurpose(purpose)) return '0';
    const alphas = labels.filter((l) => ALPHA.test(l)).map(alphaToNumber);
    return numberToAlpha((alphas.length ? Math.max(...alphas) : 0) + 1);
  }
  const parsed = labels
    .map((l) => ISO.exec(l))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ series: m[1] as 'P' | 'C', n: Number(m[2]) }));
  const cs = parsed.filter((p) => p.series === 'C').map((p) => p.n);
  const pad = (n: number) => String(n).padStart(2, '0');
  if (cs.length) return `C${pad(Math.max(...cs) + 1)}`;
  if (isConstructionPurpose(purpose)) return 'C01';
  const ps = parsed.filter((p) => p.series === 'P').map((p) => p.n);
  return `P${pad((ps.length ? Math.max(...ps) : 0) + 1)}`;
}

/** BR-DOC-024: a label given by document.admin must follow the scheme's format. */
export function isValidLabel(scheme: RevisionScheme, label: string): boolean {
  return scheme === 'ALPHA_NUMERIC' ? ALPHA.test(label) || NUMERIC.test(label) : ISO.test(label);
}
