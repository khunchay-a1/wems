import type { IncomingMessage, ServerResponse } from 'node:http';
import { Global, Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { AppConfig } from '../config/app-config';
import { ConfigModule } from '../config/config.module';
import { pickRequestId } from '../http/request-context';
import { uuidv7 } from '../ids/uuid';

/** pino JSON logs + request id (docs/09-nfr.md); never logs secrets (docs/06-security.md §7). */
@Global()
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [AppConfig],
      useFactory: ({ env }: AppConfig) => ({
        pinoHttp: {
          level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
          genReqId: (req: IncomingMessage, res: ServerResponse) => {
            const id = pickRequestId(req.headers['x-request-id'], uuidv7);
            res.setHeader('X-Request-Id', id);
            return id;
          },
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers["x-csrf-token"]',
              'res.headers["set-cookie"]',
              'req.body.password',
              'req.body.currentPassword',
              'req.body.newPassword',
              'req.body.refreshToken',
            ],
            censor: '[redacted]',
          },
          customProps: () => ({ app: 'wems-api' }),
          autoLogging: { ignore: (req) => (req.url ?? '').includes('/health/') },
          transport:
            env.NODE_ENV === 'development'
              ? {
                  target: 'pino-pretty',
                  options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' },
                }
              : undefined,
        },
      }),
    }),
  ],
})
export class LoggerModule {}
