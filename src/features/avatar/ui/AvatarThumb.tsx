'use client';

import { useEffect, useState } from 'react';
import type { AvatarConfigV1 } from '../config.pure';
import { avatarThumbnail } from '../compose';
import styles from './AvatarThumb.module.scss';

/**
 * Vignette d'avatar (SPEC §10.5) : tête et buste composés côté client, une fois par `configHash`. Avant composition ou
 * sans JavaScript, l'initiale du pseudo sur une couleur dérivée du hash.
 */
export function AvatarThumb({ userId, config, configHash, pseudo, size = 40 }: {
  userId: string; config: AvatarConfigV1; configHash: string; pseudo: string; size?: number;
}) {
  const [src, setSrc] = useState<{ hash: string; url: string } | null>(null);
  useEffect(() => {
    let live = true;
    void avatarThumbnail(config, configHash).then((url) => { if (live && url) setSrc({ hash: configHash, url }); });
    return () => { live = false; };
    // La configuration est entièrement décrite par son hash.
  }, [configHash]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = src?.hash === configHash ? src.url : null;
  return (
    <span className={styles.thumb} style={{ width: size, height: size, fontSize: size * 0.45 }} data-testid="avatar-thumb" data-user-id={userId}
      data-config-hash={configHash} data-state={shown ? 'composed' : 'initial'} data-tone={Number.parseInt(configHash.slice(0, 2), 16) % 5} aria-hidden>
      {pseudo.slice(0, 1)}
      {shown ? <img src={shown} alt="" width={size} height={size} /> : null}
    </span>
  );
}
