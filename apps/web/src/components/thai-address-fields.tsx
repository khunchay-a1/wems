'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { FormField } from '@/components/form-field';
import { Input, NativeSelect } from '@/components/ui/input';

type AddressDb = Record<string, Record<string, [string, string][]>>;

let cache: Promise<AddressDb> | null = null;
/** Lazily loaded so the ~290 KB dataset is only fetched by pages with an address form. */
function loadDb(): Promise<AddressDb> {
  cache ??= import('@/data/thai-address.json').then((m) => m.default as unknown as AddressDb);
  return cache;
}

export interface ThaiAddress {
  addressLine?: string | null;
  subdistrict?: string | null;
  district?: string | null;
  province?: string | null;
  postcode?: string | null;
}

/**
 * จังหวัด → อำเภอ/เขต → ตำบล/แขวง → รหัสไปรษณีย์ (docs/modules/M02-clients-sites.md §4).
 * Values not in the dataset are kept, so older records still display.
 */
export function ThaiAddressFields({
  value,
  onChange,
}: {
  value: ThaiAddress;
  onChange: (v: ThaiAddress) => void;
}) {
  const t = useTranslations('address');
  const [db, setDb] = useState<AddressDb | null>(null);
  useEffect(() => {
    let alive = true;
    void loadDb().then((d) => alive && setDb(d));
    return () => {
      alive = false;
    };
  }, []);

  const provinces = useMemo(
    () => (db ? Object.keys(db).sort((a, b) => a.localeCompare(b, 'th')) : []),
    [db],
  );
  const districts = useMemo(
    () =>
      db && value.province && db[value.province]
        ? Object.keys(db[value.province]!).sort((a, b) => a.localeCompare(b, 'th'))
        : [],
    [db, value.province],
  );
  const subdistricts = useMemo(
    () =>
      db && value.province && value.district ? (db[value.province]?.[value.district] ?? []) : [],
    [db, value.province, value.district],
  );
  const withCurrent = (list: string[], current: string | null | undefined) =>
    current && !list.includes(current) ? [current, ...list] : list;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <FormField label={t('line')}>
          <Input
            value={value.addressLine ?? ''}
            onChange={(e) => onChange({ ...value, addressLine: e.target.value })}
          />
        </FormField>
      </div>
      <FormField label={t('province')}>
        <NativeSelect
          value={value.province ?? ''}
          onChange={(e) =>
            onChange({
              ...value,
              province: e.target.value || null,
              district: null,
              subdistrict: null,
              postcode: null,
            })
          }
          data-testid="address-province"
        >
          <option value="">–</option>
          {withCurrent(provinces, value.province).map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField label={t('district')}>
        <NativeSelect
          value={value.district ?? ''}
          disabled={!value.province}
          onChange={(e) =>
            onChange({
              ...value,
              district: e.target.value || null,
              subdistrict: null,
              postcode: null,
            })
          }
          data-testid="address-district"
        >
          <option value="">–</option>
          {withCurrent(districts, value.district).map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField label={t('subdistrict')}>
        <NativeSelect
          value={value.subdistrict ? `${value.subdistrict}|${value.postcode ?? ''}` : ''}
          disabled={!value.district}
          onChange={(e) => {
            const [sub, zip] = e.target.value.split('|');
            onChange({
              ...value,
              subdistrict: sub || null,
              postcode: zip || value.postcode || null,
            });
          }}
          data-testid="address-subdistrict"
        >
          <option value="">–</option>
          {value.subdistrict && !subdistricts.some(([s]) => s === value.subdistrict) ? (
            <option value={`${value.subdistrict}|${value.postcode ?? ''}`}>
              {value.subdistrict}
            </option>
          ) : null}
          {subdistricts.map(([s, zip]) => (
            <option key={`${s}|${zip}`} value={`${s}|${zip}`}>
              {s}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField label={t('postcode')}>
        <Input
          inputMode="numeric"
          maxLength={5}
          value={value.postcode ?? ''}
          onChange={(e) => onChange({ ...value, postcode: e.target.value })}
        />
      </FormField>
    </div>
  );
}

export function formatAddress(a: ThaiAddress): string {
  return [a.addressLine, a.subdistrict, a.district, a.province, a.postcode]
    .filter(Boolean)
    .join(' ');
}
