import clsx from 'clsx';
import type { ComponentProps, ReactNode } from 'react';
import styles from './Layout.module.scss';

export function Stack({ gap = 'md', className, ...rest }: { gap?: 'sm' | 'md' | 'lg' } & ComponentProps<'div'>) {
  return <div className={clsx(styles.stack, gap === 'sm' && styles.stackSm, gap === 'lg' && styles.stackLg, className)} {...rest} />;
}

export function Row({ className, ...rest }: ComponentProps<'div'>) {
  return <div className={clsx(styles.row, className)} {...rest} />;
}

export function Card({ className, ...rest }: ComponentProps<'section'>) {
  return <section className={clsx(styles.card, className)} {...rest} />;
}

export function Grid({ className, ...rest }: ComponentProps<'div'>) {
  return <div className={clsx(styles.grid, className)} {...rest} />;
}

export function Badge({ children, ...rest }: { children: ReactNode } & ComponentProps<'span'>) {
  return <span className={styles.badge} {...rest}>{children}</span>;
}

export function Muted({ className, ...rest }: ComponentProps<'p'>) {
  return <p className={clsx(styles.muted, className)} {...rest} />;
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className={styles.pageHeader}>
      <div>
        <h1>{title}</h1>
        {subtitle ? <p className={styles.muted}>{subtitle}</p> : null}
      </div>
      {actions ? <div className={styles.row}>{actions}</div> : null}
    </header>
  );
}

export function Narrow({ className, ...rest }: ComponentProps<'div'>) {
  return <div className={clsx(styles.narrow, className)} {...rest} />;
}
