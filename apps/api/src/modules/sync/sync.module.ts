import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

/** Mobile pull sync (docs/08-mobile.md §5.1). */
@Module({
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
