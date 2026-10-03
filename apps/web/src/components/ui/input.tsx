import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'flex h-9 w-full rounded-md border border-border bg-surface px-3 py-1 text-sm placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger-fg',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex min-h-20 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted disabled:opacity-50 aria-[invalid=true]:border-danger-fg',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'flex h-9 w-full rounded-md border border-border bg-surface px-2 text-sm disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
NativeSelect.displayName = 'NativeSelect';

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-sm font-medium text-foreground', className)} {...props} />;
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-danger-fg">{message}</p>;
}
