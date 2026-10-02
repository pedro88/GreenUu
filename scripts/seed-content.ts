import { eq } from 'drizzle-orm';
import { forkGuide, createGuide, publishGuide, updateGuide } from '../src/features/guide/service';
import { reportContent } from '../src/features/moderation/service';
import { createTip, voteTip } from '../src/features/tip/service';
import type { GuideCalendarV1 } from '../src/lib/content-types';
import type { Actor, ServiceCtx } from '../src/server/action-core';
import { fixedClock } from '../src/server/clock';
import type { Tx } from '../src/server/db/client';
import { guide, user } from '../src/server/db/schema';
import { speciesRefId } from '../src/features/plant/reference/load';

/** Guides, tips, votes et signalements du seed (SPEC §14) : 6 guides, 25 tips votés, 2 signalements ouverts. */

const TOMATO_CALENDAR: GuideCalendarV1 = {
  v: 1, anchor: 'sowing',
  stages: [{ stage: 'emergence', offsetDays: 8 }, { stage: 'transplanting', offsetDays: 45 }, { stage: 'planting', offsetDays: 60 }, { stage: 'harvest_start', offsetDays: 130 }],
  tasks: [
    { title: 'Tuteurer les tomates', type: 'task', relativeTo: 'planting', offsetDays: 7 },
    { title: 'Pailler le pied des tomates', type: 'task', actionTag: 'weeding', relativeTo: 'planting', offsetDays: 14 },
  ],
};

const TOMATO_BODY = `## Semis
Semer au chaud (20 °C) fin février ou début mars, en godets.

## Repiquage et plantation
Repiquer quand la première vraie feuille apparaît, planter après les saints de glace.

> Astuce : enterrer la tige jusqu'aux premières feuilles favorise l'enracinement.

## Entretien
- tuteurer dès la plantation ;
- pailler quand le sol est réchauffé ;
- arroser au pied, jamais sur les feuilles.`;

const STRAWBERRY_BODY = `Le fraisier aime un sol riche, frais et bien drainé. En climat océanique, il craint surtout la pourriture grise.

## Préparer le sol
Incorporer du compost mûr à l'automne, pailler à la paille au printemps.

> Astuce : l'ajout de compost mûr au printemps stimule la fructification.

## Renouveler
Remplacer les pieds tous les trois ans avec les stolons les plus vigoureux.`;

type TipSeed = [author: string, body: string, tags: string[], garden: string | null, species?: string];

