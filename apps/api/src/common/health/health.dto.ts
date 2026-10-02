import { ApiProperty } from '@nestjs/swagger';

export class HealthDto {
  @ApiProperty({ enum: ['ok', 'degraded'] })
  status!: 'ok' | 'degraded';

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string', enum: ['up', 'down', 'skipped'] },
  })
  checks!: Record<string, 'up' | 'down' | 'skipped'>;
}
