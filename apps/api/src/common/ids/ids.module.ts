import { Global, Module } from '@nestjs/common';
import { ClockService } from '../time/clock';
import { IdGenerator } from './id-generator';

@Global()
@Module({ providers: [ClockService, IdGenerator], exports: [ClockService, IdGenerator] })
export class CoreModule {}
