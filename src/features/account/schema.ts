import { z } from '@/lib/zod';
import { isValidTimeZone } from '@/lib/dates';
import { PASSWORD_MIN_LENGTH } from '@/server/auth/constants';
import { isCommonPassword } from './common-passwords';

export const pseudoSchema = z.string().trim().toLowerCase().min(3).max(24).regex(/^[a-z0-9_-]+$/, 'invalidPseudo');

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH)
  .max(128)
  .refine((p) => !isCommonPassword(p), 'commonPassword');

const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  pseudo: pseudoSchema,
  acceptTerms: z.literal(true, { error: 'mustAcceptTerms' }),
  timezone: z.string().refine(isValidTimeZone, 'invalidTimezone').default('Europe/Paris'),
  invitationToken: z.string().min(20).max(100).optional(),
});
export type RegisterInput = z.output<typeof registerSchema>;

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
  next: z.string().max(500).optional(),
});

export const forgotSchema = z.object({ email: emailSchema });
export const resetSchema = z.object({ token: z.string().min(10).max(200), password: passwordSchema });
export const verifySchema = z.object({ token: z.string().min(10).max(2000) });

export const accountUpdateSchema = z.object({
  pseudo: pseudoSchema,
  timezone: z.string().refine(isValidTimeZone, 'invalidTimezone'),
  locale: z.enum(['fr', 'en']),
});

/** `next` n'accepte que des chemins internes (pas de redirection ouverte). */
export function safeNext(next: string | undefined, fallback = '/app'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}

export const TERMS_VERSION = 'cgu-2026-10';
