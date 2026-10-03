// Copies the pdf.js worker, standard fonts and CMaps next to the app so PdfViewer loads them from
// the same origin (no CDN; CSP-friendly). Runs before `next dev` / `next build`.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const pkg = dirname(require.resolve('pdfjs-dist/package.json'));
const out = join(here, '..', 'public', 'pdfjs');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
// legacy build: polyfills newer JS (e.g. Map.getOrInsertComputed) for browsers of 2025–2026
cpSync(join(pkg, 'legacy', 'build', 'pdf.worker.min.mjs'), join(out, 'pdf.worker.min.mjs'));
cpSync(join(pkg, 'standard_fonts'), join(out, 'standard_fonts'), { recursive: true });
cpSync(join(pkg, 'cmaps'), join(out, 'cmaps'), { recursive: true });
