'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import styles from './Dialog.module.scss';

/** Feuille inférieure sur mobile, modale centrée sur grand écran (primitives Radix). */
export function Dialog({ open, onOpenChange, title, description, children, trigger }: {
  open?: boolean; onOpenChange?: (open: boolean) => void; title: ReactNode; description?: ReactNode; children: ReactNode; trigger?: ReactNode;
}) {
  return (
    <RadixDialog.Root {...(open !== undefined ? { open } : {})} {...(onOpenChange ? { onOpenChange } : {})}>
      {trigger ? <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger> : null}
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={styles.overlay} />
        <RadixDialog.Content className={styles.content} {...(description ? {} : { 'aria-describedby': undefined })}>
          <RadixDialog.Title className={styles.title}>{title}</RadixDialog.Title>
          {description ? <RadixDialog.Description>{description}</RadixDialog.Description> : null}
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export function DialogActions({ children }: { children: ReactNode }) {
  return <div className={styles.actions}>{children}</div>;
}

export const DialogClose = RadixDialog.Close;
