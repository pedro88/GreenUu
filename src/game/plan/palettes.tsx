'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Field';
import { decorThumb, isFixture } from '@/features/decor/catalog';
import type { DecorCatalog } from '@/features/decor/service';
import { useUnlockLabel } from '@/features/progression/ui/unlockLabel';
import { tDynamic } from '@/i18n/dynamic';
import { TERRAIN_CELL_KINDS, type TerrainCellKind } from '@/lib/enums';
import { CELL_THUMBS, GENERIC_ZONE_THUMB, planThumbUrl, ZONE_THUMBS } from '../plan-thumbs';
import type { ZoneTypeOption } from './DimensionsForm';
import styles from '../GardenView.module.scss';

/*
 * Palettes de l'éditeur de plan (SPEC §9.7, VOC-01) : les types se choisissent par vignettes au nom lisible. Elles ne
 * gardent aucun état : l'éditeur leur passe la sélection et reçoit les choix.
 */

export type TerrainMode = 'brush' | 'rect' | 'erase' | 'pick';

/** Espaces cultivés : un type de zone par vignette. */
export function ZoneTypePalette({ zoneTypes, typeLabel, selected, disabled, onPick }: {
  zoneTypes: ZoneTypeOption[]; typeLabel: (z: ZoneTypeOption) => string; selected: string; disabled: boolean; onPick: (id: string) => void;
}) {
  const t = useTranslations('plan');
  return (
    <div className={styles.decorPalette} role="group" aria-label={t('zoneType')} data-testid="zone-types">
      <ul>
        {zoneTypes.map((z) => (
          <li key={z.id}>
            <button type="button" className={styles.decorItem} aria-pressed={selected === z.id} disabled={disabled} data-testid={`zone-type-${z.code}`} onClick={() => onPick(z.id)}>
              <img src={planThumbUrl(ZONE_THUMBS[z.code] ?? GENERIC_ZONE_THUMB)} alt="" width={32} height={32} />
              <span>{typeLabel(z)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Aménagements : outil (pinceau, rectangle, gomme, pipette), taille du pinceau et type de case. */
export function TerrainPalette({ mode, brushSize, kind, disabled, onMode, onBrushSize, onKind }: {
  mode: TerrainMode; brushSize: 1 | 2 | 3; kind: TerrainCellKind; disabled: boolean;
  onMode: (m: TerrainMode) => void; onBrushSize: (n: 1 | 2 | 3) => void; onKind: (k: TerrainCellKind) => void;
}) {
  const t = useTranslations('plan');
  const tTerrain = useTranslations('terrainKinds');
  return (
    <div className={styles.decorPalette} data-testid="terrain-palette">
      <div role="group" aria-label={t('terrainModes')} className={styles.modes}>
        {(['brush', 'rect', 'erase', 'pick'] as const).map((m) => (
          <Button key={m} variant="secondary" className={styles.tool} aria-pressed={mode === m} disabled={disabled} onClick={() => onMode(m)} data-testid={`terrain-mode-${m}`}>{t(`mode_${m}`)}</Button>
        ))}
        {mode === 'brush' ? (
          <span role="group" aria-label={t('brushSize')}>
            {([1, 2, 3] as const).map((n) => (
              <Button key={n} variant="secondary" className={styles.tool} aria-pressed={brushSize === n} disabled={disabled} onClick={() => onBrushSize(n)} data-testid={`brush-${n}`}>{t(`brush_${n}`)}</Button>
            ))}
          </span>
        ) : null}
      </div>
      <ul role="group" aria-label={t('terrainKind')}>
        {TERRAIN_CELL_KINDS.map((k) => (
          <li key={k}>
            <button type="button" className={styles.decorItem} aria-pressed={kind === k} disabled={disabled} data-testid={`terrain-kind-${k}`} onClick={() => onKind(k)}>
              <img src={planThumbUrl(CELL_THUMBS[k])} alt="" width={32} height={32} />
              <span>{tTerrain(k)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Objets : la déco (`decor:place`) et les aménagements ponctuels (`plan:edit`, PNT-07). Une vignette verrouillée reste
 * touchable : le message dit pourquoi.
 */
export function ObjectPalette({ catalog, selected, canDecor, canEdit, hint, signLabel, onSignLabel, onPick }: {
  catalog: DecorCatalog; selected: string; canDecor: boolean; canEdit: boolean; hint: string | null; signLabel: string;
  onSignLabel: (v: string) => void; onPick: (code: string, hint: string | null) => void;
}) {
  const t = useTranslations('plan');
  const tDecor = useTranslations('decor');
  const unlockLabel = useUnlockLabel();
  const groups = [{ key: 'decor', items: catalog.filter((d) => !isFixture(d.code)), allowed: canDecor }, { key: 'fixtures', items: catalog.filter((d) => isFixture(d.code)), allowed: canEdit }];
  return (
    <div className={styles.decorPalette} role="group" aria-label={tDecor('paletteLabel')} data-testid="decor-palette">
      {groups.map((group) => (
        <section key={group.key} aria-label={group.key === 'fixtures' ? t('fixturesTitle') : tDecor('paletteLabel')}>
          {group.key === 'fixtures' ? <h3>{t('fixturesTitle')}</h3> : null}
          <ul>
            {group.items.map((d) => (
              <li key={d.code}>
                <button type="button" className={styles.decorItem} aria-pressed={selected === d.code} aria-disabled={!d.unlocked || !group.allowed} data-locked={d.unlocked && group.allowed ? 'false' : 'true'} data-testid={`decor-item-${d.code}`}
                  onClick={() => onPick(d.code, !group.allowed ? t('fixtureLocked') : d.unlocked ? null : tDecor('lockedHint', { condition: unlockLabel(d.condition) }))}>
                  <img src={decorThumb(d.spriteKey)} alt="" width={32} height={32} />
                  <span>{tDynamic(tDecor, `item_${d.code}`, d.code)}{d.practiceCode ? ' ★' : ''}</span>
                  {d.unlocked ? null : <small>{unlockLabel(d.condition)}</small>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {selected === 'sign' ? <Field label={tDecor('signLabel')}>{(p) => <TextInput {...p} maxLength={40} value={signLabel} onChange={(e) => onSignLabel(e.target.value)} data-testid="decor-sign-label" />}</Field> : null}
      <p role="status" data-testid="decor-hint">{hint ?? tDecor('placeHint')}</p>
    </div>
  );
}
