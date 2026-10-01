'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { ActionError, ActionResult } from '@/lib/errors';

/** Appelle une Server Action et expose l'état (en cours, erreur, erreurs de champ). */
export function useAction<I, R>(action: (input: I) => Promise<ActionResult<R>>, opts: { onSuccess?: (data: R) => void; refresh?: boolean } = {}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<ActionError | null>(null);
  const router = useRouter();
  const run = (input: I) =>
    new Promise<ActionResult<R>>((resolve) => {
      startTransition(async () => {
        const result = await action(input);
        if (result.ok) {
          setError(null);
          opts.onSuccess?.(result.data);
          if (opts.refresh !== false) router.refresh();
        } else {
          setError(result.error);
        }
        resolve(result);
      });
    });
  return { run, pending, error, fieldErrors: error?.fieldErrors ?? {}, reset: () => setError(null) };
}
