'use client';

import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Muted, Row, Stack } from '@/components/ui/Layout';
import { useAction } from '@/components/ui/useAction';
import { tDynamic } from '@/i18n/dynamic';
import { markAllReadAction, markReadAction } from '../actions';

type Item = { id: string; type: string; payload: { title?: string; url?: string; actorName?: string; excerpt?: string }; count: number; readAt: Date | null; createdAt: Date };

export function NotificationList({ items }: { items: Item[] }) {
  const t = useTranslations('notifications');
  const tt = useTranslations('notificationTypes');
  const f = useFormatter();
  const all = useAction(markAllReadAction);
  const one = useAction(markReadAction);
  const unread = items.filter((i) => !i.readAt).length;
  return (
    <Stack>
      <Row>
        <span data-testid="unread-count">{t('unread', { count: unread })}</span>
        <Button variant="secondary" disabled={unread === 0 || all.pending} onClick={() => void all.run({})} data-testid="mark-all-read">{t('markAllRead')}</Button>
      </Row>
      {items.length === 0 ? <Muted>{t('empty')}</Muted> : (
        <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((n) => (
            <li key={n.id} data-read={n.readAt !== null}>
              <Link href={n.payload.url ?? '/app'} onClick={() => { if (!n.readAt) void one.run({ notificationId: n.id }); }} style={{ fontWeight: n.readAt ? 400 : 800 }}>
                {tDynamic(tt, n.type, n.type)}{n.count > 1 ? ` (${n.count})` : ''} — {n.payload.title}
              </Link>
              <br />
              <small>{n.payload.actorName ? `${n.payload.actorName} · ` : ''}{f.relativeTime(n.createdAt)}</small>
            </li>
          ))}
        </ul>
      )}
    </Stack>
  );
}
