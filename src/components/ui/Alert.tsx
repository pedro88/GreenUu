import clsx from 'clsx';
import type { ReactNode } from 'react';
import styles from './Alert.module.scss';

export function Alert({ tone = 'info', children, role }: { tone?: 'info' | 'warning' | 'danger' | 'success'; children: ReactNode; role?: 'alert' | 'status' }) {
  return <div className={clsx(styles.alert, styles[tone])} role={role ?? (tone === 'danger' ? 'alert' : 'status')}>{children}</div>;
}
