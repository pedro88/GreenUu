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

/* ---------- Lot 3 : ticketing et notifications ---------- */
export const TICKET_TYPES = ['task', 'problem', 'check', 'harvest', 'purchase', 'maintenance'] as const;
export const TICKET_STATUSES = ['todo', 'in_progress', 'blocked', 'done', 'cancelled', 'skipped'] as const;
export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export const TICKET_SOURCES = ['manual', 'recurrence', 'stage', 'guide'] as const;
export const ACTION_TAGS = ['watering', 'sowing', 'planting', 'harvest', 'weeding', 'treatment', 'pruning', 'purchase', 'repair'] as const;
export const NOTIFICATION_TYPES = ['assigned', 'due_soon', 'overdue', 'mentioned', 'commented', 'invited', 'member_left_unassigned', 'group_archived_unassigned', 'digest', 'achievement', 'quest', 'content_hidden', 'moderation_decision'] as const;
export const NOTIFICATION_CHANNELS = ['email', 'in_app'] as const;

export type TicketType = (typeof TICKET_TYPES)[number];
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/* ---------- Lot 4 : guides, tips, modération ---------- */
export const GUIDE_VISIBILITIES = ['private', 'unlisted', 'public'] as const;
export const REPORT_REASONS = ['spam', 'inaccurate_or_dangerous', 'inappropriate', 'copyright', 'other'] as const;
export const REPORT_STATUSES = ['open', 'dismissed', 'actioned'] as const;

export type GuideVisibility = (typeof GUIDE_VISIBILITIES)[number];
export type ReportReason = (typeof REPORT_REASONS)[number];
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/* ---------- Lot 6 : progression ---------- */
export const XP_REASONS = ['award', 'cap_reached', 'reversal', 'quest', 'recompute'] as const;
export const QUEST_KINDS = ['daily', 'weekly', 'seasonal'] as const;
export const QUEST_SOURCES = ['ticket', 'stage', 'result', 'template'] as const;
export const QUEST_STATUSES = ['open', 'done', 'expired'] as const;
export const GOAL_METRICS = ['tickets_completed', 'harvest_kg', 'observations', 'results_complete', 'cultures_started'] as const;

export type XpReason = (typeof XP_REASONS)[number];
export type QuestKind = (typeof QUEST_KINDS)[number];
export type GoalMetric = (typeof GOAL_METRICS)[number];
export type Skill = (typeof SKILL_DOMAINS)[number];

/* ---------- Lot 7 : vue jardin et éditeur de plan ---------- */
export const TERRAIN_KINDS = ['path', 'gravel_path', 'stepping_stones', 'water_point', 'rain_barrel', 'hedge', 'existing_tree', 'fence', 'gate'] as const;
export const DEFAULT_VIEWS = ['garden', 'classic'] as const;
export type TerrainKind = (typeof TERRAIN_KINDS)[number];
export type DefaultView = (typeof DEFAULT_VIEWS)[number];
