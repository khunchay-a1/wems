import { Global, Module } from '@nestjs/common';
import { RealtimeHub } from './realtime.hub';
import { RealtimePublisher } from './realtime.publisher';

/** Publisher only — used by the worker. */
@Global()
@Module({ providers: [RealtimePublisher], exports: [RealtimePublisher] })
export class RealtimeModule {}

/** Publisher + SSE hub — used by the HTTP API. */
@Global()
@Module({ providers: [RealtimePublisher, RealtimeHub], exports: [RealtimePublisher, RealtimeHub] })
export class RealtimeApiModule {}
