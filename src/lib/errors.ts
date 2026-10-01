export type ActionErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'LOCKED_ITEM'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export type FieldErrors = Record<string, string[]>;

export type ActionError = { code: ActionErrorCode; message: string; fieldErrors?: FieldErrors };

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

/** Erreur métier typée levée par la couche service ; `message` est une clé i18n (namespace `errors`). */
export class DomainError extends Error {
  readonly code: ActionErrorCode;
  readonly fieldErrors: FieldErrors | undefined;

  constructor(code: ActionErrorCode, message: string = code, fieldErrors?: FieldErrors) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export const forbidden = (message = 'forbidden') => new DomainError('FORBIDDEN', message);
export const notFound = (message = 'notFound') => new DomainError('NOT_FOUND', message);
export const conflict = (message = 'conflict') => new DomainError('CONFLICT', message);
export const validation = (fieldErrors: FieldErrors, message = 'validation') =>
  new DomainError('VALIDATION', message, fieldErrors);
