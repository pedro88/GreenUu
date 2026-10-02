import { Users } from 'lucide-react';
import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Card, Muted, Row, Stack } from '@/components/ui/Layout';
import { GroupDialog } from '@/features/group/ui/GroupDialog';
import { listGroups } from '@/features/group/service';
import { listMembers } from '@/features/member/service';
import { InviteDialog } from '@/features/member/ui/InviteDialog';
import { LeaveGarden } from '@/features/member/ui/LeaveGarden';
import { MemberRow } from '@/features/member/ui/MemberRow';
import styles from '@/features/member/ui/Members.module.scss';
import { RevokeInvitation } from '@/features/member/ui/RevokeInvitation';
import { requireGardenScope } from '@/server/page-guards';
import { assignableRoles, canManageMember } from '@/server/authz/permissions';
import { can } from '@/server/authz/scope';
import { appClock } from '@/server/clock';
import { db } from '@/server/db/client';
import { ContributionsPanel } from '@/features/progression/ui/ContributionsPanel';
import { getGarden } from '@/features/garden/service';

const TABS = ['membres', 'groupes', 'invitations', 'contributions'] as const;

export async function generateMetadata() {
  return { title: (await getTranslations('members'))('title') };
}

export default async function MembersPage({ params, searchParams }: PageProps<'/app/jardins/[jardinId]/membres'>) {
  const { jardinId } = await params;
  const sp = await searchParams;
  const tab = TABS.find((x) => x === sp.onglet) ?? 'membres';
  const scope = await requireGardenScope(jardinId);
  const t = await getTranslations('members');
  const tr = await getTranslations('roles');
  const f = await getFormatter();
  const { active, former, invitations } = await listMembers(db(), scope, appClock().now());
  const groups = await listGroups(db(), scope);
  const canInvite = can(scope, 'member:invite');
  const canGroups = can(scope, 'group:manage');
  const base = `/app/jardins/${scope.gardenId}/membres`;
  const visibleTabs = TABS.filter((x) => x !== 'invitations' || canInvite);
  const memberOptions = active.map((m) => ({ id: m.id, pseudo: m.pseudo ?? m.name }));
  return (
    <Stack gap="lg">
      <h2>{t('title')}</h2>
      <nav className={styles.tabs} aria-label={t('tabs')}>
        {visibleTabs.map((x) => <Link key={x} href={`${base}?onglet=${x}`} aria-current={tab === x ? 'page' : undefined}>{t(`tab_${x}`)}</Link>)}
      </nav>

      {tab === 'membres' ? (
        <Stack>
          <ul className={styles.list} data-testid="member-list">
            {active.map((m) => (
              <MemberRow key={m.id} gardenId={scope.gardenId} isSelf={m.userId === scope.userId}
                member={{ id: m.id, pseudo: m.pseudo ?? m.name, role: m.role }}
                assignable={[...assignableRoles(scope.role)].filter((r): r is 'admin' | 'member' | 'observer' => r !== 'owner')}
                manageable={can(scope, 'member:change_role') && canManageMember(scope.role, m.role)} />
            ))}
          </ul>
          {former.length > 0 ? <Muted>{t('formerMembers', { names: former.map((m) => m.pseudo ?? m.name).join(', ') })}</Muted> : null}
          {scope.role !== 'owner' ? <Row><LeaveGarden gardenId={scope.gardenId} /></Row> : null}
        </Stack>
      ) : null}

      {tab === 'groupes' ? (
        <Stack>
          {canGroups ? <Row><GroupDialog gardenId={scope.gardenId} members={memberOptions} /></Row> : null}
          {groups.length === 0 ? <Muted>{t('noGroups')}</Muted> : (
            <div className={styles.groupGrid} data-testid="group-list">
              {groups.map((g) => (
                <Card key={g.id} data-testid={`group-${g.name}`}>
                  <Stack gap="sm">
                    <Row><Users aria-hidden /><strong>{g.name}</strong></Row>
                    <Muted>{t('groupMembers', { count: g.memberIds.length })}</Muted>
                    <p>{g.memberIds.map((id) => memberOptions.find((m) => m.id === id)?.pseudo).filter(Boolean).join(', ')}</p>
                    {canGroups ? <GroupDialog gardenId={scope.gardenId} members={memberOptions} group={{ id: g.id, name: g.name, memberIds: g.memberIds }} /> : null}
                  </Stack>
                </Card>
              ))}
            </div>
          )}
        </Stack>
      ) : null}

      {tab === 'invitations' && canInvite ? (
        invitations.length === 0 ? <Muted>{t('noInvitations')}</Muted> : (
          <ul className={styles.list} data-testid="invitation-list">
            {invitations.map((i) => (
              <li key={i.id} className={styles.item} data-testid={`invitation-${i.email}`}>
                <span><strong>{i.email}</strong> · {tr(i.role)} · {t('expires', { date: f.dateTime(i.expiresAt, { dateStyle: 'medium' }) })}</span>
                <span className={styles.actions}><RevokeInvitation gardenId={scope.gardenId} invitationId={i.id} /></span>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === 'contributions' ? <ContributionsPanel tx={db()} scope={scope} now={appClock().now()} timezone={(await getGarden(db(), scope)).timezone} groups={groups.map((g) => ({ id: g.id, name: g.name }))} /> : null}

      {canInvite ? (
        <div className={styles.inviteBar}>
          <InviteDialog gardenId={scope.gardenId} groups={groups.map((g) => ({ id: g.id, name: g.name }))}
            roles={[...assignableRoles(scope.role)].filter((r): r is 'admin' | 'member' | 'observer' => r !== 'owner')} />
        </div>
      ) : null}
    </Stack>
  );
}