const TIPS: TipSeed[] = [
  ['alice', 'Un voile d’hivernage double sur la mâche m’a fait gagner trois semaines de récolte.', ['hiver', 'legumes-d-hiver'], 'tilleuls', 'mache'],
  ['alice', 'Arroser les tomates le matin, au pied : moins de mildiou qu’avec un arrosage du soir.', ['tomate', 'mildiou'], 'tilleuls', 'tomate'],
  ['alice', 'Le purin d’ortie dilué à 10 % relance des courgettes jaunissantes en une semaine.', ['purin', 'courgette'], 'tilleuls', 'courgette'],
  ['bruno', 'Dans un jardin partagé, un tableau des arrosages à l’entrée évite les oublis du week-end.', ['organisation', 'arrosage'], 'canal'],
  ['bruno', 'Les fèves semées en novembre résistent mieux aux pucerons que celles de mars.', ['feve', 'pucerons'], 'canal'],
  ['bruno', 'Un composteur à trois bacs permet de retourner sans tout déplacer.', ['compost'], 'canal'],
  ['chloe', 'Pincer les gourmands des tomates une fois par semaine suffit, pas besoin de plus.', ['tomate', 'taille'], 'canal', 'tomate'],
  ['chloe', 'Le basilic se plaît au pied des tomates et éloigne une partie des aleurodes.', ['association', 'basilic'], 'canal', 'basilic'],
  ['chloe', 'Récolter les haricots tous les deux jours prolonge nettement la production.', ['haricot', 'recolte'], 'canal', 'haricot'],
  ['david', 'Des bouteilles d’eau noires dans la serre gardent la chaleur la nuit au printemps.', ['serre', 'printemps'], 'canal'],
  ['david', 'Un filet anti-insectes posé dès le semis protège les carottes de la mouche.', ['carotte', 'mouche'], 'canal', 'carotte'],
  ['david', 'Semer les radis entre les rangs de carottes marque les lignes et libère la place tôt.', ['radis', 'association'], 'canal', 'radis'],
  ['emma', 'Aérer la serre dès 25 °C : au-delà, les fleurs de poivron avortent.', ['serre', 'poivron'], 'canal', 'poivron'],
  ['emma', 'Un paillage de tonte sèche sur les fraisiers limite la pourriture des fruits.', ['fraisier', 'paillage'], 'canal', 'fraisier'],
  ['emma', 'Les godets en papier journal se plantent directement : pas de choc au repiquage.', ['semis', 'zero-dechet'], 'canal'],
  ['gaelle', 'En serre, arroser le matin et fermer le soir pour garder l’humidité au bon niveau.', ['serre', 'arrosage'], 'combes'],
  ['gaelle', 'Les concombres palissés en serre donnent des fruits plus droits et plus sains.', ['concombre', 'serre'], 'combes', 'concombre'],
  ['gaelle', 'Semer la laitue en plaque alvéolée puis repiquer : levée bien plus régulière.', ['laitue', 'semis'], 'combes', 'laitue'],
  ['gaelle', 'Un thermomètre mini-maxi dans la serre révèle les nuits trop fraîches d’avril.', ['serre', 'printemps'], 'combes'],
  ['farid', 'Planter l’ail en novembre, pas en mars : des têtes deux fois plus grosses.', ['ail', 'automne'], null, 'ail'],
  ['farid', 'Les œillets d’Inde en bordure attirent les auxiliaires dans tout le potager.', ['auxiliaires', 'fleurs'], null],
  ['alice', 'Butter les pommes de terre deux fois évite les tubercules verts.', ['pomme-de-terre'], 'tilleuls', 'pomme-de-terre'],
  ['bruno', 'La moutarde en engrais vert se fauche avant la floraison, sinon elle se ressème partout.', ['engrais-vert'], 'canal'],
  ['chloe', 'Récupérer l’eau de pluie du cabanon : 200 litres suffisent pour une semaine de juillet.', ['eau-de-pluie', 'arrosage'], 'canal'],
  ['emma', 'Les oignons se conservent mieux tressés et suspendus au sec qu’en cagette.', ['oignon', 'conservation'], 'canal', 'oignon'],
];

/** Votes (votant, index du tip, valeur) : jamais pour son propre tip. */
const VOTERS = ['alice', 'bruno', 'chloe', 'david', 'emma', 'gaelle', 'farid'];

