import type { DiffLine } from '../rules.pure';
import styles from './Content.module.scss';

/** Diff ligne à ligne (RG-GUI-06) : ajouts et suppressions annoncés aussi par du texte masqué, pas seulement par la couleur. */
export function DiffView({ lines, addedLabel, removedLabel, testId }: { lines: DiffLine[]; addedLabel: string; removedLabel: string; testId: string }) {
  return (
    <pre className={styles.diff} data-testid={testId}>
      {lines.map((l, i) => (
        <span key={i} className={styles[l.kind]} data-kind={l.kind}>
          {l.kind === 'same' ? null : <span className="visually-hidden">{l.kind === 'added' ? addedLabel : removedLabel}</span>}
          {l.text || ' '}
        </span>
      ))}
    </pre>
  );
}
