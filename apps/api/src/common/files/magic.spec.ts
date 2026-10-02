import { contentDisposition, sanitizeFileName, storageKey } from './file-purposes';
import { detect, matchesExtension } from './magic';

describe('file type detection (docs/06-security.md §6)', () => {
  it('AT-PLT-05 an .exe renamed to .pdf is detected as exe and rejected', () => {
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100, 0x90)]);
    expect(detect(exe)).toBe('exe');
    expect(matchesExtension('pdf', detect(exe))).toBe(false);
  });

  it('accepts real signatures', () => {
    expect(matchesExtension('pdf', detect(Buffer.from('%PDF-1.7\n...')))).toBe(true);
    expect(matchesExtension('docx', detect(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0])))).toBe(
      true,
    );
    expect(matchesExtension('dwg', detect(Buffer.from('AC1032\0\0\0')))).toBe(true);
    expect(matchesExtension('csv', detect(Buffer.from('number,title\nP26-001,แผนผัง\n')))).toBe(
      true,
    );
    expect(
      matchesExtension(
        'png',
        detect(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])),
      ),
    ).toBe(true);
    expect(
      matchesExtension(
        'xls',
        detect(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])),
      ),
    ).toBe(true);
  });

  it('builds safe storage keys and Thai-friendly Content-Disposition', () => {
    expect(sanitizeFileName('../../แบบ ถังตกตะกอน Rev.A?.pdf')).toBe('แบบ_ถังตกตะกอน_Rev.A.pdf');
    const key = storageKey('dev', new Date('2026-09-28T00:00:00Z'), 'f1', 'a b.dwg');
    expect(key).toBe('dev/2026/09/f1/a_b.dwg');
    expect(contentDisposition('แบบ.pdf', true)).toBe(
      `inline; filename="_.pdf"; filename*=UTF-8''${encodeURIComponent('แบบ.pdf')}`,
    );
  });
});
