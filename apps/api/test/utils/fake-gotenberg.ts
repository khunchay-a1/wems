import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import busboy from 'busboy';
import { type Browser, chromium } from 'playwright-core';

const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const toInches = (v: string | undefined, fallback: number): number => {
  if (!v) return fallback;
  const m = /^([\d.]+)\s*(mm|cm|in|px|pt)?$/.exec(v.trim());
  if (!m) return fallback;
  const n = Number(m[1]);
  return { mm: n / 25.4, cm: n / 2.54, in: n, px: n / 96, pt: n / 72 }[(m[2] as 'mm') ?? 'in'] ?? n;
};

/**
 * Implements the subset of Gotenberg's /forms/chromium/convert/html used by WEMS, with real Chromium,
 * so PDF tests run without Docker. CI and local dev use the real Gotenberg container.
 */
export async function startFakeGotenberg(): Promise<{
  url: string;
  requests: number;
  close: () => Promise<void>;
}> {
  const browser: Browser = await chromium.launch({ executablePath: CHROME });
  const state = { requests: 0 };
  const server: Server = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200).end('{"status":"up"}');
      return;
    }
    if (req.method !== 'POST' || req.url !== '/forms/chromium/convert/html') {
      res.writeHead(404).end();
      return;
    }
    state.requests += 1;
    void (async () => {
      const dir = await mkdtemp(join(tmpdir(), 'fake-gotenberg-'));
      const fields: Record<string, string> = {};
      const files: Record<string, Buffer> = {};
      await new Promise<void>((resolve, reject) => {
        const bb = busboy({ headers: req.headers });
        bb.on('file', (_name, stream, info) => {
          const chunks: Buffer[] = [];
          stream.on('data', (c: Buffer) => chunks.push(c));
          stream.on('end', () => (files[info.filename] = Buffer.concat(chunks)));
        });
        bb.on('field', (name, value) => (fields[name] = value));
        bb.on('close', resolve);
        bb.on('error', reject);
        req.pipe(bb);
      });
      for (const [name, content] of Object.entries(files))
        await writeFile(join(dir, name), content);
      const page = await browser.newPage();
      try {
        await page.goto(`file://${join(dir, 'index.html')}`, { waitUntil: 'load' });
        await page.waitForLoadState('networkidle');
        // ensure @font-face fonts are loaded before printing
        await page.waitForFunction('document.fonts.status === "loaded"');
        const header = files['header.html']?.toString('utf8');
        const footer = files['footer.html']?.toString('utf8');
        const pdf = await page.pdf({
          preferCSSPageSize: fields.preferCssPageSize === 'true',
          width: `${toInches(fields.paperWidth, 8.27)}in`,
          height: `${toInches(fields.paperHeight, 11.7)}in`,
          landscape: fields.landscape === 'true',
          printBackground: true,
          displayHeaderFooter: !!(header || footer),
          headerTemplate: header ?? '<span></span>',
          footerTemplate: footer ?? '<span></span>',
          margin: {
            top: `${toInches(fields.marginTop, 0.39)}in`,
            bottom: `${toInches(fields.marginBottom, 0.39)}in`,
            left: `${toInches(fields.marginLeft, 0.39)}in`,
            right: `${toInches(fields.marginRight, 0.39)}in`,
          },
        });
        res.writeHead(200, { 'Content-Type': 'application/pdf' }).end(pdf);
      } catch (err) {
        res.writeHead(500).end(String(err));
      } finally {
        await page.close();
        await rm(dir, { recursive: true, force: true });
      }
    })();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    get requests() {
      return state.requests;
    },
    close: async () => {
      await new Promise<void>((r) => server.close(() => r()));
      await browser.close();
    },
  };
}
