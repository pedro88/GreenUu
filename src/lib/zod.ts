import { z } from 'zod';

/**
 * Messages de validation = clés i18n (namespace `validation`), avec paramètres en query-string :
 * `tooSmall?min=2`. Le client les traduit avec `translateValidation`.
 */
z.config({
  customError: (issue) => {
    switch (issue.code) {
      case 'too_small':
        return issue.origin === 'string' ? `tooShort?min=${String(issue.minimum)}` : issue.origin === 'array' ? `tooFew?min=${String(issue.minimum)}` : `tooSmall?min=${String(issue.minimum)}`;
      case 'too_big':
        return issue.origin === 'string' ? `tooLong?max=${String(issue.maximum)}` : issue.origin === 'array' ? `tooMany?max=${String(issue.maximum)}` : `tooBig?max=${String(issue.maximum)}`;
      case 'invalid_format':
        return issue.format === 'email' ? 'invalidEmail' : 'invalidFormat';
      case 'invalid_value':
        return 'invalidChoice';
      case 'invalid_type':
        return issue.input === undefined || issue.input === null || issue.input === '' ? 'required' : 'invalidType';
      default:
        return undefined;
    }
  },
});

export { z };

/** Chaîne optionnelle venant d'un formulaire : '' → undefined. */
export const optionalText = (max: number) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : typeof v === 'string' ? v.trim() : v), z.string().max(max).optional());

/** Nombre optionnel venant d'un formulaire : '' → undefined. */
export const optionalNumber = (schema: z.ZodNumber) =>
  z.preprocess((v) => (v === '' || v === null || v === undefined ? undefined : typeof v === 'string' ? Number(v) : v), schema.optional());

export const uuidSchema = z.uuid();
