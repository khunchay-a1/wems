/* eslint-disable no-console -- CLI entry point */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import type { AuthUser } from './common/auth/auth-user';
import { isPermission, type Permission } from './common/auth/permissions';
import { checkPasswordPolicy, hashSecret } from './common/auth/password';
import { sha256Hex } from './common/crypto/crypto';
import { FilesService } from './common/files/files.service';
import { RequestContext } from './common/http/request-context';
import { IdGenerator } from './common/ids/id-generator';
import { makePdf } from './common/pdf/simple-pdf';
import { PrismaService } from './common/prisma/prisma.service';
import { ClockService } from './common/time/clock';
import type { ProjectRole, PurposeCode } from './generated/prisma/enums';
import { ClientsService } from './modules/clients/clients.service';
import { CommentsService } from './modules/documents/comments.service';
import { DesignBasisService } from './modules/documents/design-basis.service';
import { DocumentsService } from './modules/documents/documents.service';
import { ReviewService } from './modules/documents/review.service';
import { RevisionsService } from './modules/documents/revisions.service';
import { TransmittalsService } from './modules/documents/transmittals.service';
import { ProjectsService } from './modules/projects/projects.service';

/**
 * UAT demo data (roadmap P1-14): users of every role, 2 clients, 3 sites, 2 projects with teams,
 * 30 documents across every status, licences valid and expired, a transmittal and a design basis.
 * Everything goes through the real services, so numbering, audit and workflows stay consistent.
 *
 *   DEMO_PASSWORD='…' [DEMO_PIN=135790] node dist/demo-seed.js     (after `pnpm --filter api build`)
 *
 * Runs once: if the demo users already exist it stops without changes.
 */
const DOMAIN = 'demo.wems.local';

const PEOPLE: { key: string; name: string; nameEn: string; position: string; roles: string[] }[] = [
  {
    key: 'exec',
    name: 'วิชัย ผู้บริหาร',
    nameEn: 'Wichai Executive',
    position: 'กรรมการผู้จัดการ',
    roles: ['EXECUTIVE'],
  },
  {
    key: 'pm',
    name: 'สมชาย ใจดี',
    nameEn: 'Somchai Jaidee',
    position: 'ผู้จัดการโครงการ',
    roles: ['PROJECT_MANAGER'],
  },
  {
    key: 'dm',
    name: 'ประภา วิศวกรรม',
    nameEn: 'Prapa Wisawakam',
    position: 'วิศวกรอาวุโส (สามัญวิศวกร)',
    roles: ['ENGINEER'],
  },
  {
    key: 'senior',
    name: 'ธนา ใบอนุญาตหมด',
    nameEn: 'Thana Expired',
    position: 'วิศวกร (ใบอนุญาตหมดอายุ)',
    roles: ['ENGINEER'],
  },
  {
    key: 'eng1',
    name: 'กิตติ ออกแบบ',
    nameEn: 'Kitti Okbaep',
    position: 'วิศวกรโยธา',
    roles: ['ENGINEER'],
  },
  {
    key: 'eng2',
    name: 'มาลี ตรวจสอบ',
    nameEn: 'Malee Truatsop',
    position: 'วิศวกรสิ่งแวดล้อม',
    roles: ['ENGINEER'],
  },
  {
    key: 'drafter',
    name: 'อนันต์ เขียนแบบ',
    nameEn: 'Anan Khianbaep',
    position: 'ช่างเขียนแบบ',
    roles: ['DRAFTER'],
  },
  {
    key: 'dc',
    name: 'สุดา เอกสาร',
    nameEn: 'Suda Ekasan',
    position: 'ผู้ควบคุมเอกสาร',
    roles: ['DOCUMENT_CONTROLLER'],
  },
  {
    key: 'site',
    name: 'ชาญ หน้างาน',
    nameEn: 'Chan Nangan',
    position: 'วิศวกรสนาม',
    roles: ['SITE_STAFF'],
  },
  {
    key: 'labm',
    name: 'นภา แล็บ',
    nameEn: 'Napa Lab',
    position: 'ผู้จัดการห้องปฏิบัติการ',
    roles: ['LAB_MANAGER'],
  },
  {
    key: 'analyst',
    name: 'ปิยะ วิเคราะห์',
    nameEn: 'Piya Analyst',
    position: 'นักวิเคราะห์',
    roles: ['LAB_ANALYST'],
  },
  {
    key: 'sampler',
    name: 'สมศักดิ์ เก็บตัวอย่าง',
    nameEn: 'Somsak Sampler',
    position: 'เจ้าหน้าที่เก็บตัวอย่าง',
    roles: ['SAMPLER'],
  },
  {
    key: 'sales',
    name: 'รัตนา ขาย',
    nameEn: 'Rattana Sales',
    position: 'ธุรการขาย',
    roles: ['SALES_ADMIN'],
  },
  {
    key: 'acc',
    name: 'อรุณ บัญชี',
    nameEn: 'Arun Account',
    position: 'บัญชี',
    roles: ['ACCOUNTING'],
  },
];

