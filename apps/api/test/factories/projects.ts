import { createHash } from 'node:crypto';
import type { ProjectRole } from '../../src/generated/prisma/client';
import { makePdf } from '../fixtures/pdf';
import type { TestApp } from '../utils/app';
import { bearerLogin, type BearerClient } from '../utils/http';
import { uploadFile } from '../utils/files';
import { makeUser, type MakeUserOptions } from './users';

export interface Member {
  id: string;
  email: string;
  c: BearerClient;
}

/**
 * A project with a typical design team (docs/11-testing.md §3):
 * pm (PROJECT_MANAGER), dc (DOCUMENT_CONTROLLER), author/checker (ENGINEER),
 * approver (DESIGN_MANAGER with a valid verified licence), site (SITE_ENGINEER).
 */
export async function makeDesignProject(t: TestApp, name = 'ระบบบำบัดน้ำเสีย') {
  const make = async (
    roles: string[],
    projectRole: ProjectRole | null,
    opts: MakeUserOptions = {},
  ) => {
    const u = await makeUser(t.prisma, { roles, ...opts });
    return { id: u.id, email: u.email, c: await bearerLogin(t.app, u.email), projectRole };
  };
  const pm = await make(['PROJECT_MANAGER'], null);
  const client = await pm.c
    .post('/api/v1/clients')
    .send({ nameTh: `ลูกค้า ${name}` })
    .expect(201);
  const project = await pm.c
    .post('/api/v1/projects')
    .send({ name, type: 'DESIGN', clientId: client.body.id })
    .expect(201);
  const projectId = project.body.id as string;
  const team = {
    dc: await make(['DOCUMENT_CONTROLLER'], 'DOCUMENT_CONTROLLER'),
    author: await make(['ENGINEER'], 'ENGINEER'),
    checker: await make(['ENGINEER'], 'ENGINEER'),
    approver: await make(['ENGINEER'], 'DESIGN_MANAGER', {
      signingPin: '246810',
      license: { expiresAt: '2030-12-31', level: 'PROFESSIONAL' },
    }),
    site: await make(['SITE_STAFF'], 'SITE_ENGINEER'),
  };
  for (const m of Object.values(team)) {
    await pm.c
      .post(`/api/v1/projects/${projectId}/members`)
      .send({ userId: m.id, role: m.projectRole })
      .expect(201);
  }
  const disciplines = await pm.c.get('/api/v1/disciplines').expect(200);
  const types = await pm.c.get('/api/v1/document-types').expect(200);
  const templates = await pm.c.get('/api/v1/workflow-templates').expect(200);
  const byCode = <T extends { code: string; id: string }>(list: T[], code: string) =>
    list.find((x) => x.code === code)!;
  return {
    projectId,
    projectCode: project.body.code as string,
    pm,
    ...team,
    disciplines: {
      PR: byCode(disciplines.body, 'PR').id,
      GE: byCode(disciplines.body, 'GE').id,
    },
    types: {
      DWG: byCode(types.body, 'DWG').id,
      RPT: byCode(types.body, 'RPT').id,
    },
    templates: templates.body as {
      id: string;
      code: string;
      steps: { id: string; kind: string; name: string }[];
    }[],
  };
}

export type DesignProject = Awaited<ReturnType<typeof makeDesignProject>>;

/** Uploads a PDF and marks it processed (the worker step, simulated). Returns the file id. */
export async function uploadPdf(
  t: TestApp,
  c: BearerClient,
  name = 'แบบ.pdf',
  pages = 2,
  label = name,
) {
  const body = makePdf(pages, label.replace(/[^\x20-\x7e]/g, 'x'));
  const fileId = await uploadFile(t.app, c, name, body);
  await t.prisma.fileObject.update({
    where: { id: fileId },
    data: {
      status: 'AVAILABLE',
      sha256: createHash('sha256').update(body).digest('hex'),
      pageCount: pages,
      processedAt: new Date(),
    },
  });
  return fileId;
}

/** Steps payload for a template: { CHECK: [ids], APPROVE: [ids] } by kind. */
export function stepsFor(
  template: { steps: { id: string; kind: string }[] },
  assignees: Partial<Record<'CHECK' | 'REVIEW' | 'APPROVE', string[]>>,
) {
  return template.steps.flatMap((s) =>
    (assignees[s.kind as 'CHECK'] ?? []).map((assigneeId) => ({
      templateStepId: s.id,
      assigneeId,
    })),
  );
}
