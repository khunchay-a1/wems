'use client';

import { Check } from 'lucide-react';
import { Checkbox as C } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

export function Checkbox({ className, ...props }: React.ComponentProps<typeof C.Root>) {
  return (
    <C.Root
      className={cn(
        'flex size-4 shrink-0 items-center justify-center rounded border border-border bg-surface data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-white disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <C.Indicator>
        <Check className="size-3" />
      </C.Indicator>
    </C.Root>
  );
}
