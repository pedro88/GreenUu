import { seedId } from '../../src/lib/uuid5';

/** Identifiants stables du seed (UUID v5 dérivés des noms). */
export const gardenId = (key: string) => seedId(`garden:${key}`);
export const zoneId = (garden: string, key: string) => seedId(`zone:${garden}:${key}`);
export const userId = (key: string) => seedId(`user:${key}`);
export const decorId = (garden: string, key: string) => seedId(`decor:${garden}:${key}`);
