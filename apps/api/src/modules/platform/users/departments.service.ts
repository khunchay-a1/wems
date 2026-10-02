import { Injectable } from '@nestjs/common';
import { AuditService, diffFields } from '../../../common/audit/audit.service';
import { Problem } from '../../../common/errors/problem';
import { IdGenerator } from '../../../common/ids/id-generator';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { CreateDepartmentDto, DepartmentDto, UpdateDepartmentDto } from './dto/users.dto';
import { toDepartmentDto } from './users.mapper';

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ids: IdGenerator,
  ) {}

  async list(): Promise<DepartmentDto[]> {
    return (await this.prisma.department.findMany({ orderBy: { code: 'asc' } })).map(
      toDepartmentDto,
    );
  }

  async create(dto: CreateDepartmentDto): Promise<DepartmentDto> {
    const id = this.ids.next();
    return this.prisma.$transaction(async (tx) => {
      if (await tx.department.findUnique({ where: { code: dto.code } })) {
        throw new Problem('DUPLICATE', { errors: [{ field: 'code', code: 'DUPLICATE' }] });
      }
      const d = await tx.department.create({
        data: { id, code: dto.code, nameTh: dto.nameTh, nameEn: dto.nameEn ?? null },
      });
      await this.audit.record(tx, {
        action: 'department.create',
        entityType: 'Department',
        entityId: id,
        summary: dto.code,
      });
      return toDepartmentDto(d);
    });
  }

  async update(id: string, dto: UpdateDepartmentDto): Promise<DepartmentDto> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.department.findUnique({ where: { id } });
      if (!before) throw new Problem('NOT_FOUND');
      const d = await tx.department.update({ where: { id }, data: { ...dto } });
      await this.audit.record(tx, {
        action: 'department.update',
        entityType: 'Department',
        entityId: id,
        changes: diffFields(before, { ...dto }),
      });
      return toDepartmentDto(d);
    });
  }
}
