'use client';

import { tDynamic } from '@/i18n/dynamic';
import { useTranslations } from 'next-intl';
import { useId, type ComponentProps, type ReactNode } from 'react';
import styles from './Field.module.scss';

/** Traduit une clé de validation `tooShort?min=2` (voir src/lib/zod.ts). */
export function useValidationMessage() {
  const t = useTranslations('validation');
  return (raw: string): string => {
    const [key = 'invalid', query = ''] = raw.split('?');
    const params = Object.fromEntries(new URLSearchParams(query));
    return tDynamic(t, key, t('invalid'), params);
  };
}

type FieldProps = { label: ReactNode; hint?: ReactNode; errors?: string[] | undefined; children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby': string | undefined }) => ReactNode };

export function Field({ label, hint, errors, children }: FieldProps) {
  const id = useId();
  const msg = useValidationMessage();
  const describedBy = [hint ? `${id}-hint` : null, errors?.length ? `${id}-err` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>{label}</label>
      {hint ? <span id={`${id}-hint`} className={styles.hint}>{hint}</span> : null}
      {children({ id, 'aria-invalid': Boolean(errors?.length), 'aria-describedby': describedBy })}
      {errors?.length ? <span id={`${id}-err`} className={styles.error} role="alert">{errors.map(msg).join(' ')}</span> : null}
    </div>
  );
}

export function TextInput(props: ComponentProps<'input'>) {
  return <input className={styles.control} {...props} />;
}

export function TextArea(props: ComponentProps<'textarea'>) {
  return <textarea className={styles.control} {...props} />;
}

export function NativeSelect(props: ComponentProps<'select'>) {
  return <select className={styles.control} {...props} />;
}

export function Checkbox({ label, ...props }: { label: ReactNode } & ComponentProps<'input'>) {
  return (
    <label className={styles.checkRow}>
      <input type="checkbox" {...props} />
      <span>{label}</span>
    </label>
  );
}

/** Groupe de puces à cocher (environnements, pratiques…). */
export function ChipGroup<T extends string>({ legend, options, value, onChange, errors, name }: {
  legend: ReactNode; name: string; options: { value: T; label: string }[]; value: T[]; onChange: (v: T[]) => void; errors?: string[] | undefined;
}) {
  const msg = useValidationMessage();
  return (
    <fieldset className={styles.fieldset}>
      <legend>{legend}</legend>
      <div className={styles.chips}>
        {options.map((o) => (
          <label key={o.value} className={styles.chip}>
            <input
              type="checkbox"
              name={name}
              value={o.value}
              checked={value.includes(o.value)}
              onChange={(e) => onChange(e.target.checked ? [...value, o.value] : value.filter((v) => v !== o.value))}
            />
            {o.label}
          </label>
        ))}
      </div>
      {errors?.length ? <span className={styles.error} role="alert">{errors.map(msg).join(' ')}</span> : null}
    </fieldset>
  );
}

export { styles as fieldStyles };
