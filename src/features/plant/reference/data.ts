import type { Method, Stage, VisualModel } from '@/lib/enums';

/* Référentiel végétal commun (SPEC §4.4, RG-PLT-01). Codes stables : ils servent d'identifiants (UUID v5). */

export type FamilyRef = { code: string; latin: string; returnYears: number; sprite?: string };
export const FAMILIES: FamilyRef[] = [
  { code: 'solanaceae', latin: 'Solanaceae', returnYears: 4, sprite: 'solanacees' },
  { code: 'brassicaceae', latin: 'Brassicaceae', returnYears: 4, sprite: 'brassicacees' },
  { code: 'amaryllidaceae', latin: 'Amaryllidaceae', returnYears: 4, sprite: 'amaryllidacees' },
  { code: 'cucurbitaceae', latin: 'Cucurbitaceae', returnYears: 3, sprite: 'cucurbitacees' },
  { code: 'apiaceae', latin: 'Apiaceae', returnYears: 3, sprite: 'apiacees' },
  { code: 'fabaceae', latin: 'Fabaceae', returnYears: 3, sprite: 'fabacees' },
  { code: 'amaranthaceae', latin: 'Amaranthaceae', returnYears: 3, sprite: 'amaranthacees' },
  { code: 'asteraceae', latin: 'Asteraceae', returnYears: 2, sprite: 'asteracees' },
  { code: 'poaceae', latin: 'Poaceae', returnYears: 2, sprite: 'poacees' },
  { code: 'lamiaceae', latin: 'Lamiaceae', returnYears: 2, sprite: 'lamiacees' },
  { code: 'rosaceae', latin: 'Rosaceae', returnYears: 2, sprite: 'rosacees' },
  { code: 'boraginaceae', latin: 'Boraginaceae', returnYears: 2 },
  { code: 'tropaeolaceae', latin: 'Tropaeolaceae', returnYears: 2 },
  { code: 'caprifoliaceae', latin: 'Caprifoliaceae', returnYears: 2 },
  { code: 'polygonaceae', latin: 'Polygonaceae', returnYears: 2 },
  { code: 'grossulariaceae', latin: 'Grossulariaceae', returnYears: 2 },
  { code: 'hydrophyllaceae', latin: 'Hydrophyllaceae', returnYears: 2 },
];

type Sun = 'full' | 'partial' | 'shade';
type Water = 'low' | 'medium' | 'high';
type Skill = 'vegetable' | 'herbs' | 'fruit' | 'flowers';

export type SpeciesRef = {
  code: string; family: string; latin: string; fr: string[]; en: string[]; model: VisualModel; skill: Skill;
  perennial?: boolean; greenManure?: boolean; sun: Sun; water: Water; temp: [number, number, number];
  spacing: [number, number]; dtm: [number, number]; unitG?: number; sprite?: string;
};

// [code, famille, latin, noms fr, noms en, modèle, compétence, soleil, eau, [tmin, topt, tmax], [rang, plant] cm, [jours min, max], poids unitaire g]
const S = (
  code: string, family: string, latin: string, fr: string[], en: string[], model: VisualModel, skill: Skill, sun: Sun, water: Water,
  temp: [number, number, number], spacing: [number, number], dtm: [number, number], extra: Partial<SpeciesRef> = {},
): SpeciesRef => ({ code, family, latin, fr, en, model, skill, sun, water, temp, spacing, dtm, ...(SPRITES.has(code) ? { sprite: code } : {}), ...extra });

/** Espèces pour lesquelles la session sprites a livré des visuels (repli sur la famille sinon). */
const SPRITES = new Set(['ail', 'artichaut', 'aubergine', 'basilic', 'betterave', 'blette', 'carotte', 'celeri', 'chou', 'ciboulette', 'concombre', 'courge',
  'courgette', 'epinard', 'fenouil', 'fraisier', 'framboisier', 'groseillier', 'haricot', 'kale', 'laitue', 'mais', 'melon', 'menthe', 'oignon', 'persil',
  'poireau', 'poirier', 'pois', 'poivron', 'pomme-de-terre', 'pommier', 'radis', 'rhubarbe', 'romarin', 'thym', 'tomate',
  'souci', 'capucine', 'tournesol', 'phacelie', 'bourrache', 'cosmos']);

