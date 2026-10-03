import * as React from 'react';
import { TONE_CLASSES, type Tone } from '@/lib/status-colors';
import { cn } from '@/lib/utils';

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        TONE_CLASSES[tone],
        className,
      )}
      {...props}
    />
  );
}
