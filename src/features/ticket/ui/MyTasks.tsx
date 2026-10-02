import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Muted, Stack } from '@/components/ui/Layout';
import { PixelIcon } from '@/components/ui/PlantIcon';
import type { myTasksToday } from '../queries';
import { TaskCheck } from './TaskCheck';
import { ticketIcon } from './TicketCard';
import styles from './Ticket.module.scss';
import { ticketTitle } from './ticketText';

/** Mes tâches du jour, groupées par jardin (RG-TCK-06, maquette « Aujourd'hui »). */
export async function MyTasks({ groups }: { groups: Awaited<ReturnType<typeof myTasksToday>> }) {
  const t = await getTranslations();
  if (groups.length === 0) return <Muted>{t('tickets.nothingToday')}</Muted>;
  return (
    <Stack data-testid="my-tasks">
      {groups.map((g) => (
        <section key={g.gardenId} aria-labelledby={`tasks-${g.gardenId}`}>
          <Stack gap="sm">
            <h3 id={`tasks-${g.gardenId}`}>{g.gardenName}</h3>
            <ul className={styles.list}>
              {g.tasks.map((task) => (
                <li key={task.id} className={styles.task} data-testid={`my-task-${task.id}`} data-late={task.dueOn !== null && task.dueOn < g.today}>
                  <span className={styles.icon}><PixelIcon name={ticketIcon(task)} size={32} /></span>
                  <TaskCheck gardenId={g.gardenId} ticketId={task.id} label={ticketTitle(t, task)} />
                  <Link href={`/app/jardins/${g.gardenId}/tickets/${task.id}`}>{ticketTitle(t, task)}</Link>
                  {task.dueOn !== null && task.dueOn < g.today ? <strong className={styles.lateTag}>{t('tickets.late')}</strong> : null}
                </li>
              ))}
            </ul>
          </Stack>
        </section>
      ))}
    </Stack>
  );
}
