import { seedId } from '../../src/lib/uuid5';

/** Identifiants stables du seed (UUID v5 dérivés des noms). */
export const gardenId = (key: string) => seedId(`garden:${key}`);
export const zoneId = (garden: string, key: string) => seedId(`zone:${garden}:${key}`);
