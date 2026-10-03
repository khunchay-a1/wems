import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { Confidentiality, DocumentSource, PurposeCode } from '../../generated/prisma/enums';
import type { AuthUser } from '../../common/auth/auth-user';
import type { FieldError } from '../../common/errors/problem';
import { Problem } from '../../common/errors/problem';
import { FilesService } from '../../common/files/files.service';
import { StorageService } from '../../common/files/storage.service';
import { enumLabel } from '../../common/i18n/enum-labels';
import type { Locale } from '../../common/i18n/locale';
import { NumberingService } from '../../common/numbering/numbering.service';
import { toDateOnly } from '../../common/prisma/helpers';
import { PrismaService } from '../../common/prisma/prisma.service';
import { bangkokDate } from '../../common/time/business-calendar';
import { ClockService } from '../../common/time/clock';
import { DocumentAccessService } from './document-access.service';
import { DocumentsService } from './documents.service';
import type { CreateDocumentDto, ListDocumentsQueryDto } from './dto/documents.dto';
import type { ImportResultDto } from './dto/excel.dto';

/** Import template columns (M04 §8) — order matters for the template. */
export const IMPORT_COLUMNS = [
  'number',
  'title',
  'titleEn',
  'discipline',
  'type',
  'source',
  'originator',
  'externalNumber',
  'ownerEmail',
  'confidentiality',
  'sheetSize',
  'scale',
  'tags',
  'remarks',
  'planFR',
  'planFA',
  'planFT',
  'planFC',
] as const;
type Column = (typeof IMPORT_COLUMNS)[number];

const SOURCES: DocumentSource[] = ['INTERNAL', 'EXTERNAL'];
const CONFIDENTIALITY: Confidentiality[] = ['INTERNAL', 'CLIENT_SHAREABLE', 'CONFIDENTIAL'];
const PLAN_PURPOSES: PurposeCode[] = ['FR', 'FA', 'FT', 'FC'];
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_ROWS = 2000;

export interface XlsxFile {
  name: string;
  mimeType: string;
  body: Buffer;
}

/** Text of a cell (rich text, formulas and dates included). */
function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('richText' in v)
      return v.richText
        .map((r) => r.text)
        .join('')
        .trim();
    if ('text' in v) return String(v.text).trim();
    if ('result' in v) return cellText(v.result);
    return '';
  }
  return String(v).trim();
}

