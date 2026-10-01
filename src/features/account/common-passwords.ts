/** Mots de passe courants (≥ 12 caractères) refusés à l'inscription (RG-AUTH-01). Liste courte, extensible. */
export const COMMON_PASSWORDS = new Set([
  '123456789012', '1234567890123', 'qwertyuiopas', 'azertyuiopqs', 'motdepasse12', 'motdepasse123',
  'password1234', 'password12345', 'passwordpassword', 'azertyazerty', 'qwertyqwerty', 'aaaaaaaaaaaa',
  'iloveyou1234', 'administrator', 'jardinjardin', 'motdepassemotdepasse', 'bonjour12345', 'soleil123456',
  'football1234', 'princesse123', '000000000000', '111111111111', '123123123123', 'abcdefghijkl',
]);

export function isCommonPassword(pw: string): boolean {
  const lower = pw.toLowerCase();
  return COMMON_PASSWORDS.has(lower) || /^(.)\1+$/.test(lower) || /^(0123456789|1234567890)+\d*$/.test(lower);
}
