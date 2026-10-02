import { checkPasswordPolicy, hashSecret, verifySecret } from './password';

describe('password policy (docs/06-security.md §2.1)', () => {
  it('rejects passwords shorter than 12 characters', () => {
    expect(checkPasswordPolicy('Short1!')).toBe('TOO_SHORT');
  });

  it('rejects passwords equal to the email or name', () => {
    expect(checkPasswordPolicy('somchai.j@example.com', { email: 'somchai.j@example.com' })).toBe(
      'MATCHES_IDENTITY',
    );
    expect(checkPasswordPolicy('somchaijaidee', { names: ['Somchai Jaidee'] })).toBe(
      'MATCHES_IDENTITY',
    );
  });

  it('rejects common passwords even with trailing digits', () => {
    expect(checkPasswordPolicy('password12345678')).toBe('TOO_COMMON');
    expect(checkPasswordPolicy('aaaaaaaaaaaaaa')).toBe('TOO_COMMON');
  });

  it('accepts a long uncommon passphrase', () => {
    expect(checkPasswordPolicy('น้ำใส ถังตกตะกอน 2569', { email: 'a@b.co' })).toBeNull();
    expect(checkPasswordPolicy('correct horse battery staple')).toBeNull();
  });

  it('hashes with argon2id and verifies', async () => {
    const hash = await hashSecret('correct horse battery staple');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=65536,p=1,t=3\$/);
    await expect(verifySecret(hash, 'correct horse battery staple')).resolves.toBe(true);
    await expect(verifySecret(hash, 'wrong')).resolves.toBe(false);
    await expect(verifySecret(null, 'x')).resolves.toBe(false);
  });
});