/** Excel export, import template and all-or-nothing import of the register (BR-DOC-015/016). */
@Injectable()
export class DocumentsExcelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly docAccess: DocumentAccessService,
    private readonly documents: DocumentsService,
    private readonly files: FilesService,
    private readonly storage: StorageService,
    private readonly numbering: NumberingService,
    private readonly clock: ClockService,
  ) {}

  private locale(user: AuthUser): Locale {
    return user.locale === 'en' ? 'en' : 'th';
  }

  // ───────────────────────── export ─────────────────────────

  async export(projectId: string, q: ListDocumentsQueryDto, user: AuthUser): Promise<XlsxFile> {
    const access = await this.docAccess.project(user, projectId);
    if (!user.permissions.has('report.export')) throw new Problem('FORBIDDEN');
    const l = this.locale(user);
    const where = await this.documents.listWhere(projectId, q);
    const rows = await this.prisma.document.findMany({
      where,
      include: {
        discipline: true,
        documentType: true,
        owner: { select: { displayNameTh: true } },
        currentRevision: true,
        latestApprovedRevision: true,
        plans: true,
      },
      orderBy: { number: 'asc' },
      take: 20_000,
    });
    const wb = new ExcelJS.Workbook();
    wb.creator = 'WEMS';
    const ws = wb.addWorksheet(l === 'en' ? 'Documents' : 'ทะเบียนเอกสาร');
    const H = (th: string, en: string) => (l === 'en' ? en : th);
    ws.columns = [
      { header: H('เลขเอกสาร', 'Number'), key: 'number', width: 26 },
      { header: H('ชื่อ', 'Title'), key: 'title', width: 44 },
      { header: H('ชื่ออังกฤษ', 'Title (EN)'), key: 'titleEn', width: 30 },
      { header: H('สาขา', 'Discipline'), key: 'discipline', width: 10 },
      { header: H('ประเภท', 'Type'), key: 'type', width: 10 },
      { header: H('สถานะเอกสาร', 'Status'), key: 'status', width: 14 },
      { header: H('Rev. ปัจจุบัน', 'Current rev.'), key: 'rev', width: 10 },
      { header: H('สถานะ Rev.', 'Rev. status'), key: 'revStatus', width: 16 },
      { header: H('วัตถุประสงค์', 'Purpose'), key: 'purpose', width: 18 },
      { header: H('ฉบับใช้งาน', 'Approved rev.'), key: 'approved', width: 12 },
      { header: H('ผลตอบกลับลูกค้า', 'Client return'), key: 'clientCode', width: 18 },
      { header: H('ผู้รับผิดชอบ', 'Owner'), key: 'owner', width: 22 },
      ...PLAN_PURPOSES.flatMap((pc) => [
        { header: `${H('แผน', 'Plan')} ${pc}`, key: `plan${pc}`, width: 12 },
        { header: `${H('จริง', 'Actual')} ${pc}`, key: `actual${pc}`, width: 12 },
      ]),
      { header: 'Tags', key: 'tags', width: 20 },
    ];
    for (const d of rows) {
      const plan = (pc: PurposeCode) => d.plans.find((x) => x.purposeCode === pc);
      ws.addRow({
        number: d.number,
        title: d.title,
        titleEn: d.titleEn ?? '',
        discipline: d.discipline.code,
        type: d.documentType.code,
        status: enumLabel('DocumentStatus', d.status, l),
        rev: d.currentRevision?.revLabel ?? '',
        revStatus: enumLabel('RevisionStatus', d.currentRevision?.status, l),
        purpose: enumLabel('PurposeCode', d.currentRevision?.purposeCode, l),
        approved: d.latestApprovedRevision?.revLabel ?? '',
        clientCode: enumLabel('ClientReturnCode', d.latestApprovedRevision?.clientReturnCode, l),
        owner: d.owner?.displayNameTh ?? '',
        ...Object.fromEntries(
          PLAN_PURPOSES.flatMap((pc) => [
            [`plan${pc}`, toDateOnly(plan(pc)?.plannedDate) ?? ''],
            [`actual${pc}`, toDateOnly(plan(pc)?.actualDate) ?? ''],
          ]),
        ),
        tags: d.tags.join(', '),
      });
    }
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: 'A1', to: { row: 1, column: ws.columnCount } };
    const body = Buffer.from(await wb.xlsx.writeBuffer());
    const date = bangkokDate(this.clock.now());
    return { name: `${access.project.code}_documents_${date}.xlsx`, mimeType: XLSX, body };
  }

  // ───────────────────────── template ─────────────────────────

  async template(projectId: string, user: AuthUser): Promise<XlsxFile> {
    const access = await this.docAccess.project(user, projectId);
    if (!user.permissions.has('document.create')) throw new Problem('FORBIDDEN');
    const [disciplines, types] = await Promise.all([
      this.prisma.discipline.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.documentType.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('documents');
    ws.columns = IMPORT_COLUMNS.map((c) => ({ header: c, key: c, width: c === 'title' ? 40 : 16 }));
    ws.getRow(1).font = { bold: true };
    ws.addRow({
      title: 'แผนผังระบบบำบัดน้ำเสีย',
      discipline: disciplines[0]?.code ?? 'PR',
      type: types[0]?.code ?? 'DWG',
      planFA: bangkokDate(this.clock.now()),
    });
    const lists = wb.addWorksheet('codes');
    lists.columns = [
      { header: 'discipline', key: 'd', width: 12 },
      { header: 'name', key: 'dn', width: 30 },
      { header: 'type', key: 't', width: 12 },
      { header: 'name', key: 'tn', width: 40 },
    ];
    for (let i = 0; i < Math.max(disciplines.length, types.length); i++) {
      lists.addRow({
        d: disciplines[i]?.code,
        dn: disciplines[i]?.nameTh,
        t: types[i]?.code,
        tn: types[i]?.nameTh,
      });
    }
    lists.getRow(1).font = { bold: true };
    return {
      name: `${access.project.code}_import_template.xlsx`,
      mimeType: XLSX,
      body: Buffer.from(await wb.xlsx.writeBuffer()),
    };
  }

  // ───────────────────────── import ─────────────────────────

  /** BR-DOC-015 all-or-nothing import; BR-DOC-016 explicit numbers need document.admin. */
  async import(
    projectId: string,
    fileId: string,
    dryRun: boolean,
    user: AuthUser,
  ): Promise<ImportResultDto> {
    const access = await this.docAccess.project(user, projectId);
    if (!user.permissions.has('document.create')) throw new Problem('FORBIDDEN');
    this.docAccess.assertProjectEditable(access);
    const file = await this.files.assertUsable(user, fileId);
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(
        (await this.storage.getBuffer(file.storageKey)) as unknown as ExcelJS.Buffer,
      );
    } catch {
      throw new Problem('UNSUPPORTED_FILE_TYPE', {
        errors: [{ field: 'fileId', code: 'NOT_XLSX' }],
      });
    }
    const ws = wb.worksheets[0];
    if (!ws)
      throw new Problem('IMPORT_INVALID_ROWS', {
        rule: 'BR-DOC-015',
        errors: [{ field: 'file', code: 'EMPTY' }],
      });
    const header = new Map<Column, number>();
    ws.getRow(1).eachCell((cell, col) => {
      const name = cellText(cell.value) as Column;
      if ((IMPORT_COLUMNS as readonly string[]).includes(name)) header.set(name, col);
    });
    const errors: FieldError[] = [];
    for (const required of ['title', 'discipline', 'type'] as Column[]) {
      if (!header.has(required))
        errors.push({ field: required, column: required, row: 1, code: 'MISSING_COLUMN' });
    }
    if (errors.length) throw new Problem('IMPORT_INVALID_ROWS', { rule: 'BR-DOC-015', errors });

    const [disciplines, types, members] = await Promise.all([
      this.prisma.discipline.findMany({ where: { isActive: true } }),
      this.prisma.documentType.findMany({ where: { isActive: true } }),
      this.prisma.projectMember.findMany({
        where: { projectId, removedAt: null, user: { isActive: true } },
        include: { user: { select: { id: true, email: true } } },
      }),
    ]);
    const memberByEmail = new Map(members.map((m) => [m.user.email.toLowerCase(), m.user.id]));
    const parsed: {
      row: number;
      dto: CreateDocumentDto;
      number?: string;
      codes: { d: string; t: string };
    }[] = [];
    const numbersInFile = new Set<string>();
    ws.eachRow({ includeEmpty: false }, (row, rowNo) => {
      if (rowNo === 1) return;
      const get = (c: Column) => (header.has(c) ? cellText(row.getCell(header.get(c)!).value) : '');
      if (IMPORT_COLUMNS.every((c) => !get(c))) return;
      const err = (column: Column, code: string) =>
        errors.push({ field: column, column, row: rowNo, code });
      const title = get('title');
      if (!title) err('title', 'REQUIRED');
      else if (title.length > 500) err('title', 'TOO_LONG');
      const d = disciplines.find((x) => x.code === get('discipline').toUpperCase());
      if (!d) err('discipline', 'UNKNOWN_CODE');
      const t = types.find((x) => x.code === get('type').toUpperCase());
      if (!t) err('type', 'UNKNOWN_CODE');
      const source = (get('source').toUpperCase() || 'INTERNAL') as DocumentSource;
      if (!SOURCES.includes(source)) err('source', 'INVALID');
      const conf = (get('confidentiality').toUpperCase() || 'CLIENT_SHAREABLE') as Confidentiality;
      if (!CONFIDENTIALITY.includes(conf)) err('confidentiality', 'INVALID');
      let ownerId: string | undefined;
      if (get('ownerEmail')) {
        ownerId = memberByEmail.get(get('ownerEmail').toLowerCase());
        if (!ownerId) err('ownerEmail', 'NOT_MEMBER');
      }
      const plans: CreateDocumentDto['plans'] = [];
      for (const pc of PLAN_PURPOSES) {
        const v = get(`plan${pc}` as Column);
        if (!v) continue;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v)))
          err(`plan${pc}` as Column, 'INVALID_DATE');
        else plans.push({ purposeCode: pc, plannedDate: v });
      }
      const number = get('number') || undefined;
      if (number) {
        if (!user.permissions.has('document.admin')) err('number', 'DOCUMENT_ADMIN_REQUIRED');
        if (numbersInFile.has(number)) err('number', 'DUPLICATE');
        numbersInFile.add(number);
      }
      if (parsed.length >= MAX_ROWS) err('title', 'TOO_MANY_ROWS');
      parsed.push({
        row: rowNo,
        number,
        codes: { d: d?.code ?? '', t: t?.code ?? '' },
        dto: {
          title,
          titleEn: get('titleEn') || null,
          disciplineId: d?.id ?? '',
          documentTypeId: t?.id ?? '',
          source,
          originator: get('originator') || null,
          externalNumber: get('externalNumber') || null,
          confidentiality: conf,
          sheetSize: get('sheetSize') || null,
          scale: get('scale') || null,
          ownerId: ownerId ?? null,
          tags: get('tags')
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean)
            .slice(0, 20),
          remarks: get('remarks') || null,
          plans,
        },
      });
    });
    if (numbersInFile.size) {
      const taken = await this.prisma.document.findMany({
        where: { number: { in: [...numbersInFile] } },
        select: { number: true },
      });
      for (const p of parsed) {
        if (p.number && taken.some((x) => x.number === p.number)) {
          errors.push({ field: 'number', column: 'number', row: p.row, code: 'DUPLICATE' });
        }
      }
    }
    if (!parsed.length) errors.push({ field: 'file', row: 2, code: 'NO_ROWS' });
    if (errors.length) {
      throw new Problem('IMPORT_INVALID_ROWS', {
        rule: 'BR-DOC-015',
        errors: errors.sort((a, b) => (a.row ?? 0) - (b.row ?? 0)).slice(0, 500),
      });
    }
    if (dryRun) {
      return {
        dryRun: true,
        count: parsed.length,
        rows: parsed.map((p) => ({ row: p.row, number: p.number ?? null, title: p.dto.title })),
      };
    }
    const created = await this.prisma.$transaction(
      async (tx) => {
        const out: { row: number; number: string | null; title: string }[] = [];
        const client = await tx.client.findUniqueOrThrow({
          where: { id: access.project.clientId },
          select: { code: true },
        });
        for (const p of parsed) {
          const doc = await this.documents.createInTx(tx, projectId, p.dto, user, {
            number: p.number,
          });
          out.push({ row: p.row, number: doc.number, title: p.dto.title });
          if (p.number) {
            // BR-DOC-016: continue the counter after the highest imported number of the same key
            const m = /(\d+)$/.exec(p.number);
            if (m) {
              await this.numbering.raiseTo(
                tx,
                'DOCUMENT',
                {
                  project: access.project.code,
                  client: client.code,
                  discipline: p.codes.d,
                  type: p.codes.t,
                },
                Number(m[1]),
                projectId,
              );
            }
          }
        }
        return out;
      },
      { timeout: 120_000 },
    );
    return { dryRun: false, count: created.length, rows: created };
  }
}
