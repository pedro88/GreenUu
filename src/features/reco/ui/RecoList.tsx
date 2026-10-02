import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/Alert';
import { Badge, Muted, Row } from '@/components/ui/Layout';
import { tDynamic } from '@/i18n/dynamic';
import type { VarietyRecommendation } from '../engine';
import styles from '../../guide/ui/Content.module.scss';

/** Suggestions avec explication et confiance (§7.1) ; le démarrage à froid a son bandeau distinct (§7.5). */
export async function RecoList({ items, coldStart }: { items: VarietyRecommendation[]; coldStart: VarietyRecommendation[] }) {
  const t = await getTranslations('reco');
  const te = await getTranslations('environments');
  const tm = await getTranslations('methods');
  const summary = (r: VarietyRecommendation) => [r.explanation.contextSummary.koppen, r.explanation.contextSummary.environment ? tDynamic(te, r.explanation.contextSummary.environment, r.explanation.contextSummary.environment) : null,
    r.explanation.contextSummary.altitudeM !== null ? `${r.explanation.contextSummary.altitudeM} m` : null].filter(Boolean).join(', ');
  return (
    <>
      {coldStart.map((r) => (
        <Alert key={r.speciesId} tone="info">
          <span data-testid="reco-cold-start">{t('coldStart', { count: r.explanation.gardensCount, source: t(`source_${r.explanation.source === 'guide' ? 'guide' : 'reference'}`) })}</span>
          {r.guideId ? <> <Link href={`/app/guides/${r.guideId}`}>{t('openGuide')}</Link></> : null}
        </Alert>
      ))}
      {items.length === 0 && coldStart.length === 0 ? <Muted>{t('empty')}</Muted> : null}
      <ul className={styles.list} data-testid="reco-list">
        {items.map((r) => {
          const e = r.explanation;
          return (
            <li key={`${r.speciesId}-${r.varietyId ?? ''}`} className={styles.item} data-testid="reco-item">
              <Row>
                <h2 className={styles.itemTitle}>{r.speciesName}{r.varietyName ? ` ${r.varietyName}` : ''}</h2>
                <Badge data-testid="reco-confidence" data-level={e.confidence}>{t('confidence', { level: t(`confidence_${e.confidence}`) })}</Badge>
              </Row>
              <p style={{ margin: 0 }} data-testid="reco-explanation">
                {e.medianYieldKgM2 !== undefined
                  ? t('explanation', { gardens: e.gardensCount, success: e.meanSuccessPct ?? 0, yield: e.medianYieldKgM2 })
                  : t('explanationNoYield', { gardens: e.gardensCount, success: e.meanSuccessPct ?? 0 })}
              </p>
              <p className={styles.meta}>{t('context', { summary: summary(r) })}{r.bestMethod ? ` · ${t('bestMethod', { method: tm(r.bestMethod) })}` : ''}</p>
              {e.ownHistory ? <p className={styles.meta}>{t('ownHistory', { seasons: e.ownHistory.seasons, rating: e.ownHistory.meanRating })}</p> : null}
              {e.warnings.length ? <ul className={styles.chips}>{e.warnings.map((w) => <li key={w}><Badge>{t(`warning_${w}`)}</Badge></li>)}</ul> : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}
