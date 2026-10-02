import { bangkokDate } from '../time/business-calendar';
import { defineNotification, t } from './catalog';

/** M01 notifications: security events and license expiry (docs/05-workflows.md §10). */
export function registerPlatformNotifications(): void {
  defineNotification('auth.account_locked', {
    channels: ['EMAIL'],
    notifyActor: true,
    recipients: (p) => Promise.resolve([String(p.userId)]),
    render: (p, l) =>
      Promise.resolve({
        title: t(l, 'บัญชีของคุณถูกล็อกชั่วคราว', 'Your account was temporarily locked'),
        body: t(
          l,
          `มีการเข้าสู่ระบบผิดหลายครั้ง บัญชีถูกล็อกถึง ${new Date(String(p.lockedUntil)).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })} หากไม่ใช่คุณ กรุณาแจ้งผู้ดูแลระบบ`,
          `Too many failed sign-ins. The account is locked until ${new Date(String(p.lockedUntil)).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' })}. If this was not you, contact an administrator.`,
        ),
        entityType: 'User',
        entityId: String(p.userId),
      }),
  });

  defineNotification('auth.token_reuse_detected', {
    channels: ['IN_APP', 'EMAIL'],
    notifyActor: true,
    recipients: (p) => Promise.resolve([String(p.userId)]),
    render: (_p, l) =>
      Promise.resolve({
        title: t(l, 'ตรวจพบการใช้ session ผิดปกติ', 'Suspicious session use detected'),
        body: t(
          l,
          'ระบบออกจากระบบอุปกรณ์ที่เกี่ยวข้องแล้ว แนะนำให้เปลี่ยนรหัสผ่านทันที',
          'The affected devices were signed out. Please change your password now.',
        ),
        link: '/profile',
      }),
  });

  defineNotification('license.expiring', {
    channels: ['IN_APP', 'EMAIL'],
    notifyActor: true,
    recipients: async (p, { prisma }) => {
      const admins = await prisma.user.findMany({
        where: { isActive: true, deletedAt: null, roles: { some: { role: { code: 'ADMIN' } } } },
        select: { id: true },
      });
      return [String(p.userId), ...admins.map((a) => a.id)];
    },
    render: async (p, l, { prisma }) => {
      const lic = await prisma.professionalLicense.findUnique({
        where: { id: String(p.licenseId) },
        include: { user: true },
      });
      const who = lic?.user.displayNameTh ?? '';
      const exp = lic ? bangkokDate(lic.expiresAt) : '';
      return {
        title: t(
          l,
          `ใบอนุญาตจะหมดอายุใน ${String(p.daysLeft)} วัน`,
          `License expires in ${String(p.daysLeft)} days`,
        ),
        body: t(
          l,
          `ใบอนุญาต ${lic?.licenseNo ?? ''} ของ ${who} หมดอายุ ${exp}`,
          `License ${lic?.licenseNo ?? ''} of ${who} expires on ${exp}`,
        ),
        entityType: 'ProfessionalLicense',
        entityId: String(p.licenseId),
        link: `/admin/users/${String(p.userId)}`,
      };
    },
  });
}
