'use client';

import { Tabs as T } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Tabs = T.Root;
export function TabsList({ className, ...props }: React.ComponentProps<typeof T.List>) {
  return <T.List className={cn('flex gap-1 border-b border-border', className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        '-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-muted hover:text-foreground data-[state=active]:border-primary data-[state=active]:font-medium data-[state=active]:text-foreground',
        className,
      )}
      {...props}
    />
  );
}
export function TabsContent({ className, ...props }: React.ComponentProps<typeof T.Content>) {
  return <T.Content className={cn('pt-4', className)} {...props} />;
}
