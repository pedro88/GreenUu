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

/* ---------- Lot 2 : référentiel végétal et cultures ---------- */
export const VISUAL_MODELS = ['fruit', 'leaf', 'root', 'tuber', 'perennial', 'tree', 'flower'] as const;
export const SKILL_DOMAINS = ['vegetable', 'herbs', 'fruit', 'flowers', 'greenhouse', 'seeds', 'compost'] as const;
export const SUN_NEEDS = ['full', 'partial', 'shade'] as const;
export const WATER_NEEDS = ['low', 'medium', 'high'] as const;
export const VARIETY_ORIGINS = ['commercial', 'local', 'peasant'] as const;
export const VARIETY_STATUSES = ['pending', 'approved', 'rejected', 'merged'] as const;
export const COMPANION_EFFECTS = ['favorable', 'unfavorable'] as const;
export const METHODS = ['direct_sowing', 'tray_sowing', 'bought_plants', 'cutting', 'division', 'bulb_tuber', 'grafting'] as const;
export const CULTURE_STATUSES = ['planned', 'active', 'finished', 'failed', 'abandoned'] as const;
export const SEED_SOURCES = ['bought', 'own_saved', 'exchange', 'unknown'] as const;
export const STAGES = ['sowing', 'emergence', 'transplanting', 'planting', 'flowering', 'fruiting', 'harvest_start', 'harvest_end', 'seed_set', 'end'] as const;
export const JOURNAL_KINDS = ['note', 'weather', 'disease', 'pest', 'intervention', 'photo'] as const;
export const INTERVENTIONS = ['watering', 'fertilizing', 'treatment', 'pruning', 'weeding', 'mulching', 'transplant', 'other'] as const;
export const PROBLEM_CATEGORIES = ['disease', 'pest', 'climate', 'soil', 'other'] as const;
export const HARVEST_UNITS = ['g', 'kg', 'unit', 'bunch', 'l'] as const;

export type VisualModel = (typeof VISUAL_MODELS)[number];
export type Method = (typeof METHODS)[number];
export type CultureStatus = (typeof CULTURE_STATUSES)[number];
export type Stage = (typeof STAGES)[number];
export type JournalKind = (typeof JOURNAL_KINDS)[number];
export type Intervention = (typeof INTERVENTIONS)[number];
export type HarvestUnit = (typeof HARVEST_UNITS)[number];
