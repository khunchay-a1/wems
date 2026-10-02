import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import Handlebars from 'handlebars';
import { createTransport, type Transporter } from 'nodemailer';
import { AppConfig } from '../config/app-config';
import type { Locale } from '../i18n/locale';

export interface MailAttachment {
  filename: string;
  /** base64 content (job payloads must be JSON) or a presigned URL to fetch */
  contentBase64?: string;
  path?: string;
  contentType?: string;
}

export interface MailJob {
  to: string[];
  cc?: string[];
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  attachments?: MailAttachment[];
}

/** apps/api/templates (works from src/ and dist/) */
export const TEMPLATES_DIR = join(__dirname, '..', '..', '..', 'templates');

/** SMTP via Nodemailer (Mailpit in dev) + Handlebars layouts in th/en (M01 §6). */
@Injectable()
export class MailerService implements OnModuleDestroy {
  private readonly logger = new Logger(MailerService.name);
  private transporter?: Transporter;
  private layoutHtml?: Handlebars.TemplateDelegate;
  private layoutText?: Handlebars.TemplateDelegate;

  constructor(private readonly config: AppConfig) {}

  onModuleDestroy(): void {
    this.transporter?.close();
  }

  private transport(): Transporter {
    const env = this.config.env;
    this.transporter ??= createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      tls: { rejectUnauthorized: this.config.isProduction },
    });
    return this.transporter;
  }

  /** Renders the shared layout. Lines are escaped by Handlebars. */
  render(input: {
    locale: Locale;
    title: string;
    lines: string[];
    actionUrl?: string;
    actionLabel?: string;
    companyName: string;
  }): { html: string; text: string } {
    this.layoutHtml ??= Handlebars.compile(
      readFileSync(join(TEMPLATES_DIR, 'mail', 'layout.html.hbs'), 'utf8'),
    );
    this.layoutText ??= Handlebars.compile(
      readFileSync(join(TEMPLATES_DIR, 'mail', 'layout.text.hbs'), 'utf8'),
    );
    const ctx = {
      ...input,
      footer:
        input.locale === 'en'
          ? 'This message was sent automatically by WEMS. Please do not reply.'
          : 'อีเมลนี้ส่งอัตโนมัติจากระบบ WEMS กรุณาอย่าตอบกลับ',
      lang: input.locale,
    };
    return { html: this.layoutHtml(ctx), text: this.layoutText(ctx) };
  }

  async send(job: MailJob): Promise<void> {
    await this.transport().sendMail({
      from: this.config.env.MAIL_FROM,
      to: job.to,
      cc: job.cc,
      replyTo: job.replyTo,
      subject: job.subject,
      html: job.html,
      text: job.text,
      attachments: job.attachments?.map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        ...(a.contentBase64
          ? { content: Buffer.from(a.contentBase64, 'base64') }
          : { path: a.path }),
      })),
    });
    this.logger.debug(`mail sent to ${job.to.length} recipient(s): ${job.subject}`);
  }
}
