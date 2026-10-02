import { createSign } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { ClockService } from '../time/clock';

export interface PushMessage {
  title: string;
  body: string;
  data: Record<string, string>;
}

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

/**
 * Firebase Cloud Messaging HTTP v1 (no SDK). Without FCM_CREDENTIALS_JSON it runs as a stub that
 * records messages (dev/test) — docs/02-architecture.md §2.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly account?: ServiceAccount;
  private token?: { value: string; expiresAt: number };
  /** Messages captured in stub mode */
  readonly sent: { token: string; message: PushMessage }[] = [];

  constructor(
    config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {
    if (config.env.FCM_CREDENTIALS_JSON)
      this.account = JSON.parse(config.env.FCM_CREDENTIALS_JSON) as ServiceAccount;
  }

  get isStub(): boolean {
    return !this.account;
  }

  async sendToUser(userId: string, message: PushMessage): Promise<void> {
    const devices = await this.prisma.pushDevice.findMany({ where: { userId, disabledAt: null } });
    for (const d of devices) await this.sendToToken(d.fcmToken, message);
  }

  private async sendToToken(token: string, message: PushMessage): Promise<void> {
    if (!this.account) {
      this.sent.push({ token, message });
      return;
    }
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${this.account.project_id}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await this.accessToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: message.title, body: message.body },
            data: message.data,
            android: { priority: 'HIGH' },
            apns: { payload: { aps: { sound: 'default' } } },
          },
        }),
      },
    );
    if (res.status === 404 || res.status === 400) {
      const text = await res.text();
      if (/UNREGISTERED|INVALID_ARGUMENT/.test(text)) {
        await this.prisma.pushDevice.updateMany({
          where: { fcmToken: token },
          data: { disabledAt: this.clock.now() },
        });
        return;
      }
    }
    if (!res.ok) throw new Error(`FCM ${res.status}: ${await res.text()}`);
  }

  private async accessToken(): Promise<string> {
    const nowSec = Math.floor(this.clock.now().getTime() / 1000);
    if (this.token && this.token.expiresAt > nowSec + 60) return this.token.value;
    const acc = this.account!;
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const claims = Buffer.from(
      JSON.stringify({
        iss: acc.client_email,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        iat: nowSec,
        exp: nowSec + 3600,
      }),
    ).toString('base64url');
    const signature = createSign('RSA-SHA256')
      .update(`${header}.${claims}`)
      .sign(acc.private_key, 'base64url');
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${header}.${claims}.${signature}`,
      }),
    });
    if (!res.ok) throw new Error(`FCM auth ${res.status}`);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: body.access_token, expiresAt: nowSec + body.expires_in };
    this.logger.debug('FCM access token refreshed');
    return body.access_token;
  }
}