export const SPECIES: SpeciesRef[] = [
  S('tomate', 'solanaceae', 'Solanum lycopersicum', ['Tomate'], ['Tomato'], 'fruit', 'vegetable', 'full', 'medium', [10, 24, 32], [80, 50], [70, 120], { unitG: 150 }),
  S('aubergine', 'solanaceae', 'Solanum melongena', ['Aubergine'], ['Eggplant'], 'fruit', 'vegetable', 'full', 'medium', [14, 26, 34], [70, 50], [90, 140], { unitG: 300 }),
  S('poivron', 'solanaceae', 'Capsicum annuum', ['Poivron', 'Piment'], ['Pepper'], 'fruit', 'vegetable', 'full', 'medium', [13, 25, 32], [60, 45], [80, 130], { unitG: 160 }),
  S('pomme-de-terre', 'solanaceae', 'Solanum tuberosum', ['Pomme de terre'], ['Potato'], 'tuber', 'vegetable', 'full', 'medium', [7, 18, 27], [70, 35], [90, 130], { unitG: 120 }),
  S('chou', 'brassicaceae', 'Brassica oleracea', ['Chou'], ['Cabbage'], 'leaf', 'vegetable', 'full', 'high', [4, 18, 25], [60, 50], [90, 160], { unitG: 1200 }),
  S('kale', 'brassicaceae', 'Brassica oleracea var. sabellica', ['Chou kale'], ['Kale'], 'leaf', 'vegetable', 'full', 'medium', [2, 16, 24], [60, 45], [60, 90]),
  S('radis', 'brassicaceae', 'Raphanus sativus', ['Radis'], ['Radish'], 'root', 'vegetable', 'full', 'medium', [5, 16, 24], [15, 4], [21, 35], { unitG: 15 }),
  S('ail', 'amaryllidaceae', 'Allium sativum', ['Ail'], ['Garlic'], 'root', 'vegetable', 'full', 'low', [0, 15, 26], [25, 12], [210, 270], { unitG: 50 }),
  S('oignon', 'amaryllidaceae', 'Allium cepa', ['Oignon'], ['Onion'], 'root', 'vegetable', 'full', 'low', [5, 18, 28], [25, 10], [100, 150], { unitG: 120 }),
  S('poireau', 'amaryllidaceae', 'Allium porrum', ['Poireau'], ['Leek'], 'leaf', 'vegetable', 'full', 'medium', [2, 16, 24], [35, 15], [120, 200], { unitG: 250 }),
  S('ciboulette', 'amaryllidaceae', 'Allium schoenoprasum', ['Ciboulette'], ['Chives'], 'perennial', 'herbs', 'partial', 'medium', [-10, 16, 28], [25, 20], [60, 90], { perennial: true }),
  S('courgette', 'cucurbitaceae', 'Cucurbita pepo', ['Courgette'], ['Zucchini'], 'fruit', 'vegetable', 'full', 'high', [12, 24, 32], [100, 100], [50, 90], { unitG: 300 }),
  S('courge', 'cucurbitaceae', 'Cucurbita maxima', ['Courge', 'Potiron'], ['Squash', 'Pumpkin'], 'fruit', 'vegetable', 'full', 'high', [12, 24, 32], [150, 120], [100, 140], { unitG: 3000 }),
  S('concombre', 'cucurbitaceae', 'Cucumis sativus', ['Concombre'], ['Cucumber'], 'fruit', 'vegetable', 'full', 'high', [14, 25, 32], [100, 50], [55, 80], { unitG: 350 }),
  S('melon', 'cucurbitaceae', 'Cucumis melo', ['Melon'], ['Melon'], 'fruit', 'fruit', 'full', 'medium', [15, 27, 35], [100, 80], [80, 110], { unitG: 1000 }),
  S('carotte', 'apiaceae', 'Daucus carota', ['Carotte'], ['Carrot'], 'root', 'vegetable', 'full', 'medium', [5, 18, 26], [25, 5], [70, 100], { unitG: 80 }),
  S('persil', 'apiaceae', 'Petroselinum crispum', ['Persil'], ['Parsley'], 'leaf', 'herbs', 'partial', 'medium', [4, 18, 26], [25, 15], [70, 90]),
  S('celeri', 'apiaceae', 'Apium graveolens', ['Céleri'], ['Celery'], 'leaf', 'vegetable', 'partial', 'high', [7, 18, 25], [40, 30], [120, 150], { unitG: 800 }),
  S('fenouil', 'apiaceae', 'Foeniculum vulgare', ['Fenouil'], ['Fennel'], 'leaf', 'vegetable', 'full', 'medium', [6, 18, 26], [40, 25], [80, 110], { unitG: 300 }),
  S('haricot', 'fabaceae', 'Phaseolus vulgaris', ['Haricot'], ['Bean'], 'fruit', 'vegetable', 'full', 'medium', [12, 22, 30], [45, 8], [55, 90]),
  S('pois', 'fabaceae', 'Pisum sativum', ['Pois', 'Petit pois'], ['Pea'], 'fruit', 'vegetable', 'full', 'medium', [4, 16, 24], [50, 5], [60, 90]),
  S('betterave', 'amaranthaceae', 'Beta vulgaris', ['Betterave'], ['Beetroot'], 'root', 'vegetable', 'full', 'medium', [6, 18, 26], [30, 10], [60, 100], { unitG: 200 }),
  S('blette', 'amaranthaceae', 'Beta vulgaris subsp. vulgaris', ['Blette', 'Bette'], ['Chard'], 'leaf', 'vegetable', 'partial', 'medium', [5, 18, 26], [40, 30], [55, 80]),
  S('epinard', 'amaranthaceae', 'Spinacia oleracea', ['Épinard'], ['Spinach'], 'leaf', 'vegetable', 'partial', 'medium', [2, 15, 22], [30, 10], [40, 60]),
  S('laitue', 'asteraceae', 'Lactuca sativa', ['Laitue', 'Salade'], ['Lettuce'], 'leaf', 'vegetable', 'partial', 'medium', [4, 16, 24], [30, 25], [45, 75], { unitG: 400 }),
  S('artichaut', 'asteraceae', 'Cynara cardunculus var. scolymus', ['Artichaut'], ['Artichoke'], 'perennial', 'vegetable', 'full', 'medium', [-5, 18, 28], [100, 90], [150, 210], { perennial: true, unitG: 300 }),
  S('mais', 'poaceae', 'Zea mays', ['Maïs'], ['Corn'], 'fruit', 'vegetable', 'full', 'medium', [10, 24, 32], [70, 30], [80, 110], { unitG: 250 }),
  S('basilic', 'lamiaceae', 'Ocimum basilicum', ['Basilic'], ['Basil'], 'leaf', 'herbs', 'full', 'medium', [12, 24, 32], [30, 25], [50, 80]),
  S('menthe', 'lamiaceae', 'Mentha spicata', ['Menthe'], ['Mint'], 'perennial', 'herbs', 'partial', 'high', [-15, 18, 28], [40, 40], [60, 90], { perennial: true }),
  S('thym', 'lamiaceae', 'Thymus vulgaris', ['Thym'], ['Thyme'], 'perennial', 'herbs', 'full', 'low', [-15, 20, 32], [30, 30], [90, 120], { perennial: true }),
  S('romarin', 'lamiaceae', 'Salvia rosmarinus', ['Romarin'], ['Rosemary'], 'perennial', 'herbs', 'full', 'low', [-10, 20, 32], [60, 60], [120, 180], { perennial: true }),
  S('fraisier', 'rosaceae', 'Fragaria × ananassa', ['Fraisier', 'Fraise'], ['Strawberry'], 'perennial', 'fruit', 'full', 'medium', [-10, 18, 28], [40, 30], [60, 90], { perennial: true, unitG: 15 }),
  S('framboisier', 'rosaceae', 'Rubus idaeus', ['Framboisier', 'Framboise'], ['Raspberry'], 'perennial', 'fruit', 'partial', 'medium', [-20, 18, 28], [150, 50], [90, 120], { perennial: true, unitG: 4 }),
  S('pommier', 'rosaceae', 'Malus domestica', ['Pommier', 'Pomme'], ['Apple tree'], 'tree', 'fruit', 'full', 'medium', [-25, 18, 30], [500, 400], [120, 180], { perennial: true, unitG: 180 }),
  S('poirier', 'rosaceae', 'Pyrus communis', ['Poirier', 'Poire'], ['Pear tree'], 'tree', 'fruit', 'full', 'medium', [-25, 18, 30], [500, 400], [120, 180], { perennial: true, unitG: 180 }),
  S('groseillier', 'grossulariaceae', 'Ribes rubrum', ['Groseillier', 'Groseille'], ['Redcurrant'], 'perennial', 'fruit', 'partial', 'medium', [-25, 16, 28], [150, 120], [90, 120], { perennial: true }),
  S('rhubarbe', 'polygonaceae', 'Rheum rhabarbarum', ['Rhubarbe'], ['Rhubarb'], 'perennial', 'vegetable', 'partial', 'high', [-20, 16, 26], [100, 100], [60, 90], { perennial: true }),
  S('mache', 'caprifoliaceae', 'Valerianella locusta', ['Mâche'], ['Lamb\'s lettuce'], 'leaf', 'vegetable', 'partial', 'medium', [-5, 12, 20], [15, 8], [60, 90]),
  S('souci', 'asteraceae', 'Calendula officinalis', ['Souci'], ['Marigold'], 'flower', 'flowers', 'full', 'low', [2, 18, 28], [30, 25], [50, 70]),
  S('tournesol', 'asteraceae', 'Helianthus annuus', ['Tournesol'], ['Sunflower'], 'flower', 'flowers', 'full', 'low', [8, 24, 32], [60, 40], [70, 100]),
  S('cosmos', 'asteraceae', 'Cosmos bipinnatus', ['Cosmos'], ['Cosmos'], 'flower', 'flowers', 'full', 'low', [8, 22, 30], [40, 30], [60, 90]),
  S('capucine', 'tropaeolaceae', 'Tropaeolum majus', ['Capucine'], ['Nasturtium'], 'flower', 'flowers', 'full', 'low', [8, 20, 30], [40, 30], [50, 70]),
  S('bourrache', 'boraginaceae', 'Borago officinalis', ['Bourrache'], ['Borage'], 'flower', 'flowers', 'full', 'low', [4, 18, 28], [50, 40], [50, 70]),
  S('phacelie', 'hydrophyllaceae', 'Phacelia tanacetifolia', ['Phacélie'], ['Phacelia'], 'flower', 'flowers', 'full', 'low', [2, 16, 26], [20, 5], [45, 70], { greenManure: true }),
];

