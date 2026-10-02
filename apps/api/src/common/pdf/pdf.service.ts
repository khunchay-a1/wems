import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import Handlebars from 'handlebars';
import { TEMPLATES_DIR } from '../notifications/mailer.service';
import { GotenbergClient } from './gotenberg.client';

const FONT_FILES = ['Sarabun-Regular.ttf', 'Sarabun-Bold.ttf'];

export interface PdfRenderOptions {
  locale?: 'th' | 'en';
  landscape?: boolean;
  /** Latin text left of the page number in the footer, e.g. "TR-P26-001-001" */
  footerLeft?: string;
  /** Latin header text on every page (e.g. document number) */
  headerText?: string;
}

/**
 * Renders Handlebars templates in apps/api/templates/pdf to PDF (docs/02-architecture.md §8):
 * Sarabun embedded (never system fonts), header/footer with "page X / Y".
 */
@Injectable()
export class PdfService {
  private readonly fonts: { name: string; content: Buffer }[];
  private readonly compiled = new Map<string, Handlebars.TemplateDelegate>();
  private readonly hbs = Handlebars.create();

  constructor(private readonly gotenberg: GotenbergClient) {
    this.fonts = FONT_FILES.map((name) => ({
      name,
      content: readFileSync(join(TEMPLATES_DIR, 'fonts', name)),
    }));
    this.hbs.registerHelper('inc', (n: number) => n + 1);
    this.hbs.registerHelper('eq', (a: unknown, b: unknown) => a === b);
    this.hbs.registerPartial(
      'styles',
      readFileSync(join(TEMPLATES_DIR, 'pdf', 'partials', 'styles.hbs'), 'utf8'),
    );
  }

  private template(name: string): Handlebars.TemplateDelegate {
    let t = this.compiled.get(name);
    if (!t) {
      t = this.hbs.compile(readFileSync(join(TEMPLATES_DIR, 'pdf', `${name}.hbs`), 'utf8'));
      this.compiled.set(name, t);
    }
    return t;
  }

  /** HTML only (useful for previews and tests). */
  html(name: string, data: Record<string, unknown>, opts: PdfRenderOptions = {}): string {
    return this.template(name)({ ...data, lang: opts.locale ?? 'th' });
  }

  async render(
    name: string,
    data: Record<string, unknown>,
    opts: PdfRenderOptions = {},
  ): Promise<Buffer> {
    // Chromium renders header/footer templates without waiting for web fonts, so they use system
    // fonts and Latin text only (document number + "page / total"); Thai headings go in the body.
    const footerHtml = `<html><head><style>
      body{margin:0;font-family:Arial,Helvetica,sans-serif;font-size:7.5pt;color:#555;width:100%;}
      .row{display:flex;justify-content:space-between;padding:0 15mm;width:100%;box-sizing:border-box;}
    </style></head><body><div class="row"><span>${escapeHtml(asciiOnly(opts.footerLeft ?? ''))}</span>
      <span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div></body></html>`;
    const headerHtml = opts.headerText
      ? `<html><head><style>body{margin:0;font-family:Arial,Helvetica,sans-serif;font-size:7.5pt;color:#555;}
        .row{padding:0 15mm;width:100%;box-sizing:border-box;}</style></head><body><div class="row">${escapeHtml(asciiOnly(opts.headerText))}</div></body></html>`
      : '<html><body></body></html>';
    return this.gotenberg.convertHtml({
      html: this.html(name, data, opts),
      headerHtml,
      footerHtml,
      assets: this.fonts.map((f) => ({ ...f, type: 'font/ttf' })),
      landscape: opts.landscape,
      margins: { top: '16mm', bottom: '16mm', left: '15mm', right: '15mm' },
    });
  }

  /** A single-page PDF sized to its content — used to stamp Thai text onto drawings (pdf-lib cannot shape Thai). */
  async renderSnippet(html: string, widthMm: number, heightMm: number): Promise<Buffer> {
    const doc = `<!doctype html><html><head><meta charset="utf-8"><style>
      @font-face{font-family:'Sarabun';src:url('Sarabun-Bold.ttf');font-weight:700;}
      @font-face{font-family:'Sarabun';src:url('Sarabun-Regular.ttf');font-weight:400;}
      @page{size:${widthMm}mm ${heightMm}mm;margin:0;}
      html,body{margin:0;padding:0;background:transparent;font-family:'Sarabun',sans-serif;}
    </style></head><body>${html}</body></html>`;
    return this.gotenberg.convertHtml({
      html: doc,
      assets: this.fonts.map((f) => ({ ...f, type: 'font/ttf' })),
      margins: { top: '0', bottom: '0', left: '0', right: '0' },
      preferCssPageSize: true,
    });
  }
}

function asciiOnly(s: string): string {
  return s.replace(/[^\x20-\x7e]/g, '');
}

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
