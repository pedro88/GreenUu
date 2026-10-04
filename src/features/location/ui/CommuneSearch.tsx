'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { tDynamic } from '@/i18n/dynamic';
import { searchCommunesAction } from '../actions';
import type { CommuneHit } from '../service';
import styles from './CommuneSearch.module.scss';

const DEBOUNCE_MS = 250;
const MIN_QUERY = 2;

/**
 * Recherche de commune (SPEC §12.10, LOC-01) : combobox accessible (flèches, Entrée, Échap), alimenté par la base
 * embarquée via une Server Action en lecture seule. Aucun appel à un service externe.
 */
export function CommuneSearch({ onPick }: { onPick: (c: CommuneHit) => void }) {
  const t = useTranslations('communes');
  const id = useId();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<CommuneHit[]>([]);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  /** Saisie pour laquelle des résultats sont arrivés : « aucune commune » ne s'affiche qu'après la réponse. */
  const [searched, setSearched] = useState<string | null>(null);
  const seq = useRef(0);
  // Sous 2 caractères, aucune suggestion (et aucune requête, LOC-03).
  const shown = q.trim().length >= MIN_QUERY ? hits : [];

  useEffect(() => {
    if (q.trim().length < MIN_QUERY) return undefined;
    const mine = (seq.current += 1);
    const timer = window.setTimeout(() => {
      void searchCommunesAction({ q }).then((r) => {
        // Seule la réponse à la dernière saisie compte.
        if (mine !== seq.current) return;
        setHits(r.ok ? r.data : []);
        setSearched(q);
        setActive(-1);
        setOpen(true);
      });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [q]);

  const pick = (c: CommuneHit) => {
    onPick(c);
    setQ(`${c.name} (${c.postalCode})`);
    setOpen(false);
    setHits([]);
  };
  const label = (c: CommuneHit) => `${c.name} (${c.postalCode}), ${tDynamic(t, `country_${c.countryCode}`, c.countryCode)}`;

  return (
    <div className={styles.root}>
      <label htmlFor={`${id}-input`} className={styles.label}>{t('label')}</label>
      <input id={`${id}-input`} className={styles.input} type="text" autoComplete="off" value={q} role="combobox" aria-expanded={open && shown.length > 0}
        aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined} data-testid="commune-search"
        placeholder={t('placeholder')}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && shown.length) { e.preventDefault(); setOpen(true); setActive((a) => (a + 1) % shown.length); }
          else if (e.key === 'ArrowUp' && shown.length) { e.preventDefault(); setActive((a) => (a <= 0 ? shown.length - 1 : a - 1)); }
          else if (e.key === 'Enter' && open && active >= 0 && shown[active]) { e.preventDefault(); pick(shown[active]); }
          else if (e.key === 'Escape') setOpen(false);
        }} />
      <p className={styles.hint}>{t('hint')}</p>
      {open && shown.length > 0 ? (
        <ul id={`${id}-list`} role="listbox" className={styles.list} aria-label={t('results')} data-testid="commune-results">
          {shown.map((c, i) => (
            <li key={c.id} id={`${id}-opt-${i}`} role="option" aria-selected={i === active} className={styles.option} data-testid={`commune-${c.countryCode}-${c.postalCode}`}
              onMouseDown={(e) => { e.preventDefault(); pick(c); }}>
              <span>{label(c)}</span><small>{c.region}</small>
            </li>
          ))}
        </ul>
      ) : null}
      {open && searched === q && q.trim().length >= MIN_QUERY && shown.length === 0 ? <p className={styles.hint} role="status">{t('none')}</p> : null}
    </div>
  );
}