// variétés : [espèce, nom, origine]
export const VARIETIES: [string, string, 'commercial' | 'local' | 'peasant'][] = [
  ['tomate', 'Cœur de bœuf', 'commercial'], ['tomate', 'Marmande', 'commercial'], ['tomate', 'Noire de Crimée', 'peasant'],
  ['tomate', 'Cerise rouge', 'commercial'], ['tomate', 'Saint-Pierre', 'commercial'], ['tomate', 'Ananas', 'peasant'],
  ['aubergine', 'Black Beauty', 'commercial'], ['aubergine', 'Violette de Florence', 'commercial'],
  ['poivron', 'Corno di toro', 'commercial'], ['poivron', 'Doux d\'Espagne', 'commercial'], ['poivron', 'Piment d\'Espelette', 'local'],
  ['pomme-de-terre', 'Bintje', 'commercial'], ['pomme-de-terre', 'Charlotte', 'commercial'], ['pomme-de-terre', 'Ratte', 'commercial'], ['pomme-de-terre', 'Vitelotte', 'peasant'],
  ['chou', 'Cœur de bœuf des vertus', 'commercial'], ['chou', 'Milan de Pontoise', 'commercial'], ['chou', 'Rouge Tête Noire', 'commercial'],
  ['kale', 'Nero di Toscana', 'commercial'], ['kale', 'Red Russian', 'commercial'],
  ['radis', 'Rond rouge', 'commercial'], ['radis', 'Flamboyant', 'commercial'], ['radis', 'Noir long d\'hiver', 'commercial'],
  ['ail', 'Blanc de Lomagne', 'local'], ['ail', 'Rose de Lautrec', 'local'],
  ['oignon', 'Jaune paille des vertus', 'commercial'], ['oignon', 'Rouge de Brunswick', 'commercial'], ['oignon', 'Blanc de Paris', 'commercial'],
  ['poireau', 'Bleu de Solaise', 'commercial'], ['poireau', 'Monstrueux de Carentan', 'commercial'],
  ['courgette', 'Verte des maraîchers', 'commercial'], ['courgette', 'Ronde de Nice', 'commercial'], ['courgette', 'Gold Rush', 'commercial'],
  ['courge', 'Potimarron', 'commercial'], ['courge', 'Butternut', 'commercial'], ['courge', 'Musquée de Provence', 'local'],
  ['concombre', 'Marketmore', 'commercial'], ['concombre', 'Le généreux', 'commercial'],
  ['melon', 'Charentais', 'commercial'], ['melon', 'Petit gris de Rennes', 'local'],
  ['carotte', 'Nantaise', 'commercial'], ['carotte', 'Chantenay', 'commercial'], ['carotte', 'Jaune du Doubs', 'local'], ['carotte', 'Touchon', 'commercial'],
  ['persil', 'Géant d\'Italie', 'commercial'], ['persil', 'Frisé', 'commercial'],
  ['celeri', 'Plein blanc doré', 'commercial'], ['fenouil', 'Di Firenze', 'commercial'],
  ['haricot', 'Contender', 'commercial'], ['haricot', 'Coco de Paimpol', 'local'], ['haricot', 'Beurre de Rocquencourt', 'commercial'], ['haricot', 'Mangetout à rames', 'commercial'],
  ['pois', 'Kelvedon Wonder', 'commercial'], ['pois', 'Mangetout carouby', 'commercial'],
  ['betterave', 'Crapaudine', 'peasant'], ['betterave', 'Chioggia', 'commercial'], ['betterave', 'Detroit', 'commercial'],
  ['blette', 'Verte à carde blanche', 'commercial'], ['blette', 'Bright Lights', 'commercial'],
  ['epinard', 'Géant d\'hiver', 'commercial'], ['epinard', 'Matador', 'commercial'],
  ['laitue', 'Batavia blonde', 'commercial'], ['laitue', 'Feuille de chêne', 'commercial'], ['laitue', 'Merveille des quatre saisons', 'commercial'], ['laitue', 'Romaine', 'commercial'],
  ['artichaut', 'Gros vert de Laon', 'local'], ['mais', 'Golden Bantam', 'commercial'],
  ['basilic', 'Grand vert', 'commercial'], ['basilic', 'Pourpre', 'commercial'], ['basilic', 'Thaï', 'commercial'],
  ['menthe', 'Verte', 'commercial'], ['thym', 'Commun', 'commercial'], ['romarin', 'Officinal', 'commercial'],
  ['fraisier', 'Gariguette', 'commercial'], ['fraisier', 'Mara des bois', 'commercial'], ['fraisier', 'Charlotte', 'commercial'],
  ['framboisier', 'Heritage', 'commercial'], ['framboisier', 'Malling Promise', 'commercial'],
  ['pommier', 'Reinette grise du Canada', 'commercial'], ['pommier', 'Boskoop', 'commercial'], ['poirier', 'Conférence', 'commercial'], ['poirier', 'Williams', 'commercial'],
  ['groseillier', 'Junifer', 'commercial'], ['rhubarbe', 'Victoria', 'commercial'],
  ['mache', 'Verte de Cambrai', 'commercial'], ['mache', 'Coquille de Louviers', 'local'],
  ['souci', 'Officinal', 'commercial'], ['tournesol', 'Géant', 'commercial'], ['cosmos', 'Sensation', 'commercial'],
  ['capucine', 'Naine variée', 'commercial'], ['bourrache', 'Officinale', 'commercial'], ['phacelie', 'Commune', 'commercial'],
];

