import { applyDecorators, type Type as ClassType } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Problem } from '../errors/problem';

/** Standard list query (docs/04-api-conventions.md §6). */
export class PageQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional({
    description: 'Comma separated, "-" prefix = descending, e.g. "-updatedAt,number"',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  sort?: string;

  @ApiPropertyOptional({ description: 'Search text' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}

export class PageMetaDto {
  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;

  @ApiProperty()
  total!: number;
}

export interface Page<T> {
  data: T[];
  meta: PageMetaDto;
}

export function pageArgs(q: PageQueryDto): {
  skip: number;
  take: number;
  page: number;
  pageSize: number;
} {
  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 25;
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

/**
 * Parses `sort` against an allowlist and returns Prisma orderBy entries.
 * Unknown fields → 400 VALIDATION_FAILED (field "sort").
 */
export function parseSort<F extends string>(
  sort: string | undefined,
  allowed: readonly F[],
  fallback: { field: F; dir: 'asc' | 'desc' }[],
): { field: F; dir: 'asc' | 'desc' }[] {
  if (!sort) return fallback;
  const out: { field: F; dir: 'asc' | 'desc' }[] = [];
  for (const raw of sort
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const desc = raw.startsWith('-');
    const field = (desc ? raw.slice(1) : raw) as F;
    if (!allowed.includes(field)) {
      throw new Problem('VALIDATION_FAILED', {
        errors: [{ field: 'sort', code: 'NOT_ALLOWED', message: field }],
      });
    }
    out.push({ field, dir: desc ? 'desc' : 'asc' });
  }
  return out.length ? out : fallback;
}

/** Splits "A,B" filter values (docs/04-api-conventions.md §6). */
export function csv(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const parts = value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  return parts.length ? parts : undefined;
}

/** OpenAPI for `{ data: T[], meta }`. */
export function ApiPaginatedResponse<T extends ClassType<unknown>>(model: T): MethodDecorator {
  return applyDecorators(
    ApiExtraModels(PageMetaDto, model),
    ApiOkResponse({
      schema: {
        type: 'object',
        required: ['data', 'meta'],
        properties: {
          data: { type: 'array', items: { $ref: getSchemaPath(model) } },
          meta: { $ref: getSchemaPath(PageMetaDto) },
        },
      },
    }),
  );
}
