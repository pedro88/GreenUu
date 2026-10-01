/** Listes de référence fermées (SPEC §4.4), partagées serveur / client. */
export const ORG_TYPES = ['individual', 'family', 'collective', 'association', 'professional', 'educational'] as const;
export const ENVIRONMENTS = ['open_air', 'greenhouse', 'tunnel', 'indoor', 'soilless', 'hydroponic', 'balcony_roof'] as const;
export const SOIL_TYPES = ['clay', 'silty', 'sandy', 'loam', 'chalky', 'peaty', 'stony', 'potting_mix', 'unknown'] as const;
export const EXPOSURES = ['full_sun', 'partial_sun', 'partial_shade', 'shade'] as const;
export const WATER_ACCESS = ['tap', 'rainwater', 'well', 'river', 'none'] as const;
export const GARDEN_ROLES = ['owner', 'admin', 'member', 'observer'] as const;
export const NON_OWNER_ROLES = ['admin', 'member', 'observer'] as const;

export type OrgType = (typeof ORG_TYPES)[number];
export type Environment = (typeof ENVIRONMENTS)[number];
export type GardenRole = (typeof GARDEN_ROLES)[number];
