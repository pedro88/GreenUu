'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition, type ReactNode } from 'react';
import { Alert } from '@/components/ui/Alert';
import { NativeSelect } from '@/components/ui/Field';
import type { TicketStatus } from '@/lib/enums';
import { transitionTicketAction } from '../actions';
import styles from './Ticket.module.scss';

const COLUMNS = ['todo', 'in_progress', 'blocked', 'done'] as const;
type Column = (typeof COLUMNS)[number];

/**
 * Kanban (RG-TCK-12) : glisser-déposer = transition. Si elle est refusée, la carte reste à sa place
 * avec un message (TCK-10). Un menu « Déplacer vers » offre la même action au clavier et au tactile.
 */
export function KanbanBoard({ gardenId, items }: { gardenId: string; items: { id: string; status: TicketStatus; node: ReactNode }[] }) {
  const t = useTranslations('tickets');
  const ts = useTranslations('ticketStatus');
  const router = useRouter();
  const [local, setLocal] = useState(items);
  const [over, setOver] = useState<Column | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const move = (id: string, to: Column) => {
    const card = local.find((i) => i.id === id);
    if (!card || card.status === to) return;
    const previous = local;
    setError(null);
    setLocal(local.map((i) => (i.id === id ? { ...i, status: to } : i)));
    start(async () => {
      const r = await transitionTicketAction({ gardenId, ticketId: id, status: to });
      if (!r.ok) {
        setLocal(previous);
        setError(r.error.fieldErrors?.status ? t('transitionRefused') : t('moveFailed'));
      } else router.refresh();
    });
  };

  return (
    <>
      {error ? <Alert tone="danger"><span data-testid="kanban-error">{error}</span></Alert> : null}
      <div className={styles.board} data-testid="kanban">
        {COLUMNS.map((col) => (
          <section key={col} className={styles.column} data-over={over === col} data-testid={`column-${col}`} aria-label={ts(col)}
            onDragOver={(e) => { e.preventDefault(); setOver(col); }} onDragLeave={() => setOver(null)}
            onDrop={(e) => { e.preventDefault(); setOver(null); move(e.dataTransfer.getData('text/plain'), col); }}>
            <h2 className={styles.columnTitle}>{ts(col)}</h2>
            {local.filter((i) => i.status === col || (col === 'done' && (i.status === 'cancelled' || i.status === 'skipped'))).map((i) => (
              <div key={i.id} draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', i.id); e.dataTransfer.effectAllowed = 'move'; }} data-testid={`card-${i.id}`}>
                {i.node}
                <label className="visually-hidden" htmlFor={`move-${i.id}`}>{t('moveTo')}</label>
                <NativeSelect id={`move-${i.id}`} value={COLUMNS.find((c) => c === i.status) ?? 'done'} onChange={(e) => {
                  const to = COLUMNS.find((c) => c === e.target.value);
                  if (to) move(i.id, to);
                }}>
                  {COLUMNS.map((c) => <option key={c} value={c}>{t('moveToStatus', { status: ts(c) })}</option>)}
                </NativeSelect>
              </div>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