// associations : [espèce A, espèce B, effet]
export const COMPANIONS: [string, string, 'favorable' | 'unfavorable'][] = [
  ['tomate', 'basilic', 'favorable'], ['tomate', 'carotte', 'favorable'], ['tomate', 'persil', 'favorable'], ['tomate', 'souci', 'favorable'],
  ['tomate', 'capucine', 'favorable'], ['tomate', 'poireau', 'favorable'], ['tomate', 'pomme-de-terre', 'unfavorable'], ['tomate', 'fenouil', 'unfavorable'],
  ['tomate', 'chou', 'unfavorable'], ['carotte', 'poireau', 'favorable'], ['carotte', 'oignon', 'favorable'], ['carotte', 'radis', 'favorable'],
  ['carotte', 'laitue', 'favorable'], ['haricot', 'oignon', 'unfavorable'], ['haricot', 'ail', 'unfavorable'], ['haricot', 'poireau', 'unfavorable'],
  ['haricot', 'mais', 'favorable'], ['haricot', 'courge', 'favorable'], ['mais', 'courge', 'favorable'], ['haricot', 'pomme-de-terre', 'favorable'],
  ['pois', 'oignon', 'unfavorable'], ['pois', 'ail', 'unfavorable'], ['pois', 'carotte', 'favorable'], ['pois', 'radis', 'favorable'],
  ['chou', 'celeri', 'favorable'], ['chou', 'betterave', 'favorable'], ['chou', 'fraisier', 'unfavorable'], ['laitue', 'radis', 'favorable'],
  ['laitue', 'fraisier', 'favorable'], ['fraisier', 'ail', 'favorable'], ['fraisier', 'epinard', 'favorable'], ['courgette', 'capucine', 'favorable'],
  ['courgette', 'pomme-de-terre', 'unfavorable'], ['concombre', 'pomme-de-terre', 'unfavorable'], ['concombre', 'tournesol', 'favorable'],
  ['pomme-de-terre', 'tournesol', 'unfavorable'], ['betterave', 'oignon', 'favorable'], ['epinard', 'radis', 'favorable'], ['blette', 'haricot', 'favorable'],
  ['aubergine', 'haricot', 'favorable'], ['poivron', 'basilic', 'favorable'], ['fenouil', 'haricot', 'unfavorable'], ['bourrache', 'fraisier', 'favorable'],
  ['bourrache', 'courgette', 'favorable'], ['phacelie', 'courge', 'favorable'], ['ciboulette', 'carotte', 'favorable'], ['menthe', 'chou', 'favorable'],
  ['thym', 'chou', 'favorable'], ['romarin', 'carotte', 'favorable'], ['mache', 'poireau', 'favorable'],
];