type Ctx = Awaited<ReturnType<typeof boot>>;

async function boot() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  return {
    app,
    prisma: app.get(PrismaService),
    ids: app.get(IdGenerator),
    clock: app.get(ClockService),
    files: app.get(FilesService),
    clients: app.get(ClientsService),
    projects: app.get(ProjectsService),
    documents: app.get(DocumentsService),
    revisions: app.get(RevisionsService),
    review: app.get(ReviewService),
    comments: app.get(CommentsService),
    transmittals: app.get(TransmittalsService),
    designBasis: app.get(DesignBasisService),
  };
}

/** The same principal the AuthGuard would build for this user. */
async function asUser(c: Ctx, id: string): Promise<AuthUser> {
  const u = await c.prisma.user.findUniqueOrThrow({
    where: { id },
    include: { roles: { include: { role: { include: { permissions: true } } } } },
  });
  const permissions = new Set<Permission>();
  for (const r of u.roles)
    for (const p of r.role.permissions)
      if (isPermission(p.permission)) permissions.add(p.permission);
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayNameTh,
    locale: u.locale,
    sessionId: 'demo-seed',
    platform: 'WEB',
    permissions,
    roleCodes: u.roles.map((r) => r.role.code),
    mustChangePassword: false,
    via: 'bearer',
  };
}

/** Runs a service call as the user (audit actor = that user). */
async function as<T>(c: Ctx, userId: string, fn: (u: AuthUser) => Promise<T>): Promise<T> {
  const u = await asUser(c, userId);
  return RequestContext.run({ userId, requestId: `demo-${c.ids.next()}` }, () => fn(u));
}

async function createUsers(c: Ctx, password: string, pin: string): Promise<Record<string, string>> {
  const hash = await hashSecret(password);
  const pinHash = await hashSecret(pin);
  const roles = new Map((await c.prisma.role.findMany()).map((r) => [r.code, r.id]));
  const ids: Record<string, string> = {};
  for (const p of PEOPLE) {
    const id = c.ids.next();
    await c.prisma.user.create({
      data: {
        id,
        email: `${p.key}@${DOMAIN}`,
        displayNameTh: p.name,
        displayNameEn: p.nameEn,
        position: p.position,
        passwordHash: hash,
        signingPinHash: pinHash,
        roles: { create: p.roles.map((code) => ({ roleId: roles.get(code)! })) },
      },
    });
    ids[p.key] = id;
  }
  // licences: one valid, one expired (BR-DOC-040), one awaiting verification (BR-PLT-004)
  const admin = await c.prisma.user.findFirst({
    where: { roles: { some: { role: { code: 'ADMIN' } } } },
  });
  const verified = { verifiedAt: c.clock.now(), verifiedById: admin?.id ?? null };
  await c.prisma.professionalLicense.createMany({
    data: [
      {
        id: c.ids.next(),
        userId: ids.dm!,
        type: 'ENGINEER',
        branch: 'CIVIL',
        level: 'PROFESSIONAL',
        licenseNo: 'สย.12345',
        expiresAt: new Date('2029-12-31T00:00:00Z'),
        ...verified,
      },
      {
        id: c.ids.next(),
        userId: ids.senior!,
        type: 'ENGINEER',
        branch: 'CIVIL',
        level: 'SENIOR',
        licenseNo: 'วย.2345',
        expiresAt: new Date('2026-01-31T00:00:00Z'),
        ...verified,
      },
      {
        id: c.ids.next(),
        userId: ids.eng2!,
        type: 'ENGINEER',
        branch: 'ENVIRONMENTAL',
        level: 'ASSOCIATE',
        licenseNo: 'ภว.6789',
        expiresAt: new Date('2028-06-30T00:00:00Z'),
      },
    ],
  });
  return ids;
}

