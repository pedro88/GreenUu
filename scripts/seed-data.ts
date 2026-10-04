import { hashPassword } from 'better-auth/crypto';
import { eq, sql } from 'drizzle-orm';
import { encodeGeohash } from '../src/lib/geohash';
import { seedId } from '../src/lib/uuid5';
import { seasonBounds } from '../src/features/season/season.pure';
import type { Db } from '../src/server/db/client';
import {
  account, consent, garden, gardenEnvironment, gardenGroup, gardenMember, groupMember, practice, practiceDeclaration,
  decorPlacement, season, terrainElement, user, userProfile, zone, zoneGroupPermission, zoneType,
} from '../src/server/db/schema';
import type { Environment, GardenRole, OrgType, TerrainKind } from '../src/lib/enums';
import { assignDefaultAvatar } from '../src/features/avatar/service';
import { decorItemRefId } from '../src/features/decor/load';
import { loadReferenceData } from '../src/features/plant/reference/load';
import { closeOldSeasons, seedCultures } from './seed-cultures';
import { seedCommunity, seedOwnResults } from './seed-community';
import { awardAchievements } from '../src/features/progression/achievements';
import { generateQuests } from '../src/features/progression/quests';
import { recomputeXp } from '../src/features/progression/service';
import { seedContent } from './seed-content';
import { seedTickets } from './seed-tickets';

export const SEED_PASSWORD = 'jardin-seed-2026';

type SeedUser = { key: string; name: string; platformRole?: 'user' | 'moderator' | 'admin'; verified?: boolean };
export const SEED_USERS: SeedUser[] = [
  { key: 'alice', name: 'alice' }, { key: 'bruno', name: 'bruno' }, { key: 'chloe', name: 'chloe' },
  { key: 'david', name: 'david' }, { key: 'emma', name: 'emma' }, { key: 'farid', name: 'farid' },
  { key: 'gaelle', name: 'gaelle' }, { key: 'hugo', name: 'hugo' }, { key: 'nina', name: 'nina', verified: false },
  { key: 'modo', name: 'modo', platformRole: 'moderator' }, { key: 'admin', name: 'admin', platformRole: 'admin' },
];
export const seedEmail = (key: string) => `${key}@greenu.test`;
export const userId = (key: string) => seedId(`user:${key}`);
export const gardenId = (key: string) => seedId(`garden:${key}`);
export const zoneId = (garden: string, key: string) => seedId(`zone:${garden}:${key}`);
export const groupId = (garden: string, key: string) => seedId(`group:${garden}:${key}`);

type ZoneSpec = { key: string; name: string; type: string; children?: ZoneSpec[]; env?: Environment; lengthCm?: number; widthCm?: number; interior?: boolean };

type GardenSpec = {
  key: string; name: string; orgType: OrgType; envs: Environment[]; lat: number; lng: number; place: string; altitude: number;
  koppen: string; soil: 'loam' | 'clay' | 'silty' | 'sandy'; ph: number; owner: string;
  members: { user: string; role: Exclude<GardenRole, 'owner'> }[];
  groups?: { key: string; name: string; members: string[] }[];
  restrictions?: { zone: string; group: string; level: 'edit' | 'contribute' }[];
  practices: string[]; zones: ZoneSpec[];
};

const bed = (key: string, name: string, rows = 0): ZoneSpec => ({
  key, name, type: 'bed', lengthCm: 300, widthCm: 120,
  children: Array.from({ length: rows }, (_, i) => ({ key: `${key}-r${i + 1}`, name: `Rang ${String.fromCharCode(65 + i)}`, type: 'row', lengthCm: 300, widthCm: 30 })),
});

