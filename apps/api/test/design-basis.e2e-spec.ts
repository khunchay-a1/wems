import { DEFAULT_PASSWORD, makeUser } from './factories/users';
import { type DesignProject, makeDesignProject } from './factories/projects';
import { createTestApp, type TestApp } from './utils/app';
import { bearerLogin } from './utils/http';

describe('P1-11 design basis (M04 §3.7, BR-DOC-080..083)', () => {
  let t: TestApp;
  let p: DesignProject;

  beforeAll(async () => {
    t = await createTestApp();
    p = await makeDesignProject(t, 'ค่าออกแบบ');
  }, 60_000);
  afterAll(() => t.close());

  it('BR-DOC-080..083 draft, sources, self-approval, signed approval, new revision supersedes the old one', async () => {
    const params = (await p.author.c.get('/api/v1/parameters').expect(200)).body as {
      id: string;
      code: string;
      defaultUnit: string;
    }[];
    const standards = (await p.author.c.get('/api/v1/regulatory-standards').expect(200)).body as {
      id: string;
      code: string;
    }[];
    const bod = params.find((x) => x.code === 'BOD5')!;
    const std = standards[0]!;

    const r1 = (
      await p.author.c.post(`/api/v1/projects/${p.projectId}/design-bases`).send({}).expect(201)
    ).body;
    expect(r1).toMatchObject({ revNo: 1, status: 'DRAFT', items: [] });
    // only one DRAFT at a time (BR-DOC-081)
    const again = await p.author.c
      .post(`/api/v1/projects/${p.projectId}/design-bases`)
      .send({})
      .expect(409);
    expect(again.body.code).toBe('DBS_DRAFT_EXISTS');
    // site staff cannot edit
    await p.site.c
      .patch(`/api/v1/design-bases/${r1.id}`)
      .send({ version: r1.version, title: 'x' })
      .expect(403);

    // BR-DOC-082 MEASURED needs a source note (or lab tests in phase 3)
    const items: Record<string, string>[] = [
      {
        parameterId: bod.id,
        name: 'BOD',
        unit: 'mg/L',
        influentValue: '250',
        influentMin: '180',
        influentMax: '320',
        targetEffluentValue: '20',
        source: 'MEASURED',
      },
      { name: 'อัตราการไหลสูงสุด', unit: 'm³/h', influentValue: '62.5', source: 'CALCULATED' },
    ];
    const noNote = await p.author.c
      .patch(`/api/v1/design-bases/${r1.id}`)
      .send({ version: r1.version, items })
      .expect(422);
    expect(noNote.body).toMatchObject({ code: 'DBS_SOURCE_NOTE_REQUIRED', rule: 'BR-DOC-082' });
    expect(noNote.body.errors).toEqual([{ field: 'items[0].sourceNote', code: 'REQUIRED' }]);
    // money/analysis values are decimal strings only
    await p.author.c
      .patch(`/api/v1/design-bases/${r1.id}`)
      .send({ version: r1.version, averageFlowM3PerDay: 1500.25 })
      .expect(400);
    items[0] = { ...items[0]!, sourceNote: 'ผลแล็บ 3 ครั้ง ส.ค. 2569' };
    const saved = (
      await p.author.c
        .patch(`/api/v1/design-bases/${r1.id}`)
        .send({
          version: r1.version,
          averageFlowM3PerDay: '1500.25',
          peakFactor: '2.5',
          targetStandardId: std.id,
          items,
        })
        .expect(200)
    ).body;
    expect(saved.averageFlowM3PerDay).toBe('1500.25');
    expect(saved.items[0]).toMatchObject({
      parameterCode: 'BOD5',
      influentValue: '250',
      targetEffluentValue: '20',
    });
    expect(saved.allowedActions).toContain('edit');

    // the author holds designbasis.edit only; the PM approves — not their own revision (BR-DOC-083)
    await p.author.c
      .post(`/api/v1/design-bases/${r1.id}/approve`)
      .send({ version: saved.version, signature: { method: 'PASSWORD', secret: DEFAULT_PASSWORD } })
      .expect(403);
    const noSig = await p.pm.c
      .post(`/api/v1/design-bases/${r1.id}/approve`)
      .send({ version: saved.version })
      .expect(422);
    expect(noSig.body).toMatchObject({ code: 'DOC_SIGNATURE_REQUIRED', rule: 'BR-DOC-043' });
    const approved = (
      await p.pm.c
        .post(`/api/v1/design-bases/${r1.id}/approve`)
        .send({
          version: saved.version,
          signature: { method: 'PASSWORD', secret: DEFAULT_PASSWORD },
        })
        .expect(200)
    ).body;
    expect(approved).toMatchObject({ status: 'APPROVED', approvedBy: { id: p.pm.id } });
    expect(approved.signatureEventId).toBeTruthy();
    const frozen = await p.author.c
      .patch(`/api/v1/design-bases/${r1.id}`)
      .send({ version: approved.version, title: 'x' })
      .expect(409);
    expect(frozen.body.code).toBe('DBS_NOT_EDITABLE');

    // rev 2 copies rev 1; the PM creates it and so cannot approve it
    const r2 = (
      await p.pm.c.post(`/api/v1/projects/${p.projectId}/design-bases`).send({}).expect(201)
    ).body;
    expect(r2).toMatchObject({ revNo: 2, status: 'DRAFT', averageFlowM3PerDay: '1500.25' });
    expect(r2.items).toHaveLength(2);
    expect(r2.blockedActions).toContainEqual({ action: 'approve', code: 'DBS_SELF_APPROVAL' });
    const self = await p.pm.c
      .post(`/api/v1/design-bases/${r2.id}/approve`)
      .send({ version: r2.version, signature: { method: 'PASSWORD', secret: DEFAULT_PASSWORD } })
      .expect(422);
    expect(self.body).toMatchObject({ code: 'DBS_SELF_APPROVAL', rule: 'BR-DOC-083' });

    // another PM approves rev 2 → rev 1 SUPERSEDED (BR-DOC-080)
    const other = await makeUser(t.prisma, { roles: ['PROJECT_MANAGER'] });
    await p.pm.c
      .post(`/api/v1/projects/${p.projectId}/members`)
      .send({ userId: other.id, role: 'PROJECT_MANAGER' })
      .expect(201);
    const otherC = await bearerLogin(t.app, other.email);
    await otherC
      .post(`/api/v1/design-bases/${r2.id}/approve`)
      .send({ version: r2.version, signature: { method: 'PASSWORD', secret: DEFAULT_PASSWORD } })
      .expect(200);
    const list = (await p.site.c.get(`/api/v1/projects/${p.projectId}/design-bases`).expect(200))
      .body as { revNo: number; status: string }[];
    expect(list.map((x) => [x.revNo, x.status])).toEqual([
      [2, 'APPROVED'],
      [1, 'SUPERSEDED'],
    ]);
    const sig = await t.prisma.signatureEvent.findMany({ where: { entityType: 'DesignBasis' } });
    expect(sig).toHaveLength(2);
    expect(sig.every((s) => s.purpose === 'designbasis.approve' && s.fileSha256)).toBe(true);
  });
});
