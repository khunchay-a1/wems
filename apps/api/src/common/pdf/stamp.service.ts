import { Injectable } from '@nestjs/common';
import { degrees, PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { escapeHtml, PdfService } from './pdf.service';

export type StampSpec =
  | { kind: 'watermark'; text: string; color: 'grey' | 'red' }
  | { kind: 'box'; lines: string[]; color: 'blue' | 'green' | 'orange' };

const COLORS = {
  grey: rgb(0.45, 0.45, 0.45),
  red: rgb(0.8, 0.1, 0.1),
  blue: rgb(0.04, 0.36, 0.48),
  green: rgb(0.1, 0.5, 0.2),
  orange: rgb(0.85, 0.45, 0.05),
};
const HEX = {
  grey: '#737373',
  red: '#cc1a1a',
  blue: '#0b5c7a',
  green: '#1a8033',
  orange: '#d97306',
};

const isLatin1 = (s: string) => /^[\x20-\x7e\u00a0-\u00ff\u2013\u00b7]*$/.test(s);

/**
 * Status stamps on PDF renditions at download time (BR-DOC-070) without touching the original.
 * Latin text is drawn with pdf-lib; Thai text is rendered by Chromium as a tiny PDF and embedded.
 */
@Injectable()
export class StampService {
  constructor(private readonly pdf: PdfService) {}

  async stamp(original: Buffer, spec: StampSpec): Promise<Buffer> {
    const doc = await PDFDocument.load(original, { ignoreEncryption: true, updateMetadata: false });
    const pages = doc.getPages();
    if (spec.kind === 'watermark') {
      if (isLatin1(spec.text)) {
        const font = await doc.embedFont(StandardFonts.HelveticaBold);
        for (const page of pages) {
          const { width, height } = page.getSize();
          const size = Math.min(width, height) / 12;
          const textWidth = font.widthOfTextAtSize(spec.text, size);
          const angle = Math.atan2(height, width);
          page.drawText(spec.text, {
            x: width / 2 - (Math.cos(angle) * textWidth) / 2,
            y: height / 2 - (Math.sin(angle) * textWidth) / 2,
            size,
            font,
            color: COLORS[spec.color],
            opacity: 0.25,
            rotate: degrees((angle * 180) / Math.PI),
          });
        }
      } else {
        const snippet = await this.pdf.renderSnippet(
          `<div style="font-weight:700;font-size:28pt;color:${HEX[spec.color]};white-space:nowrap;padding:2mm 4mm;">${escapeHtml(spec.text)}</div>`,
          190,
          18,
        );
        const [embedded] = await doc.embedPdf(snippet);
        for (const page of pages) {
          const { width, height } = page.getSize();
          const angle = Math.atan2(height, width);
          const scale = (Math.hypot(width, height) * 0.7) / embedded!.width;
          const w = embedded!.width * scale;
          const h = embedded!.height * scale;
          page.drawPage(embedded!, {
            x: width / 2 - (Math.cos(angle) * w - Math.sin(angle) * h) / 2,
            y: height / 2 - (Math.sin(angle) * w + Math.cos(angle) * h) / 2,
            xScale: scale,
            yScale: scale,
            rotate: degrees((angle * 180) / Math.PI),
            opacity: 0.3,
          });
        }
      }
    } else {
      const allLatin = spec.lines.every(isLatin1);
      if (allLatin) {
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);
        const regular = await doc.embedFont(StandardFonts.Helvetica);
        for (const page of pages) {
          const { width } = page.getSize();
          const size = 8;
          const lineH = size * 1.35;
          const boxW =
            Math.max(
              ...spec.lines.map((l, i) => (i === 0 ? bold : regular).widthOfTextAtSize(l, size)),
            ) + 12;
          const boxH = spec.lines.length * lineH + 8;
          const x = width - boxW - 18;
          const y = 18;
          page.drawRectangle({
            x,
            y,
            width: boxW,
            height: boxH,
            color: rgb(1, 1, 1),
            opacity: 0.85,
            borderColor: COLORS[spec.color],
            borderWidth: 1.2,
          });
          spec.lines.forEach((line, i) => {
            page.drawText(line, {
              x: x + 6,
              y: y + boxH - 6 - (i + 1) * lineH + 3,
              size,
              font: i === 0 ? bold : regular,
              color: COLORS[spec.color],
            });
          });
        }
      } else {
        const html = `<div style="border:1.2pt solid ${HEX[spec.color]};background:#fff;color:${HEX[spec.color]};padding:2mm 3mm;font-size:8pt;line-height:1.35;">${spec.lines
          .map((l, i) => `<div style="font-weight:${i === 0 ? 700 : 400}">${escapeHtml(l)}</div>`)
          .join('')}</div>`;
        const snippet = await this.pdf.renderSnippet(html, 95, 6 + spec.lines.length * 4.5);
        const [embedded] = await doc.embedPdf(snippet);
        for (const page of pages) {
          const { width } = page.getSize();
          page.drawPage(embedded!, { x: width - embedded!.width - 18, y: 18 });
        }
      }
    }
    return Buffer.from(await doc.save());
  }
}