export const SEED_GARDENS: GardenSpec[] = [
  {
    key: 'tilleuls', name: 'Les Tilleuls', orgType: 'family', envs: ['open_air'], lat: 50.4669, lng: 4.8675, place: 'Namur', altitude: 120,
    koppen: 'Cfb', soil: 'loam', ph: 6.8, owner: 'alice', members: [{ user: 'gaelle', role: 'observer' }],
    practices: ['organic', 'mulching', 'crop_rotation', 'composting'],
    zones: [
      { key: 'potager', name: 'Potager', type: 'plot', children: [bed('p1', 'Planche 1', 3), bed('p2', 'Planche 2', 2), bed('p3', 'Planche 3'), bed('p4', 'Planche 4')] },
      { key: 'carres', name: 'Carrés', type: 'plot', children: [1, 2, 3].map((n) => ({ key: `bac${n}`, name: `Bac ${n}`, type: 'container', lengthCm: 120, widthCm: 120 })) },
      { key: 'fruits', name: 'Petits fruits', type: 'fruit_hedge', lengthCm: 800, widthCm: 100 },
      { key: 'compost', name: 'Composteur', type: 'compost' },
    ],
  },
  {
    key: 'canal', name: 'Jardin partagé du Canal', orgType: 'collective', envs: ['open_air', 'greenhouse'], lat: 50.8467, lng: 4.3525, place: 'Bruxelles', altitude: 30,
    koppen: 'Cfb', soil: 'silty', ph: 7.1, owner: 'bruno',
    members: [{ user: 'chloe', role: 'admin' }, { user: 'david', role: 'member' }, { user: 'emma', role: 'member' }, { user: 'farid', role: 'observer' }, { user: 'gaelle', role: 'member' }],
    groups: [{ key: 'serre', name: 'Équipe serre', members: ['david', 'emma'] }, { key: 'dupont', name: 'Famille Dupont', members: ['emma'] }],
    restrictions: [{ zone: 'dupont', group: 'dupont', level: 'edit' }],
    practices: ['organic', 'no_pesticides', 'irrigation_manual'],
    zones: [
      { key: 'a', name: 'Parcelle A', type: 'plot', children: [bed('a1', 'Planche A1'), bed('a2', 'Planche A2')] },
      { key: 'b', name: 'Parcelle B', type: 'plot', children: [bed('b1', 'Planche B1'), bed('b2', 'Planche B2')] },
      { key: 'dupont', name: 'Parcelle Dupont', type: 'plot', children: [bed('d1', 'Planche Dupont')] },
      { key: 'serre', name: 'Serre', type: 'greenhouse', env: 'greenhouse', interior: true, children: [
        { key: 't1', name: 'Table 1', type: 'bench', children: [{ key: 't1-b1', name: 'Bac 1', type: 'container' }, { key: 't1-b2', name: 'Bac 2', type: 'container' }] },
        { key: 't2', name: 'Table 2', type: 'bench' },
      ] },
      { key: 'compost', name: 'Compost collectif', type: 'compost' },
    ],
  },
  {
    key: 'combes', name: 'Maraîchage des Combes', orgType: 'professional', envs: ['greenhouse', 'tunnel'], lat: 49.6116, lng: 6.1319, place: 'Luxembourg', altitude: 300,
    koppen: 'Cfb', soil: 'clay', ph: 6.4, owner: 'gaelle', members: [],
    practices: ['organic', 'irrigation_drip', 'green_manure'],
    zones: [
      { key: 'serre1', name: 'Serre 1', type: 'greenhouse', env: 'greenhouse', interior: true, children: [bed('s1-1', 'Planche S1-1'), bed('s1-2', 'Planche S1-2')] },
      { key: 'tunnel1', name: 'Tunnel 1', type: 'tunnel', env: 'tunnel', interior: true, children: [bed('t1-1', 'Planche T1-1')] },
      { key: 'pepiniere', name: 'Pépinière', type: 'nursery', env: 'greenhouse', children: [{ key: 'plaque1', name: 'Plaque 1', type: 'seed_tray' }] },
    ],
  },
];

