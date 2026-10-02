import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PERMISSIONS } from './permissions';

const roles = JSON.parse(
  readFileSync(join(__dirname, '../../../../../docs/data/seed/roles.json'), 'utf8'),
) as { permissions: { code: string }[]; roles: { code: string; permissions: string[] }[] };

describe('P0-06 permissions.ts matches docs/data/seed/roles.json', () => {
  it('declares exactly the permission codes in roles.json', () => {
    expect([...PERMISSIONS].sort()).toEqual(roles.permissions.map((p) => p.code).sort());
  });

  it('every role only references declared permissions', () => {
    const declared = new Set<string>(PERMISSIONS);
    for (const r of roles.roles) {
      for (const p of r.permissions)
        expect({ role: r.code, p, ok: declared.has(p) }).toEqual({ role: r.code, p, ok: true });
    }
  });

  it('ADMIN has every permission', () => {
    const admin = roles.roles.find((r) => r.code === 'ADMIN');
    expect([...(admin?.permissions ?? [])].sort()).toEqual([...PERMISSIONS].sort());
  });
});
