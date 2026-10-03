import { type APIRequestContext, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { ADMIN_EMAIL, ADMIN_PASSWORD, uniq } from './helpers';

const API = process.env.E2E_API_URL ?? 'http://localhost:4000';
export const USER_PASSWORD = 'e2e-river-basin-sediment-2569';

/** Bearer client against the API (mobile-style login, so no CSRF; POSTs carry an Idempotency-Key). */
export class Api {
  constructor(
    private readonly request: APIRequestContext,
    private readonly token: string,
  ) {}

  static async login(request: APIRequestContext, email: string, password: string): Promise<Api> {
    const res = await request.post(`${API}/api/v1/auth/login`, {
      data: { email, password, platform: 'ANDROID', deviceName: 'playwright' },
    });
    expect(res.status(), await res.text()).toBe(200);
    const body = (await res.json()) as { accessToken: string };
    return new Api(request, body.accessToken);
  }

  private headers(method: string): Record<string, string> {
    const h: Record<string, string> = { Authorization: `Bearer ${this.token}` };
    if (method === 'POST') h['Idempotency-Key'] = randomUUID();
    return h;
  }

  async call<T = unknown>(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT',
    path: string,
    data?: unknown,
    expected = [200, 201, 204],
  ): Promise<T> {
    const res = await this.request.fetch(`${API}/api/v1${path}`, {
      method,
      data,
      headers: this.headers(method),
    });
    expect(expected, `${method} ${path}: ${await res.text()}`).toContain(res.status());
    return (res.status() === 204 ? undefined : await res.json()) as T;
  }
}

export interface E2eUser {
  id: string;
  email: string;
  name: string;
}

/** Admin creates a user, the user replaces the temporary password with USER_PASSWORD. */
export async function createUser(
  request: APIRequestContext,
  admin: Api,
  name: string,
  roleCodes: string[],
): Promise<E2eUser> {
  const email = `e2e.${uniq()}@example.co.th`;
  const created = await admin.call<{ user: { id: string }; temporaryPassword: string }>(
    'POST',
    '/users',
    {
      email,
      displayNameTh: name,
      roleCodes,
    },
  );
  const self = await Api.login(request, email, created.temporaryPassword);
  await self.call('POST', '/auth/change-password', {
    currentPassword: created.temporaryPassword,
    newPassword: USER_PASSWORD,
  });
  return { id: created.user.id, email, name };
}

/**
 * A design project with pm, author, checker and a licensed approver (PIN 246810) —
 * the same team as the API test factory (docs/11-testing.md §3).
 */
export async function designProject(request: APIRequestContext) {
  const admin = await Api.login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
  const pm = await createUser(request, admin, 'ผู้จัดการ ทดสอบ', ['PROJECT_MANAGER']);
  const author = await createUser(request, admin, 'ผู้ออกแบบ ทดสอบ', ['ENGINEER']);
  const checker = await createUser(request, admin, 'ผู้ตรวจ ทดสอบ', ['ENGINEER']);
  const approver = await createUser(request, admin, 'ผู้อนุมัติ ทดสอบ', ['ENGINEER']);
  await admin.call('POST', `/users/${approver.id}/licenses`, {
    type: 'ENGINEER',
    licenseNo: `สย.${uniq()}`,
    branch: 'CIVIL',
    level: 'PROFESSIONAL',
    expiresAt: '2030-12-31',
  });
  const approverApi = await Api.login(request, approver.email, USER_PASSWORD);
  await approverApi.call('POST', '/auth/signing-pin', { password: USER_PASSWORD, pin: '246810' });

  const pmApi = await Api.login(request, pm.email, USER_PASSWORD);
  const client = await pmApi.call<{ id: string }>('POST', '/clients', {
    nameTh: `ลูกค้า ${uniq()}`,
  });
  const project = await pmApi.call<{ id: string; code: string }>('POST', '/projects', {
    name: `ระบบบำบัดน้ำเสีย ${uniq()}`,
    type: 'DESIGN',
    clientId: client.id,
  });
  for (const [u, role] of [
    [author, 'ENGINEER'],
    [checker, 'ENGINEER'],
    [approver, 'DESIGN_MANAGER'],
  ] as const) {
    await pmApi.call('POST', `/projects/${project.id}/members`, { userId: u.id, role });
  }
  return { projectId: project.id, projectCode: project.code, pm, author, checker, approver };
}

/** A small valid PDF with `pages` pages and a label (Latin only). */
export function makePdf(pages: number, label: string): Buffer {
  const objs: string[] = [];
  const kids = Array.from({ length: pages }, (_, i) => `${4 + i * 2} 0 R`).join(' ');
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages} >>`);
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  for (let i = 0; i < pages; i++) {
    const text = `BT /F1 36 Tf 72 700 Td (${label} p${i + 1}) Tj ET`;
    objs.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`,
    );
    objs.push(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`);
  }
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/** Upload through the presigned flow (BR-PLT-020) and wait for the worker to mark it AVAILABLE. */
export async function uploadFile(
  api: Api,
  request: APIRequestContext,
  name: string,
  body: Buffer,
  purpose = 'DOCUMENT_REVISION',
): Promise<string> {
  const u = await api.call<{ fileId: string; uploadUrl: string; headers: Record<string, string> }>(
    'POST',
    '/files/upload-url',
    {
      originalName: name,
      mimeType: 'application/pdf',
      sizeBytes: body.length,
      purpose,
    },
  );
  const put = await request.fetch(u.uploadUrl, { method: 'PUT', headers: u.headers, data: body });
  expect(put.ok(), await put.text()).toBe(true);
  await api.call('POST', `/files/${u.fileId}/complete`);
  await expect
    .poll(async () => (await api.call<{ status: string }>('GET', `/files/${u.fileId}`)).status, {
      timeout: 30_000,
    })
    .toBe('AVAILABLE');
  return u.fileId;
}

/** A PR drawing with an approved (signed) revision of the given purpose, created through the API. */
export async function approvedDrawing(
  request: APIRequestContext,
  p: Awaited<ReturnType<typeof designProject>>,
  title: string,
  purposeCode = 'FC',
) {
  const author = await Api.login(request, p.author.email, USER_PASSWORD);
  const disciplines = await author.call<{ id: string; code: string }[]>('GET', '/disciplines');
  const types = await author.call<{ id: string; code: string }[]>('GET', '/document-types');
  const templates = await author.call<{ code: string; steps: { id: string; kind: string }[] }[]>(
    'GET',
    '/workflow-templates',
  );
  const d = await author.call<{ id: string; number: string; currentRevision: { id: string } }>(
    'POST',
    `/projects/${p.projectId}/documents`,
    {
      title,
      disciplineId: disciplines.find((x) => x.code === 'PR')!.id,
      documentTypeId: types.find((x) => x.code === 'DWG')!.id,
      firstRevision: { purposeCode },
    },
  );
  const revId = d.currentRevision.id;
  const fileId = await uploadFile(author, request, `${title}.pdf`, makePdf(2, 'Approved'));
  const rev = await author.call<{ version: number }>('POST', `/revisions/${revId}/files`, {
    fileId,
    role: 'PDF_RENDITION',
  });
  const tpl = templates.find((x) => x.code === 'DRAW_CHECK_APPROVE')!;
  const steps = tpl.steps.flatMap((s) =>
    s.kind === 'CHECK'
      ? [{ templateStepId: s.id, assigneeId: p.checker.id }]
      : s.kind === 'APPROVE'
        ? [{ templateStepId: s.id, assigneeId: p.approver.id }]
        : [],
  );
  type Rev = {
    version: number;
    cycles: { steps: { id: string; kind: string; version: number }[] }[];
  };
  let r = await author.call<Rev>('POST', `/revisions/${revId}/submit`, {
    version: rev.version,
    steps,
  });
  const checker = await Api.login(request, p.checker.email, USER_PASSWORD);
  const check = r.cycles[0]!.steps.find((s) => s.kind === 'CHECK')!;
  r = await checker.call<Rev>('POST', `/review-steps/${check.id}/decision`, {
    version: check.version,
    decision: 'APPROVED',
  });
  const approver = await Api.login(request, p.approver.email, USER_PASSWORD);
  const approve = r.cycles[0]!.steps.find((s) => s.kind === 'APPROVE')!;
  await approver.call('POST', `/review-steps/${approve.id}/decision`, {
    version: approve.version,
    decision: 'APPROVED',
    signature: { method: 'SIGNING_PIN', secret: '246810' },
  });
  return { documentId: d.id, number: d.number, revisionId: revId };
}
