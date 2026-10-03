'use client';

import { useTranslations } from 'next-intl';
import { toneOf } from '@/lib/status-colors';
import { Badge } from './ui/badge';

/** Enum value → translated label + semantic colour (docs/07-web-ui.md §3). */
export function StatusBadge({
  enumName,
  value,
}: {
  enumName: string;
  value: string | null | undefined;
}) {
  const t = useTranslations('enums');
  if (!value) return null;
  const key = `${enumName}.${value}`;
  return <Badge tone={toneOf(value)}>{t.has(key) ? t(key) : value}</Badge>;
}

export function EnumLabel({
  enumName,
  value,
}: {
  enumName: string;
  value: string | null | undefined;
}) {
  const t = useTranslations('enums');
  if (!value) return <>–</>;
  const key = `${enumName}.${value}`;
  return <>{t.has(key) ? t(key) : value}</>;
}
