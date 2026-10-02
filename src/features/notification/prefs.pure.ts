import type { NotificationChannel, NotificationType } from '@/lib/enums';

/** Préférences par défaut (RG-NTF-02). Succès et quêtes ne partent jamais par e-mail. */
const EMAIL_DEFAULT_ON: ReadonlySet<NotificationType> = new Set(['assigned', 'mentioned', 'due_soon', 'invited']);
export const NEVER_EMAIL: ReadonlySet<NotificationType> = new Set(['achievement', 'quest']);

export function defaultPreference(type: NotificationType, channel: NotificationChannel): boolean {
  if (channel === 'in_app') return type !== 'digest';
  if (NEVER_EMAIL.has(type)) return false;
  return EMAIL_DEFAULT_ON.has(type);
}

export function effectivePreference(type: NotificationType, channel: NotificationChannel, stored: boolean | undefined): boolean {
  if (channel === 'email' && NEVER_EMAIL.has(type)) return false;
  return stored ?? defaultPreference(type, channel);
}

export const GROUP_WINDOW_MS = 10 * 60_000;
