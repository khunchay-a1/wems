import { Controller, Get, HttpCode } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator';
import { Op } from '../openapi/op.decorator';
import { HealthService } from './health.service';
import { HealthDto } from './health.dto';

@ApiTags('Health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  @HttpCode(200)
  @Op('Health', 'getLive', 'Process liveness')
  @ApiOkResponse({ type: HealthDto })
  live(): HealthDto {
    return { status: 'ok', checks: {} };
  }

  @Get('ready')
  @Op('Health', 'getReady', 'Readiness of database, Redis and object storage')
  @ApiOkResponse({ type: HealthDto })
  ready(): Promise<HealthDto> {
    return this.health.readiness();
  }
}
