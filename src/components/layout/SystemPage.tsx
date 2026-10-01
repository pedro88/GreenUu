import type { ReactNode } from 'react';
import styles from './SystemPage.module.scss';

/** Pages 403 / 404 / erreur (maquette « Rien n'a poussé ici… »). L'illustration pixel art viendra des assets. */
export function SystemPage({ art, title, text, actions, testId }: { art: ReactNode; title: ReactNode; text: ReactNode; actions: ReactNode; testId: string }) {
  return (
    <main className={styles.page} id="contenu" data-testid={testId}>
      <div className={styles.art} aria-hidden>{art}</div>
      <h1>{title}</h1>
      <p>{text}</p>
      <div className={styles.actions}>{actions}</div>
    </main>
  );
}
