import clsx from 'clsx';
import Link from 'next/link';
import type { ComponentProps } from 'react';
import styles from './Button.module.scss';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Common = { variant?: Variant; size?: 'normal' | 'large'; block?: boolean };

function classes({ variant = 'primary', size = 'normal', block = false }: Common, extra?: string) {
  return clsx(styles.button, styles[variant], size === 'large' && styles.large, block && styles.block, extra);
}

export function Button({ variant, size, block, className, type = 'button', ...rest }: Common & ComponentProps<'button'>) {
  return <button type={type} className={classes({ variant, size, block }, className)} {...rest} />;
}

export function LinkButton({ variant, size, block, className, ...rest }: Common & ComponentProps<typeof Link>) {
  return <Link className={classes({ variant, size, block }, className)} {...rest} />;
}
