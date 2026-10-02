import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { LinkButton } from '@/components/ui/Button';
import { Badge, Card, Muted, PageHeader, Row, Stack } from '@/components/ui/Layout';
import { achievementsOf } from '@/features/progression/achievements';
import { nextLevelAt, skillLevelOf } from '@/features/progression/rules.pure';
import { progressOf } from '@/features/progression/service';
import { OptOutToggle } from '@/features/progression/ui/OptOutToggle';
import { SKILL_DOMAINS } from '@/lib/enums';
import { requireUser } from '@/server/auth/session';
import { appClock } from '@/server/clock';
import { db } from '@/server/db/client';

export async function generateMetadata() {
  return { title: (await getTranslations('profile'))('title') };
}

/** Mon profil (PAGES.md §6) : niveau, compétences, succès récents ; l'avatar arrive au lot 8. */
export default async function ProfilePage() {
  const u = await requireUser();
  const t = await getTranslations('profile');
  const ts = await getTranslations('skills');
  const ta = await getTranslations('achievements');
  const f = await getFormatter();
  const [p, achievements] = await Promise.all([progressOf(db(), u.id), achievementsOf(db(), u.id, appClock().now())]);
  const recent = achievements.filter((a) => a.earnedAt).sort((a, b) => (b.earnedAt?.getTime() ?? 0) - (a.earnedAt?.getTime() ?? 0)).slice(0, 3);
  return (
    <Stack gap="lg">
      <PageHeader title={u.pseudo ?? u.name} actions={<LinkButton variant="secondary" href="/app/parametres/compte">{t('settings')}</LinkButton>} />
      <Card>
        <Stack gap="sm">
          <Row><Badge data-testid="profile-level">{t('level', { level: p.level })}</Badge><strong data-testid="profile-xp">{t('xp', { xp: p.totalXp })}</strong></Row>
          <Muted>{t('next', { xp: Math.max(0, nextLevelAt(p.level) - p.totalXp), level: p.level + 1 })}</Muted>
        </Stack>
      </Card>
      <Card>
        <h2>{t('skills')}</h2>
        <ul data-testid="profile-skills">
          {SKILL_DOMAINS.filter((s) => (p.skills[s] ?? 0) > 0).map((s) => <li key={s}>{ts(s)} · {t('skillLevel', { level: skillLevelOf(p.skills[s] ?? 0) })} · {t('xp', { xp: p.skills[s] ?? 0 })}</li>)}
        </ul>
      </Card>
      <Card>
        <h2>{t('recent')}</h2>
        {recent.length === 0 ? <Muted>{t('noAchievement')}</Muted> : (
          <ul>{recent.map((a) => <li key={a.code}>{ta(a.code)} · {t('earnedOn', { date: f.dateTime(a.earnedAt ?? new Date(0), { dateStyle: 'medium' }) })}</li>)}</ul>
        )}
      </Card>
      <Row>
        <Link href="/app/profil/xp">{t('seeXp')}</Link>
        <Link href="/app/profil/succes">{t('seeAchievements')}</Link>
        <Link href="/app/profil/quetes">{t('seeQuests')}</Link>
      </Row>
      <OptOutToggle initial={p.leaderboardOptOut} />
    </Stack>
  );
}