/**
 * Plan des jardins (lot 7, §9) : géométrie en centimètres, [x, y, largeur, hauteur], tuile de 50 cm. Les zones absentes
 * restent « à placer ». Dans le Potager des Tilleuls, les tuiles (2, 2) à (5, 4) restent libres pour PLN-01.
 */
const GEOMETRY: Record<string, Record<string, [number, number, number, number]>> = {
  tilleuls: {
    potager: [0, 0, 1200, 600],
    p1: [450, 100, 150, 300], 'p1-r1': [450, 100, 150, 100], 'p1-r2': [450, 200, 150, 100], 'p1-r3': [450, 300, 150, 100],
    p2: [650, 100, 150, 300], 'p2-r1': [650, 100, 150, 150], 'p2-r2': [650, 250, 150, 150],
    p3: [850, 100, 150, 300], p4: [1050, 100, 150, 300],
    carres: [0, 700, 700, 250], bac1: [50, 750, 150, 150], bac2: [250, 750, 150, 150], bac3: [450, 750, 150, 150],
    fruits: [800, 750, 800, 100], compost: [1300, 0, 100, 100],
  },
  canal: {
    a: [0, 0, 600, 400], a1: [50, 50, 200, 300], a2: [300, 50, 200, 300],
    b: [700, 0, 600, 400], b1: [750, 50, 200, 300], b2: [1000, 50, 200, 300],
    dupont: [0, 500, 400, 300], d1: [50, 550, 300, 200],
    serre: [700, 500, 400, 300], compost: [1200, 500, 100, 100],
    // Intérieur de la serre (scène propre) : deux tables, la première avec deux bacs.
    t1: [50, 50, 300, 100], 't1-b1': [50, 50, 150, 100], 't1-b2': [200, 50, 150, 100], t2: [50, 200, 300, 100],
  },
  combes: {
    serre1: [0, 0, 600, 300], 's1-1': [50, 50, 200, 200], 's1-2': [300, 50, 200, 200],
    tunnel1: [0, 400, 800, 200], 't1-1': [50, 50, 700, 100],
    pepiniere: [700, 0, 200, 200], plaque1: [750, 50, 100, 50],
  },
};
const rectOf = (garden: string, key: string) => {
  const g = GEOMETRY[garden]?.[key];
  return g ? { v: 1 as const, kind: 'rect' as const, x: g[0], y: g[1], w: g[2], h: g[3] } : null;
};
/** Éléments de terrain de la scène extérieure (§9.2) : allées et points d'eau. */
const TERRAIN: Record<string, { key: string; kind: TerrainKind; at: [number, number, number, number] }[]> = {
  tilleuls: [{ key: 'allee', kind: 'gravel_path', at: [0, 600, 1200, 100] }, { key: 'robinet', kind: 'water_point', at: [1250, 150, 50, 50] }, { key: 'cuve', kind: 'rain_barrel', at: [1300, 200, 50, 50] }],
  canal: [{ key: 'allee', kind: 'path', at: [0, 400, 1300, 100] }, { key: 'portail', kind: 'gate', at: [600, 900, 100, 50] }],
};

/**
 * Déco posée (§14, lot 8) : pied de l'objet en centimètres. L'hôtel à insectes des Tilleuls est déclaré comme pratique
 * (DEC-03) ; le nichoir du Canal ne l'est pas, pour qu'un test puisse le déclarer.
 */
const DECOR: Record<string, { key: string; item: string; at: [number, number]; by: string; label?: string; practice?: string }[]> = {
  tilleuls: [
    { key: 'hotel', item: 'insect_hotel', at: [1225, 450], by: 'alice', practice: 'biodiversity_insect_hotel' },
    { key: 'banc', item: 'bench', at: [1450, 650], by: 'alice' },
    { key: 'epouvantail', item: 'scarecrow', at: [925, 550], by: 'alice' },
  ],
  canal: [
    { key: 'panneau', item: 'sign', at: [650, 950], by: 'bruno', label: 'Jardin du Canal' },
    { key: 'nichoir', item: 'birdhouse', at: [1250, 350], by: 'chloe' },
    { key: 'brouette', item: 'wheelbarrow', at: [650, 480], by: 'david' },
  ],
};

