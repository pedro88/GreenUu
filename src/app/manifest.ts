import type { MetadataRoute } from 'next';

/** Manifeste de la PWA (lot 9) : installable, démarre sur l'accueil connecté. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'GreenU',
    short_name: 'GreenU',
    description: 'Tes jardins, saison après saison : planifie, cultive, partage.',
    start_url: '/app',
    display: 'standalone',
    background_color: '#fdf6ea',
    theme_color: '#2e1f22',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
