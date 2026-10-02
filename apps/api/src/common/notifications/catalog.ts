import type { NotificationChannel, PrismaClient } from '../../generated/prisma/client';
import type { Locale } from '../i18n/locale';

/** What a notification looks like for one recipient. */
export interface RenderedNotification {
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  projectId?: string;
  /** Path inside the web app, e.g. /projects/<id>/documents/<docId> */
  link?: string;
  /** Extra lines for the email body */
  emailLines?: string[];
}

export interface NotificationContext {
  prisma: PrismaClient;
}

export interface NotificationDef {
  /** Default channels (docs/05-workflows.md §10) */
  channels: NotificationChannel[];
  /** In-app cannot be switched off (required work items) */
  mandatoryInApp?: boolean;
  /** Security mails go out even when the recipient caused the event */
  notifyActor?: boolean;
  recipients(payload: Record<string, unknown>, ctx: NotificationContext): Promise<string[]>;
  render(
    payload: Record<string, unknown>,
    locale: Locale,
    ctx: NotificationContext,
  ): Promise<RenderedNotification>;
}

const registry = new Map<string, NotificationDef>();

/** Modules register their event → notification definitions at import time. */
export function defineNotification(type: string, def: NotificationDef): void {
  registry.set(type, def);
}

export function notificationDef(type: string): NotificationDef | undefined {
  return registry.get(type);
}

export function notificationTypes(): string[] {
  return [...registry.keys()].sort();
}

/** Bilingual helper for definitions. */
export const t = (locale: Locale, th: string, en: string): string => (locale === 'en' ? en : th);
