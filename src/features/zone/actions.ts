'use server';

import { defineAction } from '@/server/action';
import { zoneCreateSchema, zoneMoveSchema, zoneRefSchema, zoneRestrictSchema, zoneTypeArchiveSchema, zoneTypeCreateSchema, zoneUpdateSchema } from './schema';
import * as service from './service';

/* Les permissions de zone dépendent du réglage du jardin et des restrictions par groupe :
   le scope vérifie l'adhésion (garden:read), le service applique les règles fines (SPEC §5.3). */

export const createZoneAction = defineAction({
  name: 'zone.create',
  input: zoneCreateSchema,
  permission: 'garden:read',
  gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.createZone(ctx, input),
});

export const updateZoneAction = defineAction({
  name: 'zone.update',
  input: zoneUpdateSchema,
  permission: 'garden:read',
  gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.updateZone(ctx, input),
});

export const moveZoneAction = defineAction({
  name: 'zone.move',
  input: zoneMoveSchema,
  permission: 'garden:read',
  gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.moveZone(ctx, input),
});

export const archiveZoneAction = defineAction({
  name: 'zone.archive',
  input: zoneRefSchema,
  permission: 'garden:read',
  gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.setZoneArchived(ctx, input.zoneId, true),
});

export const unarchiveZoneAction = defineAction({
  name: 'zone.unarchive',
  input: zoneRefSchema,
  permission: 'garden:read',
  gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.setZoneArchived(ctx, input.zoneId, false),
});

export const createZoneTypeAction = defineAction({
  name: 'zoneType.create',
  input: zoneTypeCreateSchema,
  permission: 'garden:update',
  gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.createZoneType(ctx, input),
});

export const archiveZoneTypeAction = defineAction({
  name: 'zoneType.archive',
  input: zoneTypeArchiveSchema,
  permission: 'garden:update',
  gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.archiveZoneType(ctx, input.zoneTypeId),
});

export const restrictZoneAction = defineAction({
  name: 'zone.restrict',
  input: zoneRestrictSchema,
  permission: 'zone:restrict',
  gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.setZoneRestrictions(ctx, input.zoneId, input.restrictions),
});
