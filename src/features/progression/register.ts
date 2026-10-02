import { onEmit } from '@/server/events/emit';
import { awardAchievements } from './achievements';
import { questsOnEvent } from './quests';
import { onXpProcessed, processEvent } from './service';

/**
 * Branche le moteur d'XP sur `emit` (abonné synchrone, dans la transaction de l'action). À importer par chaque point
 * d'entrée qui émet des événements : actions Next, worker, tests d'intégration. Un événement émis ailleurs est rattrapé
 * par `xp:recompute`.
 */
onEmit(processEvent);

/** Après l'XP : avancement des quêtes, puis succès des utilisateurs touchés (§8.5, §8.6). */
onXpProcessed(async (tx, users, e) => {
  if (e.type === 'achievement.earned' || e.type === 'quest.completed') return;
  await questsOnEvent(tx, e);
  for (const u of users) await awardAchievements(tx, u, e.gardenId, e.occurredAt);
});
