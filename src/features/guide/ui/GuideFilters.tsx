import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/Button';
import { NativeSelect, TextInput } from '@/components/ui/Field';
import { ENVIRONMENTS } from '@/lib/enums';
import { tDynamic } from '@/i18n/dynamic';
import styles from './Content.module.scss';

/** Filtres en GET (URL partageable, sans JavaScript) : recherche, espèce, climat, environnement. */
export async function GuideFilters({ action, species, values }: { action: string; species: { id: string; name: string }[]; values: Record<string, string | undefined> }) {
  const t = await getTranslations('guides');
  const te = await getTranslations('environments');
  return (
    <form action={action} method="get" role="search" data-testid="guide-filters">
      <div className={styles.filterBar}>
        {values.mes ? <input type="hidden" name="mes" value={values.mes} /> : null}
        <label className="visually-hidden" htmlFor="guide-q">{t('searchLabel')}</label>
        <TextInput id="guide-q" type="search" name="q" defaultValue={values.q ?? ''} placeholder={t('search')} />
        <label className="visually-hidden" htmlFor="guide-espece">{t('species')}</label>
        <NativeSelect id="guide-espece" name="espece" defaultValue={values.espece ?? ''}>
          <option value="">{t('anySpecies')}</option>
          {species.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </NativeSelect>
        <label className="visually-hidden" htmlFor="guide-climat">{t('climate')}</label>
        <NativeSelect id="guide-climat" name="climat" defaultValue={values.climat ?? ''}>
          <option value="">{t('anyClimate')}</option>
          {['Cfb', 'Cfa', 'Csa', 'Csb', 'Dfb', 'BSk'].map((k) => <option key={k} value={k}>{k}</option>)}
        </NativeSelect>
        <label className="visually-hidden" htmlFor="guide-env">{t('environment')}</label>
        <NativeSelect id="guide-env" name="env" defaultValue={values.env ?? ''}>
          <option value="">{t('anyEnvironment')}</option>
          {ENVIRONMENTS.map((e) => <option key={e} value={e}>{tDynamic(te, e, e)}</option>)}
        </NativeSelect>
        <Button type="submit" variant="secondary">{t('filter')}</Button>
      </div>
    </form>
  );
}