export async function seedContent(tx: Tx, ref: Date, ids: { userId: (k: string) => string; gardenId: (k: string) => string }) {
  const [existing] = await tx.select({ id: guide.id }).from(guide).where(eq(guide.authorId, ids.userId('alice'))).limit(1);
  if (existing) return;
  const ctx = async (key: string, offsetDays = 0): Promise<ServiceCtx> => ({
    tx, actor: await actorOf(tx, ids.userId(key)), clock: fixedClock(new Date(ref.getTime() + offsetDays * 86_400_000)), jobs: { enqueue: async () => undefined }, appUrl: '',
  });

  // 1. Guide public avec calendrier type, publié deux fois (historique et comparaison).
  const { guideId: tomato } = await createGuide(await ctx('alice', -60), {
    speciesId: speciesRefId('tomate'), visibility: 'public',
    draft: { title: 'Tomates en climat océanique', bodyMd: TOMATO_BODY, context: { v: 1, koppen: ['Cfb'], environments: ['open_air'] }, calendarTemplate: TOMATO_CALENDAR },
  });
  await publishGuide(await ctx('alice', -60), tomato);
  await updateGuide(await ctx('alice', -20), {
    guideId: tomato, visibility: 'public',
    draft: { title: 'Tomates en climat océanique', bodyMd: `${TOMATO_BODY}\n- effeuiller le bas des pieds en août.`, context: { v: 1, koppen: ['Cfb', 'Cfa'], environments: ['open_air'] }, calendarTemplate: TOMATO_CALENDAR, changeNote: 'Effeuillage et climat Cfa' },
  });
  await publishGuide(await ctx('alice', -20), tomato);

  // 2. Guide public de la maquette, 3. fork public du guide 1.
  const { guideId: strawberry } = await createGuide(await ctx('gaelle', -40), {
    speciesId: speciesRefId('fraisier'), visibility: 'public',
    draft: { title: 'Réussir ses fraisiers en climat océanique', bodyMd: STRAWBERRY_BODY, context: { v: 1, koppen: ['Cfb'], environments: ['open_air'], practices: ['living_soil'] }, calendarTemplate: null },
  });
  await publishGuide(await ctx('gaelle', -40), strawberry);
  const { guideId: fork } = await forkGuide(await ctx('bruno', -10), tomato);
  const forked = await tx.select({ draft: guide.draft }).from(guide).where(eq(guide.id, fork));
  const forkDraft = forked[0]?.draft;
  if (forkDraft) await updateGuide(await ctx('bruno', -10), { guideId: fork, visibility: 'public', draft: { ...forkDraft, title: 'Tomates du jardin partagé', bodyMd: `${forkDraft.bodyMd}\n\nAu Canal, on partage les plants en surplus à la grainothèque.` } });
  await publishGuide(await ctx('bruno', -10), fork);

  // 4. Non listé, 5. privé au Canal, 6. public en serre.
  const { guideId: unlisted } = await createGuide(await ctx('chloe', -30), {
    speciesId: speciesRefId('carotte'), visibility: 'unlisted',
    draft: { title: 'Carottes en bac sur le balcon', bodyMd: 'Un bac de 30 cm de profondeur, un terreau léger et sableux, un semis clair.', context: { v: 1, environments: ['balcony_roof'] }, calendarTemplate: null },
  });
  await publishGuide(await ctx('chloe', -30), unlisted);
  const { guideId: privateGuide } = await createGuide(await ctx('bruno', -25), {
    speciesId: speciesRefId('courgette'), visibility: 'private', gardenId: ids.gardenId('canal'),
    draft: { title: 'Courgettes de la parcelle A', bodyMd: 'Deux pieds suffisent pour la parcelle A ; récolter à 20 cm.', context: { v: 1 }, calendarTemplate: null },
  });
  await publishGuide(await ctx('bruno', -25), privateGuide);
  const { guideId: basil } = await createGuide(await ctx('emma', -15), {
    speciesId: speciesRefId('basilic'), visibility: 'public',
    draft: { title: 'Basilic en serre froide', bodyMd: 'Semer en avril, pincer les têtes avant la floraison, arroser au pied.', context: { v: 1, environments: ['greenhouse'] }, calendarTemplate: null },
  });
  await publishGuide(await ctx('emma', -15), basil);

  // Tips, puis votes déterministes (25 tips, chacun voté par 1 à 4 personnes).
  const tipIds: { id: string; author: string }[] = [];
  for (const [i, [author, body, tags, gardenKey, speciesCode]] of TIPS.entries()) {
    const { tipId } = await createTip(await ctx(author, -30 + i), {
      body, tags, ...(gardenKey ? { contextGardenId: ids.gardenId(gardenKey) } : {}), ...(speciesCode ? { speciesId: speciesRefId(speciesCode) } : {}),
    });
    tipIds.push({ id: tipId, author });
  }
  for (const [i, t] of tipIds.entries()) {
    const voters = VOTERS.filter((v) => v !== t.author).slice(0, 1 + (i % 4));
    for (const [j, v] of voters.entries()) await voteTip(await ctx(v, -5), t.id, (i + j) % 5 === 4 ? -1 : 1);
  }

  // Deux signalements ouverts (sous le seuil de masquage).
  const farid = tipIds.find((t) => t.author === 'farid');
  if (farid) await reportContent(await ctx('david', -2), { target: { kind: 'tip', id: farid.id }, reason: 'inaccurate_or_dangerous', details: 'Date de plantation discutable selon les régions.' });
  await reportContent(await ctx('chloe', -1), { target: { kind: 'guide', id: basil }, reason: 'copyright', details: 'Texte peut-être repris d’un catalogue.' });
}

async function actorOf(tx: Tx, id: string): Promise<Actor> {
  const [u] = await tx.select().from(user).where(eq(user.id, id)).limit(1);
  if (!u) throw new Error(`seed : utilisateur ${id} manquant`);
  return { id, email: u.email, name: u.name, emailVerified: u.emailVerified, platformRole: u.platformRole, timezone: 'Europe/Brussels' };
}
