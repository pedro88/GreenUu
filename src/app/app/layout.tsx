import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AppNav } from '@/components/layout/AppNav';
import styles from '@/components/layout/AppShell.module.scss';
import { PixelIcon } from '@/components/ui/PlantIcon';
import { requireUser } from '@/server/auth/session';
import { db } from '@/server/db/client';
import { unreadCount } from '@/features/notification/service';

function NotificationBell({ count, label }: { count: number; label: string }) {
  return (
    <Link href="/app/notifications" className={styles.bell} aria-label={`${label} (${count})`} data-testid="bell">
      <PixelIcon name="ui/notification" size={32} />
      {count > 0 ? <span className={styles.bellCount} data-testid="bell-count">{count}</span> : null}
    </Link>
  );
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const u = await requireUser();
  const t = await getTranslations('nav');
  const unread = await unreadCount(db(), u.id);
  return (
    <div className={styles.shell}>
      <a href="#contenu" className={styles.skip}>{t('skip')}</a>
      <header className={styles.topbar}>
        <Link href="/app" className={styles.brand}><PixelIcon name="ui/action-planter" size={32} />{t('brand')}</Link>
        <AppNav variant="top" />
        <NotificationBell count={unread} label={t('notifications')} />
      </header>
      <main id="contenu" className={styles.main}>{children}</main>
      <AppNav variant="bottom" />
    </div>
  );
}
