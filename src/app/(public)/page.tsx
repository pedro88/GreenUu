import { getTranslations } from 'next-intl/server';
import { LinkButton } from '@/components/ui/Button';
import { PixelIcon, PlantIcon } from '@/components/ui/PlantIcon';
import { getSessionUser } from '@/server/auth/session';
import styles from './landing.module.scss';

/** Planches de l'illustration (décorative) : des vignettes d'espèces posées sur des bacs, façon vue jardin. */
const BEDS = [['tomate', 'tomate', 'tomate', 'tomate'], ['carotte', 'carotte', 'chou', 'chou'], ['laitue', 'laitue', 'fraisier', 'fraisier']];

export default async function HomePage() {
  const t = await getTranslations('home');
  const u = await getSessionUser();
  const features = [
    { key: 'feature1', icon: 'ui/action-editer-plan' },
    { key: 'feature2', icon: 'ui/groupe' },
    { key: 'feature3', icon: 'ui/meteo-soleil' },
  ] as const;
  return (
    <div className={styles.landing}>
      <section className={styles.hero}>
        <div className={styles.pitch}>
          <h1>{t('title')}</h1>
          <p>{t('pitch')}</p>
          <div className={styles.ctas}>
            {u ? (
              <LinkButton href="/app" size="large">{t('openApp')}</LinkButton>
            ) : (
              <>
                <LinkButton href="/inscription" size="large">{t('signUp')}</LinkButton>
                <LinkButton href="/connexion" variant="secondary" size="large">{t('signIn')}</LinkButton>
              </>
            )}
          </div>
        </div>
        <div className={styles.window} aria-hidden>
          <span className={styles.chrome}><i /><i /><i /></span>
          <div className={styles.garden}>
            {BEDS.map((bed, i) => (
              <div key={i} className={styles.bed}>{bed.map((sp, j) => <PlantIcon key={j} spriteKey={sp} size={48} />)}</div>
            ))}
          </div>
        </div>
      </section>
      <ul className={styles.features}>
        {features.map((f) => (
          <li key={f.key} className={styles.feature}>
            <span className={styles.featureIcon}><PixelIcon name={f.icon} size={48} /></span>
            <span>{t(f.key)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
