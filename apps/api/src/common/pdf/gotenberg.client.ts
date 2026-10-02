import { Injectable, type OnModuleInit } from '@nestjs/common';
import { AppConfig } from '../config/app-config';
import { HealthIndicator, HealthService } from '../health/health.service';

export interface GotenbergRequest {
  html: string;
  headerHtml?: string;
  footerHtml?: string;
  /** Extra files referenced relatively from index.html (fonts, images) */
  assets?: { name: string; content: Buffer; type?: string }[];
  /** Inches; default A4 */
  paperWidth?: number;
  paperHeight?: number;
  /** e.g. "18mm" */
  margins?: { top: string; bottom: string; left: string; right: string };
  landscape?: boolean;
  /** Use the CSS @page size instead of paperWidth/Height (stamp snippets) */
  preferCssPageSize?: boolean;
}

/** HTML → PDF with Chromium via Gotenberg (ADR-0003: correct Thai line breaking). */
@Injectable()
export class GotenbergClient implements OnModuleInit {
  constructor(
    private readonly config: AppConfig,
    private readonly health: HealthService,
  ) {}

  onModuleInit(): void {
    const url = this.config.env.GOTENBERG_URL;
    this.health.register(
      new (class extends HealthIndicator {
        readonly name = 'pdf';
        async check(): Promise<boolean> {
          return (await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) })).ok;
        }
      })(),
    );
  }

  async convertHtml(req: GotenbergRequest): Promise<Buffer> {
    const form = new FormData();
    const add = (name: string, content: string | Buffer, type: string) =>
      form.append(
        'files',
        new Blob([typeof content === 'string' ? content : new Uint8Array(content)], { type }),
        name,
      );
    add('index.html', req.html, 'text/html');
    if (req.headerHtml) add('header.html', req.headerHtml, 'text/html');
    if (req.footerHtml) add('footer.html', req.footerHtml, 'text/html');
    for (const a of req.assets ?? []) add(a.name, a.content, a.type ?? 'application/octet-stream');
    form.append('paperWidth', String(req.paperWidth ?? 8.27));
    form.append('paperHeight', String(req.paperHeight ?? 11.7));
    const m = req.margins ?? { top: '18mm', bottom: '18mm', left: '15mm', right: '15mm' };
    form.append('marginTop', m.top);
    form.append('marginBottom', m.bottom);
    form.append('marginLeft', m.left);
    form.append('marginRight', m.right);
    form.append('printBackground', 'true');
    form.append('landscape', String(!!req.landscape));
    form.append('preferCssPageSize', String(!!req.preferCssPageSize));
    const res = await fetch(`${this.config.env.GOTENBERG_URL}/forms/chromium/convert/html`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`Gotenberg ${res.status}: ${(await res.text()).slice(0, 500)}`);
    return Buffer.from(await res.arrayBuffer());
  }
}
