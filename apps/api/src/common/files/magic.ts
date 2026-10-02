/**
 * Magic-byte detection (docs/06-security.md §6): the content must match the declared extension.
 * Returns the detected family; `matchesExtension` decides acceptance.
 */
export type Detected =
  | 'pdf'
  | 'png'
  | 'jpeg'
  | 'heic'
  | 'zip' // also docx/xlsx/pptx (OOXML)
  | 'ole' // doc/xls/rvt (OLE compound file)
  | 'dwg'
  | 'ifc'
  | 'text'
  | 'exe'
  | 'unknown';

export function detect(head: Buffer): Detected {
  const s = (n: number) => head.subarray(0, n).toString('latin1');
  if (s(5) === '%PDF-') return 'pdf';
  if (
    head.length >= 8 &&
    head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'png';
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg';
  if (s(2) === 'MZ' || s(4) === '\x7fELF') return 'exe';
  if (
    head.length >= 12 &&
    head.subarray(4, 8).toString('latin1') === 'ftyp' &&
    /^(heic|heix|mif1|msf1|heim|heis|hevc)$/.test(head.subarray(8, 12).toString('latin1'))
  ) {
    return 'heic';
  }
  if (
    head[0] === 0x50 &&
    head[1] === 0x4b &&
    (head[2] === 0x03 || head[2] === 0x05 || head[2] === 0x07)
  )
    return 'zip';
  if (
    head.length >= 8 &&
    head.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))
  )
    return 'ole';
  if (/^AC10\d\d/.test(s(6))) return 'dwg';
  if (s(13) === 'ISO-10303-21;') return 'ifc';
  if (looksLikeText(head)) return 'text';
  return 'unknown';
}

function looksLikeText(head: Buffer): boolean {
  if (!head.length) return false;
  const sample = head.subarray(0, Math.min(head.length, 4096));
  let control = 0;
  for (const b of sample) {
    if (b === 0) return false;
    if (b < 0x09 || (b > 0x0d && b < 0x20)) control += 1;
  }
  return control / sample.length < 0.02;
}

const EXPECTED: Record<string, Detected[]> = {
  pdf: ['pdf'],
  png: ['png'],
  jpg: ['jpeg'],
  jpeg: ['jpeg'],
  heic: ['heic'],
  docx: ['zip'],
  xlsx: ['zip'],
  pptx: ['zip'],
  zip: ['zip'],
  doc: ['ole'],
  xls: ['ole'],
  rvt: ['ole'],
  dwg: ['dwg'],
  ifc: ['ifc'],
  dxf: ['text'],
  csv: ['text'],
};

export function matchesExtension(ext: string, detected: Detected): boolean {
  return (EXPECTED[ext] ?? []).includes(detected);
}

export function mimeFor(detected: Detected, ext: string): string {
  switch (detected) {
    case 'pdf':
      return 'application/pdf';
    case 'png':
      return 'image/png';
    case 'jpeg':
      return 'image/jpeg';
    case 'heic':
      return 'image/heic';
    default:
      return (
        {
          docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          zip: 'application/zip',
          doc: 'application/msword',
          xls: 'application/vnd.ms-excel',
          csv: 'text/csv',
          dwg: 'image/vnd.dwg',
          dxf: 'image/vnd.dxf',
          ifc: 'application/x-step',
          rvt: 'application/octet-stream',
        }[ext] ?? 'application/octet-stream'
      );
  }
}