async function main(): Promise<void> {
  const password = process.env.DEMO_PASSWORD;
  const pin = process.env.DEMO_PIN ?? '135790';
  if (!password) throw new Error('set DEMO_PASSWORD (the password of every demo user)');
  const violation = checkPasswordPolicy(password, { email: `pm@${DOMAIN}`, names: [] });
  if (violation) throw new Error(`DEMO_PASSWORD rejected by the password policy: ${violation}`);
  if (!/^\d{6}$/.test(pin)) throw new Error('DEMO_PIN must be 6 digits');

  const c = await boot();
  try {
    if (await c.prisma.user.findUnique({ where: { email: `pm@${DOMAIN}` } })) {
      console.log('demo data already present — nothing to do');
      return;
    }
    const u = await createUsers(c, password, pin);
    console.log(`users: ${Object.keys(u).length} (password from DEMO_PASSWORD, PIN ${pin})`);

    // ── clients and sites (M02) ──
    const city = await as(c, u.pm!, (x) =>
      c.clients.create(
        {
          nameTh: 'เทศบาลนครตัวอย่าง',
          nameEn: 'Example City Municipality',
          clientType: 'LOCAL_AUTHORITY',
          province: 'ขอนแก่น',
          email: 'works@example-city.go.th',
        } as never,
        x,
      ),
    );
    const factory = await as(c, u.pm!, (x) =>
      c.clients.create(
        {
          nameTh: 'บริษัท อาหารตัวอย่าง จำกัด',
          nameEn: 'Example Foods Co., Ltd.',
          clientType: 'COMPANY',
          taxId: '0105559000000',
          province: 'ชลบุรี',
        } as never,
        x,
      ),
    );
    const wwtp = await c.clients.createSite(city.id, {
      code: 'WWTP-1',
      name: 'โรงบำบัดน้ำเสียเทศบาล',
      siteType: 'WASTEWATER_TREATMENT_PLANT',
    } as never);
    await c.clients.createSite(city.id, {
      code: 'WTP-1',
      name: 'โรงผลิตน้ำประปา',
      siteType: 'WATER_TREATMENT_PLANT',
    } as never);
    const plant = await c.clients.createSite(factory.id, {
      code: 'PLANT-1',
      name: 'โรงงานแปรรูปอาหาร',
      siteType: 'FACTORY',
    } as never);
    await c.clients.createContact(city.id, {
      name: 'คุณวิไล กองช่าง',
      email: 'wilai@example-city.go.th',
      receivesTransmittals: true,
      isPrimary: true,
    });
    await c.clients.createContact(factory.id, {
      name: 'คุณเอก ฝ่ายวิศวกรรม',
      email: 'ek@example-foods.co.th',
      receivesTransmittals: true,
      isPrimary: true,
    });

    // ── projects and teams (M03) ──
    const p1 = await as(c, u.pm!, (x) =>
      c.projects.create(
        {
          name: 'ปรับปรุงระบบบำบัดน้ำเสียเทศบาล',
          type: 'DESIGN',
          clientId: city.id,
          siteId: wwtp.id,
          contractValue: '4850000.00',
          plannedStartDate: '2026-07-01',
          plannedEndDate: '2027-03-31',
        } as never,
        x,
      ),
    );
    const p2 = await as(c, u.pm!, (x) =>
      c.projects.create(
        {
          name: 'ระบบบำบัดน้ำเสียโรงงานแปรรูปอาหาร',
          type: 'DESIGN_BUILD',
          clientId: factory.id,
          siteId: plant.id,
          contractValue: '12500000.00',
          plannedStartDate: '2026-09-01',
          plannedEndDate: '2027-08-31',
        } as never,
        x,
      ),
    );
    const team: [string, ProjectRole][] = [
      [u.dm!, 'DESIGN_MANAGER'],
      [u.senior!, 'ENGINEER'],
      [u.eng1!, 'ENGINEER'],
      [u.eng2!, 'ENGINEER'],
      [u.drafter!, 'DRAFTER'],
      [u.dc!, 'DOCUMENT_CONTROLLER'],
      [u.site!, 'SITE_ENGINEER'],
      [u.exec!, 'VIEWER'],
    ];
    for (const p of [p1, p2]) {
      for (const [userId, role] of team)
        await as(c, u.pm!, (x) => c.projects.addMember(p.id, { userId, role }, x));
      const fresh = await c.prisma.project.findUniqueOrThrow({ where: { id: p.id } });
      await as(c, u.pm!, (x) => c.projects.act(p.id, 'start', { version: fresh.version }, x));
    }
    console.log(`projects: ${p1.code}, ${p2.code}`);

    const disciplines = new Map((await c.prisma.discipline.findMany()).map((d) => [d.code, d.id]));
    const types = new Map((await c.prisma.documentType.findMany()).map((d) => [d.code, d.id]));
    const dca = await c.prisma.workflowTemplate.findFirstOrThrow({
      where: { code: 'DRAW_CHECK_APPROVE' },
      include: { steps: true },
    });

    // ── 30 documents across every state (M04) ──
    type Plan =
      'none' | 'draft' | 'draftPdf' | 'review' | 'rejected' | 'approved' | 'issued' | 'code3';
    const docs: {
      project: typeof p1;
      disc: string;
      type: string;
      title: string;
      purpose: PurposeCode;
      plan: Plan;
    }[] = [];
    const titles1 = [
      ['PR', 'DWG', 'แผนผังรวมระบบบำบัดน้ำเสีย'],
      ['PR', 'DWG', 'ผังการไหลของน้ำ (Flow diagram)'],
      ['PR', 'DWG', 'แปลนบ่อเติมอากาศ'],
      ['PR', 'DWG', 'รูปตัดถังตกตะกอน'],
      ['PR', 'DWG', 'แปลนบ่อสูบน้ำเสีย'],
      ['ST', 'DWG', 'โครงสร้างถังตกตะกอน'],
      ['ST', 'DWG', 'ฐานรากอาคารควบคุม'],
      ['ME', 'DWG', 'ผังท่อและวาล์ว'],
      ['EE', 'DWG', 'แผนภาพไฟฟ้ากำลัง'],
      ['GE', 'RPT', 'รายการคำนวณระบบบำบัด'],
      ['GE', 'RPT', 'รายงานสำรวจสภาพพื้นที่'],
      ['PR', 'DWG', 'แปลนลานตากตะกอน'],
      ['PR', 'DWG', 'รายละเอียดฝายน้ำล้น'],
      ['CV', 'DWG', 'แปลนถนนภายในโรงบำบัด'],
      ['PR', 'DWG', 'แปลนถังฆ่าเชื้อโรค'],
    ];
    const plans: Plan[] = [
      'issued',
      'code3',
      'approved',
      'approved',
      'review',
      'review',
      'rejected',
      'draftPdf',
      'draftPdf',
      'approved',
      'draft',
      'none',
      'review',
      'draft',
      'none',
    ];
    titles1.forEach(([disc, type, title], i) =>
      docs.push({
        project: p1,
        disc: disc!,
        type: type!,
        title: title!,
        purpose: plans[i] === 'issued' || plans[i] === 'code3' ? 'FA' : 'FR',
        plan: plans[i]!,
      }),
    );
    const titles2 = [
      'แผนผังระบบบำบัดน้ำเสียโรงงาน',
      'ถังปรับสมดุล',
      'ระบบ DAF',
      'ถังเติมอากาศ SBR',
      'ถังเก็บตะกอน',
      'ห้องเครื่องเป่าลม',
      'ผังท่อน้ำเสียในโรงงาน',
      'แผนภาพไฟฟ้าควบคุม',
      'รายการคำนวณ SBR',
      'แปลนบ่อพักน้ำทิ้ง',
      'รายละเอียดเครื่องกวน',
      'ผังติดตั้งเครื่องวัดอัตราการไหล',
      'แบบขยายรางระบายน้ำ',
      'แปลนอาคารเก็บสารเคมี',
      'คู่มือการเดินระบบ',
    ];
    const plans2: Plan[] = [
      'approved',
      'approved',
      'review',
      'review',
      'draftPdf',
      'draft',
      'none',
      'rejected',
      'approved',
      'draft',
      'none',
      'draftPdf',
      'review',
      'none',
      'draft',
    ];
    titles2.forEach((title, i) =>
      docs.push({
        project: p2,
        disc: i === 7 ? 'EE' : 'PR',
        type: i === 8 || i === 14 ? 'RPT' : 'DWG',
        title,
        purpose: i === 0 || i === 1 || i === 8 ? 'FC' : 'FR',
        plan: plans2[i]!,
      }),
    );

    const steps = dca.steps.flatMap((s) =>
      s.kind === 'CHECK'
        ? [{ templateStepId: s.id, assigneeId: u.eng2! }]
        : s.kind === 'APPROVE'
          ? [{ templateStepId: s.id, assigneeId: u.dm! }]
          : [],
    );
    const issued: { revisionId: string; project: typeof p1; code3?: boolean }[] = [];
    let n = 0;
    for (const d of docs) {
      n += 1;
      const month = String(10 + (n % 3)).padStart(2, '0');
      const created = await as(c, u.dc!, (x) =>
        c.documents.create(
          d.project.id,
          {
            title: d.title,
            disciplineId: disciplines.get(d.disc) ?? disciplines.get('PR')!,
            documentTypeId: types.get(d.type)!,
            ownerId: u.eng1!,
            plans: [
              { purposeCode: 'FA', plannedDate: `2026-${month}-15` },
              {
                purposeCode: 'FC',
                plannedDate: `2026-12-${String(5 + (n % 20)).padStart(2, '0')}`,
              },
            ],
          } as never,
          x,
        ),
      );
      if (d.plan === 'none') continue;
      const rev = await as(c, u.eng1!, (x) =>
        c.revisions.create(x, created.id, { purposeCode: d.purpose }),
      );
      if (d.plan === 'draft') continue;
      const pdf = makePdf(2, `${created.number} Rev.${rev.revLabel}`);
      const file = await c.files.storeGenerated(null, {
        name: `${created.number}_Rev${rev.revLabel}.pdf`,
        mimeType: 'application/pdf',
        body: pdf,
        uploadedById: u.eng1!,
        sha256: sha256Hex(pdf),
        pageCount: 2,
      });
      let r = await as(c, u.eng1!, (x) =>
        c.revisions.addFile(x, rev.id, { fileId: file.id, role: 'PDF_RENDITION' } as never),
      );
      if (d.plan === 'draftPdf') continue;
      r = await as(c, u.eng1!, (x) =>
        c.review.submit(x, rev.id, {
          version: r.version,
          templateId: dca.id,
          steps,
          note: 'ขอตรวจสอบตามขั้นตอน',
        }),
      );
      if (d.plan === 'review') continue;
      const check = r.cycles[0]!.steps.find((s) => s.kind === 'CHECK')!;
      if (d.plan === 'rejected') {
        await as(c, u.eng2!, (x) =>
          c.comments.create(x, {
            ownerType: 'DOCUMENT_REVISION',
            ownerId: rev.id,
            body: 'ระบุระดับท้องท่อและความลาดชันให้ครบ',
            reviewStepId: check.id,
            anchor: { kind: 'PIN', page: 1, x: 0.42, y: 0.35 },
          } as never),
        );
        await as(c, u.eng2!, (x) =>
          c.review.decide(x, check.id, { version: check.version, decision: 'REJECTED' } as never),
        );
        continue;
      }
      r = await as(c, u.eng2!, (x) =>
        c.review.decide(x, check.id, { version: check.version, decision: 'APPROVED' } as never),
      );
      const approve = r.cycles[0]!.steps.find((s) => s.kind === 'APPROVE')!;
      await as(c, u.dm!, (x) =>
        c.review.decide(x, approve.id, {
          version: approve.version,
          decision: 'APPROVED',
          signature: { method: 'SIGNING_PIN', secret: pin },
        } as never),
      );
      if (d.plan === 'issued' || d.plan === 'code3')
        issued.push({ revisionId: rev.id, project: d.project, code3: d.plan === 'code3' });
    }
    console.log(`documents: ${docs.length}`);

    // ── a sent transmittal (hard copy, so no email leaves) with one CODE_3 response ──
    if (issued.length) {
      const tr = await as(c, u.dc!, (x) =>
        c.transmittals.create(x, p1.id, {
          subject: 'ส่งแบบเพื่อพิจารณาอนุมัติ ชุดที่ 1',
          purposeCode: 'FA',
          deliveryMethod: 'HARD_COPY',
          recipientName: 'เทศบาลนครตัวอย่าง',
          items: issued.map((i) => ({ revisionId: i.revisionId, copies: 2, format: 'HARD_COPY' })),
        } as never),
      );
      const sent = await as(c, u.dc!, (x) =>
        c.transmittals.send(x, tr.id, { version: tr.version }),
      );
      const code3 = sent.items.find(
        (i) => issued.find((x) => x.revisionId === i.revisionId)?.code3,
      );
      if (code3) {
        await as(c, u.dc!, (x) =>
          c.transmittals.clientResponse(x, code3.id, {
            code: 'CODE_3',
            returnedAt: '2026-10-01',
            note: 'แก้ระดับท่อตามความเห็นกองช่าง',
          } as never),
        );
      }
      console.log(`transmittal: ${tr.number}`);
    }

    // ── design basis: approved rev 1 + draft rev 2 ──
    const bod = await c.prisma.parameter.findUnique({ where: { code: 'BOD5' } });
    const tss = await c.prisma.parameter.findUnique({ where: { code: 'TSS' } });
    const dbs = await as(c, u.eng1!, (x) => c.designBasis.create(x, p1.id, {}));
    const filled = await as(c, u.eng1!, (x) =>
      c.designBasis.update(x, dbs.id, {
        version: dbs.version,
        averageFlowM3PerDay: '12000',
        peakFactor: '2.5',
        designHorizonYear: 2046,
        populationEquivalent: 48000,
        items: [
          {
            parameterId: bod?.id ?? null,
            name: bod?.nameTh ?? 'BOD',
            unit: 'mg/L',
            influentValue: '180',
            influentMin: '120',
            influentMax: '250',
            targetEffluentValue: '20',
            source: 'MEASURED',
            sourceNote: 'ผลแล็บ ก.ค.–ส.ค. 2569 จำนวน 6 ตัวอย่าง',
          },
          {
            parameterId: tss?.id ?? null,
            name: tss?.nameTh ?? 'TSS',
            unit: 'mg/L',
            influentValue: '200',
            targetEffluentValue: '30',
            source: 'ASSUMED',
          },
        ],
      } as never),
    );
    await as(c, u.pm!, (x) =>
      c.designBasis.approve(x, dbs.id, {
        version: filled.version,
        signature: { method: 'SIGNING_PIN', secret: pin },
      }),
    );
    await as(c, u.eng1!, (x) => c.designBasis.create(x, p1.id, {}));
    console.log('design basis: rev 1 approved, rev 2 draft');

    console.log(`\nSign in with any of: ${PEOPLE.map((p) => `${p.key}@${DOMAIN}`).join(', ')}`);
  } finally {
    await c.app.close();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
