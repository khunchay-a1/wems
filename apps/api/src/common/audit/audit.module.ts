import { Global, Module } from '@nestjs/common';
import { OutboxService } from '../outbox/outbox.service';
import { AuditService } from './audit.service';
import { ChangeLogService } from './change-log.service';

@Global()
@Module({
  providers: [AuditService, ChangeLogService, OutboxService],
  exports: [AuditService, ChangeLogService, OutboxService],
})
export class AuditModule {}