/** Seed idempotent : identifiants dérivés des noms, `ON CONFLICT DO NOTHING`. */
export async function seed(db: Db, referenceDate: Date): Promise<void> {
  const passwordHash = await hashPassword(SEED_PASSWORD);
  const year = referenceDate.getFullYear();
  await db.transaction(async (tx) => {
    await loadReferenceData(tx);
    for (const u of SEED_USERS) {
      const id = userId(u.key);
      await tx.insert(user).values({ id, name: u.name, email: seedEmail(u.key), emailVerified: u.verified ?? true, platformRole: u.platformRole ?? 'user' }).onConflictDoNothing();
      await tx.insert(userProfile).values({ userId: id, pseudo: u.name, timezone: 'Europe/Brussels' }).onConflictDoNothing();
      await tx.insert(account).values({ id: seedId(`account:${u.key}`), userId: id, accountId: id, providerId: 'credential', password: passwordHash }).onConflictDoNothing();
      await tx.insert(consent).values({ id: seedId(`consent:${u.key}`), userId: id, kind: 'terms', version: 'cgu-2026-10' }).onConflictDoNothing();
      await assignDefaultAvatar(tx, id);
    }
    const types = new Map((await tx.select({ id: zoneType.id, code: zoneType.code }).from(zoneType).where(sql`${zoneType.gardenId} is null`)).map((t) => [t.code, t.id]));
    const practices = new Map((await tx.select({ id: practice.id, code: practice.code }).from(practice)).map((p) => [p.code, p.id]));
    for (const g of SEED_GARDENS) {
      const gid = gardenId(g.key);
      await tx.insert(garden).values({
        id: gid, name: g.name, orgType: g.orgType, lat: g.lat, lng: g.lng, geohash4: encodeGeohash(g.lat, g.lng, 4), placeLabel: g.place,
        altitudeM: g.altitude, koppen: g.koppen, soilType: g.soil, soilPh: g.ph, exposure: 'full_sun', waterAccess: 'tap',
        timezone: 'Europe/Brussels', planEditMinRole: g.orgType === 'family' ? 'member' : 'admin', createdBy: userId(g.owner),
      }).onConflictDoNothing();
      await tx.insert(gardenEnvironment).values(g.envs.map((environment, position) => ({ gardenId: gid, environment, position }))).onConflictDoNothing();
      const memberRows = [{ user: g.owner, role: 'owner' as const }, ...g.members];
      for (const m of memberRows) {
        await tx.insert(gardenMember).values({ id: seedId(`member:${g.key}:${m.user}`), gardenId: gid, userId: userId(m.user), role: m.role }).onConflictDoNothing();
      }
      for (const y of [year - 2, year - 1, year]) {
        await tx.insert(season).values({ id: seedId(`season:${g.key}:${y}`), gardenId: gid, year: y, ...seasonBounds(y, 1), status: 'active' }).onConflictDoNothing();
      }
      const insertZones = async (specs: ZoneSpec[], parent: { id: string; path: string; depth: number; scene: string | null; interior: boolean } | null) => {
        for (const [i, z] of specs.entries()) {
          const id = zoneId(g.key, z.key);
          const typeId = types.get(z.type);
          if (!typeId) throw new Error(`type de zone inconnu : ${z.type}`);
          const path = parent ? (parent.path ? `${parent.path}/${parent.id}` : parent.id) : '';
          await tx.insert(zone).values({
            id, gardenId: gid, parentId: parent?.id ?? null, zoneTypeId: typeId, name: z.name, path, depth: parent ? parent.depth + 1 : 0,
            environment: z.env ?? null, lengthCm: z.lengthCm ?? null, widthCm: z.widthCm ?? null, hasInterior: z.interior ?? false, geometry: rectOf(g.key, z.key),
            sceneZoneId: parent ? (parent.interior ? parent.id : parent.scene) : null, sortOrder: i,
          }).onConflictDoNothing();
          if (z.children) await insertZones(z.children, { id, path, depth: parent ? parent.depth + 1 : 0, scene: parent ? (parent.interior ? parent.id : parent.scene) : null, interior: z.interior ?? false });
        }
      };
      await insertZones(g.zones, null);
      for (const t of TERRAIN[g.key] ?? []) {
        await tx.insert(terrainElement).values({ id: seedId(`terrain:${g.key}:${t.key}`), gardenId: gid, kind: t.kind, geometry: { v: 1, kind: 'rect', x: t.at[0], y: t.at[1], w: t.at[2], h: t.at[3] } }).onConflictDoNothing();
      }
      for (const d of DECOR[g.key] ?? []) {
        const id = seedId(`decor:${g.key}:${d.key}`);
        await tx.insert(decorPlacement).values({ id, gardenId: gid, decorItemId: decorItemRefId(d.item), xCm: d.at[0], yCm: d.at[1], label: d.label ?? null, placedBy: userId(d.by) }).onConflictDoNothing();
        const pid = d.practice ? practices.get(d.practice) : undefined;
        if (pid) await tx.insert(practiceDeclaration).values({ id: seedId(`practice:${g.key}:decor:${d.key}`), gardenId: gid, practiceId: pid, decorPlacementId: id }).onConflictDoNothing();
      }
      for (const gr of g.groups ?? []) {
        const grId = groupId(g.key, gr.key);
        await tx.insert(gardenGroup).values({ id: grId, gardenId: gid, name: gr.name }).onConflictDoNothing();
        for (const m of gr.members) await tx.insert(groupMember).values({ gardenId: gid, groupId: grId, memberId: seedId(`member:${g.key}:${m}`) }).onConflictDoNothing();
      }
      for (const r of g.restrictions ?? []) {
        await tx.insert(zoneGroupPermission).values({ gardenId: gid, zoneId: zoneId(g.key, r.zone), groupId: groupId(g.key, r.group), level: r.level }).onConflictDoNothing();
      }
      for (const code of g.practices) {
        const pid = practices.get(code);
        if (pid) await tx.insert(practiceDeclaration).values({ id: seedId(`practice:${g.key}:${code}`), gardenId: gid, practiceId: pid }).onConflictDoNothing();
      }
    }
    await seedCultures(tx, referenceDate, { gardenId, zoneId, userId });
    await seedTickets(tx, referenceDate, { gardenId, zoneId, userId, groupId, memberId: (g, u) => seedId(`member:${g}:${u}`) });
    await seedContent(tx, referenceDate, { userId, gardenId });
    await seedOwnResults(tx, gardenId('tilleuls'), userId('alice'), referenceDate);
    await seedCommunity(tx, referenceDate);
    // La saison N−2 est close : lecture seule (RG-SEA-02).
    for (const g of SEED_GARDENS) await closeOldSeasons(tx, gardenId(g.key), year - 1);
    // Progression (SPEC §14) : les événements historiques sont rejoués par le recalcul, puis les succès évalués.
    await recomputeXp(tx, { apply: true, now: referenceDate });
    for (const u of SEED_USERS) await awardAchievements(tx, userId(u.key), null, referenceDate);
    // Quêtes de la période, comme les génère le job `quests.generate` : la page des quêtes ne fait que les lire (POL-06).
    for (const u of SEED_USERS) await generateQuests(tx, userId(u.key), referenceDate);
    // Vérification d'intégrité minimale : un owner par jardin.
    for (const g of SEED_GARDENS) {
      const owners = await tx.select().from(gardenMember).where(eq(gardenMember.id, seedId(`member:${g.key}:${g.owner}`)));
      if (owners[0]?.role !== 'owner') throw new Error(`owner manquant pour ${g.key}`);
    }
  });
}
