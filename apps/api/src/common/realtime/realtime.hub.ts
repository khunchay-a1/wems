import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { interval, map, merge, Observable, Subject, finalize } from 'rxjs';
import type { AuthUser } from '../auth/auth-user';
import { ProjectAccessService } from '../auth/project-access.service';
import { AppConfig } from '../config/app-config';
import { createRedis } from '../queue/redis';
import { REALTIME_CHANNEL, type RealtimeMessage } from './realtime.publisher';

export interface SseEvent {
  type: string;
  data: Record<string, unknown>;
}

interface Connection {
  userId: string;
  projects: Set<string> | 'ALL';
  subject: Subject<SseEvent>;
}

const HEARTBEAT_MS = 25_000;

/** One Redis subscriber per API instance; fans messages out to this instance's SSE clients. */
@Injectable()
export class RealtimeHub implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeHub.name);
  private subscriber?: Redis;
  private readonly connections = new Set<Connection>();

  constructor(
    private readonly config: AppConfig,
    private readonly access: ProjectAccessService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.subscriber = createRedis(this.config.env.REDIS_URL);
    await this.subscriber.subscribe(REALTIME_CHANNEL);
    this.subscriber.on('message', (_channel: string, raw: string) => this.deliver(raw));
  }

  async onModuleDestroy(): Promise<void> {
    for (const c of this.connections) c.subject.complete();
    await this.subscriber?.quit().catch(() => undefined);
  }

  get size(): number {
    return this.connections.size;
  }

  private deliver(raw: string): void {
    let msg: RealtimeMessage;
    try {
      msg = JSON.parse(raw) as RealtimeMessage;
    } catch {
      return;
    }
    for (const c of this.connections) {
      const forUser = msg.userIds?.includes(c.userId);
      const forProject = !!msg.projectId && (c.projects === 'ALL' || c.projects.has(msg.projectId));
      if (forUser || forProject) c.subject.next({ type: msg.event, data: msg.data });
    }
  }

  async connect(user: AuthUser): Promise<Observable<SseEvent>> {
    const visible = await this.access.visibleProjectIds(user);
    const conn: Connection = {
      userId: user.id,
      projects: visible === 'ALL' ? 'ALL' : new Set(visible),
      subject: new Subject<SseEvent>(),
    };
    this.connections.add(conn);
    this.logger.debug(`SSE connected (${this.connections.size})`);
    const heartbeat = interval(HEARTBEAT_MS).pipe(
      map((): SseEvent => ({ type: 'heartbeat', data: {} })),
    );
    return merge(conn.subject.asObservable(), heartbeat).pipe(
      finalize(() => {
        this.connections.delete(conn);
        conn.subject.complete();
      }),
    );
  }
}
