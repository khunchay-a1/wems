import type { AddressInfo } from 'node:net';
import { simpleParser } from 'mailparser';
import { SMTPServer } from 'smtp-server';

export interface CapturedMail {
  to: string[];
  subject: string;
  text: string;
  html: string;
  attachments: { filename?: string; size: number; contentType: string }[];
}

/** In-process SMTP server standing in for Mailpit in tests. */
export async function startSmtpSink(): Promise<{
  port: number;
  mails: CapturedMail[];
  close: () => Promise<void>;
}> {
  const mails: CapturedMail[] = [];
  const server = new SMTPServer({
    authOptional: true,
    disabledCommands: ['STARTTLS'],
    onData(stream, _session, cb) {
      simpleParser(stream)
        .then((m) => {
          const to = ([] as { value: { address?: string }[] }[])
            .concat((m.to as never) ?? [])
            .flatMap((a) => a.value.map((v) => v.address ?? ''));
          mails.push({
            to,
            subject: m.subject ?? '',
            text: m.text ?? '',
            html: typeof m.html === 'string' ? m.html : '',
            attachments: m.attachments.map((a) => ({
              filename: a.filename,
              size: a.size,
              contentType: a.contentType,
            })),
          });
          cb();
        })
        .catch(cb);
    },
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.server.address() as AddressInfo).port;
  return { port, mails, close: () => new Promise((r) => server.close(() => r())) };
}

export async function waitFor<T>(fn: () => T | undefined | false, timeoutMs = 8000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 50));
  }
}
