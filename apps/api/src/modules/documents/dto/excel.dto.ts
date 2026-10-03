import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsUUID } from 'class-validator';

export class ImportRequestDto {
  @ApiProperty({ format: 'uuid', description: 'Uploaded .xlsx (purpose IMPORT)' })
  @IsUUID()
  fileId!: string;
  @ApiProperty({ description: 'true = validate only (BR-DOC-015)' }) @IsBoolean() dryRun!: boolean;
}

export class ImportRowDto {
  @ApiProperty() row!: number;
  @ApiProperty({ nullable: true, type: String }) number!: string | null;
  @ApiProperty() title!: string;
}

export class ImportResultDto {
  @ApiProperty() dryRun!: boolean;
  @ApiProperty() count!: number;
  @ApiProperty({ type: [ImportRowDto] }) rows!: ImportRowDto[];
}
