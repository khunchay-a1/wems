'use client';

import { DropdownMenu as M } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const DropdownMenu = M.Root;
export const DropdownMenuTrigger = M.Trigger;

export function DropdownMenuContent({
  className,
  ...props
}: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        sideOffset={6}
        align="end"
        className={cn(
          'z-50 min-w-48 rounded-md border border-border bg-surface p-1 shadow-lg',
          className,
        )}
        {...props}
      />
    </M.Portal>
  );
}

export function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof M.Item>) {
  return (
    <M.Item
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm outline-none select-none data-[highlighted]:bg-subtle data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator() {
  return <M.Separator className="my-1 h-px bg-border" />;
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof M.Label>) {
  return <M.Label className={cn('px-2 py-1.5 text-xs text-muted', className)} {...props} />;
}
