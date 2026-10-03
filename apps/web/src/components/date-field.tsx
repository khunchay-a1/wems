'use client';

import { useFormat } from '@/lib/hooks/use-format';
import { Input } from './ui/input';

/** Date input that stores YYYY-MM-DD and shows the value in the user's calendar (พ.ศ./ค.ศ.). */
export function DateField({
  value,
  onChange,
  id,
  testId,
}: {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  id?: string;
  testId?: string;
}) {
  const f = useFormat();
  return (
    <div className="flex items-center gap-2">
      <Input
        id={id}
        type="date"
        className="w-44"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        data-testid={testId}
      />
      {value ? <span className="text-xs text-muted">{f.date(value, 'long')}</span> : null}
    </div>
  );
}
