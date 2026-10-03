'use client';

import { useTranslations } from 'next-intl';
import { Button, type ButtonProps } from '@/components/ui/button';

export interface ActionState {
  allowedActions: string[];
  blockedActions: { action: string; code: string }[];
}

/** Translated reason of a blocked action (`errors.<CODE>.title`). */
export function useBlockedReason() {
  const t = useTranslations('errors');
  return (code: string) => (t.has(`${code}.title`) ? t(`${code}.title`) : code);
}

/**
 * Button driven by the API's allowedActions/blockedActions (CLAUDE.md rule 1):
 * hidden when the action is neither allowed nor blocked, disabled with the reason when blocked.
 */
export function ActionButton({
  state,
  action,
  children,
  ...props
}: { state: ActionState | undefined; action: string } & ButtonProps) {
  const reason = useBlockedReason();
  if (!state) return null;
  const blocked = state.blockedActions.find((b) => b.action === action);
  if (!blocked && !state.allowedActions.includes(action)) return null;
  return (
    <Button
      {...props}
      disabled={!!blocked || props.disabled}
      title={blocked ? reason(blocked.code) : props.title}
      data-action={action}
    >
      {children}
    </Button>
  );
}

export function can(state: ActionState | undefined, action: string): boolean {
  return !!state?.allowedActions.includes(action);
}
