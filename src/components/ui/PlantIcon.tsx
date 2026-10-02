import { Sprout } from 'lucide-react';
import { SPRITE_ICONS } from '@/generated/sprites';
import styles from './PlantIcon.module.scss';

/** Vignette pixel art d'une plante : espèce, sinon famille, sinon icône générique (SPEC §9.2 : repli). */
export function PlantIcon({ spriteKey, familySprite, size = 48 }: { spriteKey: string | null | undefined; familySprite?: string | null | undefined; size?: 32 | 48 | 64 | 96 }) {
  const key = spriteKey && SPRITE_ICONS.has(spriteKey) ? spriteKey : familySprite && SPRITE_ICONS.has(`family-${familySprite}`) ? `family-${familySprite}` : null;
  return (
    <span className={styles.icon} style={{ width: size, height: size }} aria-hidden>
      {key ? <img src={`/sprites/icons/${key}.png`} alt="" width={size} height={size} /> : <Sprout size={size * 0.6} />}
    </span>
  );
}

/** Icône d'interface pixel art (sprites HD de 48 px), proportions conservées. */
export function PixelIcon({ name, size = 32 }: { name: string; size?: 16 | 24 | 32 | 48 | 64 }) {
  return <img src={`/sprites/${name}.png`} alt="" aria-hidden width={size} height={size} style={{ objectFit: 'contain', imageRendering: size >= 48 ? 'pixelated' : 'auto' }} />;
}
