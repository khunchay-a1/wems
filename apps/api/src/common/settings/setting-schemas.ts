import { z } from 'zod';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Shape of every Setting key (M01 §7). Values are validated before writes (docs/03-data-model.md §4). */
export const SETTING_SCHEMAS = {
  'company.profile': z.object({
    nameTh: z.string(),
    nameEn: z.string(),
    addressTh: z.string().default(''),
    addressEn: z.string().default(''),
    taxId: z.string().default(''),
    branchCode: z.string().default(''),
    phone: z.string().default(''),
    email: z.string().default(''),
    website: z.string().default(''),
    logoFileId: z.string().uuid().nullable().default(null),
  }),
  'calendar.holidays': z.array(isoDate),
  'calendar.workdayEnd': hhmm,
  'review.defaultDueDays': z.number().int().min(1).max(60),
  'review.reminderTime': hhmm,
  'transmittal.maxAttachmentMb': z.number().int().min(1).max(100),
  'transmittal.linkExpiryDays': z.number().int().min(1).max(365),
  'revision.skipLetters': z.array(z.string().regex(/^[A-Z]$/)),
  'security.sessionIdleMinutes': z
    .number()
    .int()
    .min(5)
    .max(24 * 60),
  'security.requireMfaRoles': z.array(z.string()),
  'tax.vatRate': z.number().min(0).max(100),
  'tax.defaultWithholdingRate': z.number().min(0).max(100),
  'quotation.approvalAmount': z.number().min(0),
  'quotation.maxDiscountPercent': z.number().min(0).max(100),
  'lab.receiptMaxTempC': z.number(),
  'lab.reportFooterNote': z.string(),
  'mobile.minSupportedVersion': z.object({ android: z.string(), ios: z.string() }),
} as const;

export type SettingKey = keyof typeof SETTING_SCHEMAS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTING_SCHEMAS)[K]>;

/** Keys any signed-in user may read (others need settings.manage). */
export const PUBLIC_SETTING_KEYS: readonly SettingKey[] = [
  'company.profile',
  'calendar.holidays',
  'calendar.workdayEnd',
  'review.defaultDueDays',
  'transmittal.maxAttachmentMb',
  'transmittal.linkExpiryDays',
];

export function isSettingKey(key: string): key is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTING_SCHEMAS, key);
}