// calendriers de référence, climat tempéré (groupe Köppen C), plein air : [espèce, méthode, étape, début (jour de l'année), fin]
export const CALENDARS: [string, Method, Stage, number, number][] = [
  ['tomate', 'tray_sowing', 'sowing', 60, 105], ['tomate', 'tray_sowing', 'planting', 135, 166], ['tomate', 'bought_plants', 'planting', 135, 175],
  ['aubergine', 'tray_sowing', 'sowing', 45, 90], ['aubergine', 'bought_plants', 'planting', 140, 170],
  ['poivron', 'tray_sowing', 'sowing', 45, 90], ['poivron', 'bought_plants', 'planting', 140, 170],
  ['pomme-de-terre', 'bulb_tuber', 'planting', 90, 135], ['chou', 'tray_sowing', 'sowing', 75, 150], ['chou', 'bought_plants', 'planting', 105, 200],
  ['kale', 'direct_sowing', 'sowing', 105, 180], ['radis', 'direct_sowing', 'sowing', 60, 260], ['ail', 'bulb_tuber', 'planting', 290, 345],
  ['oignon', 'bulb_tuber', 'planting', 60, 110], ['oignon', 'direct_sowing', 'sowing', 60, 100], ['poireau', 'tray_sowing', 'sowing', 45, 110],
  ['poireau', 'bought_plants', 'planting', 135, 200], ['courgette', 'tray_sowing', 'sowing', 100, 135], ['courgette', 'direct_sowing', 'sowing', 135, 165],
  ['courgette', 'bought_plants', 'planting', 135, 175], ['courge', 'tray_sowing', 'sowing', 100, 135], ['courge', 'direct_sowing', 'sowing', 135, 160],
  ['concombre', 'tray_sowing', 'sowing', 100, 135], ['melon', 'tray_sowing', 'sowing', 100, 125], ['carotte', 'direct_sowing', 'sowing', 75, 190],
  ['persil', 'direct_sowing', 'sowing', 75, 200], ['haricot', 'direct_sowing', 'sowing', 130, 200], ['pois', 'direct_sowing', 'sowing', 45, 120],
  ['betterave', 'direct_sowing', 'sowing', 100, 180], ['blette', 'direct_sowing', 'sowing', 100, 190], ['epinard', 'direct_sowing', 'sowing', 60, 110],
  ['epinard', 'direct_sowing', 'harvest_start', 100, 150], ['laitue', 'direct_sowing', 'sowing', 60, 240], ['laitue', 'bought_plants', 'planting', 75, 260],
  ['mais', 'direct_sowing', 'sowing', 125, 160], ['basilic', 'tray_sowing', 'sowing', 90, 140], ['fraisier', 'bought_plants', 'planting', 230, 280],
  ['mache', 'direct_sowing', 'sowing', 210, 275], ['phacelie', 'direct_sowing', 'sowing', 90, 250], ['souci', 'direct_sowing', 'sowing', 75, 160],
];

export const PROBLEMS: [string, 'disease' | 'pest' | 'climate' | 'soil' | 'other'][] = [
  ['mildew', 'disease'], ['powdery_mildew', 'disease'], ['rust', 'disease'], ['grey_mould', 'disease'], ['early_blight', 'disease'],
  ['damping_off', 'disease'], ['blossom_end_rot', 'disease'], ['aphids', 'pest'], ['slugs', 'pest'], ['colorado_beetle', 'pest'],
  ['flea_beetles', 'pest'], ['cabbage_white', 'pest'], ['carrot_fly', 'pest'], ['leek_moth', 'pest'], ['wireworms', 'pest'],
  ['spider_mites', 'pest'], ['whiteflies', 'pest'], ['birds', 'pest'], ['frost', 'climate'], ['drought', 'climate'],
  ['hail', 'climate'], ['heatwave', 'climate'], ['deficiency', 'soil'], ['other', 'other'],
];
