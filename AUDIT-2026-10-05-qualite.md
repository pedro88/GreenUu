# Audit — GreenU (après la passe qualité)

**Date** : 2026-10-05 · **Commit** : `e59132c` (branche `qualite/vers-85`) · **Stack** : Next 16.3 (App Router), React 19.3, TS 6.0, Drizzle 0.45, PostgreSQL 18, PixiJS 8.22
**Volume** : ~460 fichiers TS/TSX, ~25 000 lignes dans `src` · **Auditeur** : Claude
**Audit précédent** : [AUDIT-2026-10-05-suivi.md](AUDIT-2026-10-05-suivi.md) (76/100).

## Note globale : 82/100

| Axe | Note | Poids | Tendance |
|---|---|---|---|
| Sécurité | 82/100 | 18 | ↑ +3 |
| Architecture | 80/100 | 13 | ↑ +4 |
| Base de données & migrations | 80/100 | 12 | → |
| Typage & validation | 86/100 | 12 | → |
| Organisation du code | 80/100 | 10 | ↑ +7 |
| Tests | 85/100 | 10 | ↑ +5 |
| Performance | 78/100 | 9 | ↑ +12 |
| Réutilisation / DRY | 80/100 | 6 | ↑ +13 |
| Documentation | 85/100 | 5 | ↑ +12 |
| DX & CI/CD | 82/100 | 5 | ↑ +11 |

Calcul : (82×18 + 80×13 + 80×12 + 86×12 + 80×10 + 85×10 + 78×9 + 80×6 + 85×5 + 82×5) / 100 = 81,75 → **82**.

## En une phrase

La passe qualité a résorbé l'essentiel de la dette relevée (moteur monolithique, doublons, documentation en retard,
suite e2e non isolée) et mis au jour deux vrais défauts, corrigés ; il manque encore environ 3 points pour 85, à
chercher surtout dans la base de données, la performance restante et le typage.

## Ce qui est bien fait

- **Suite fiable et sans complaisance** : 372/372, 100/100, 8/8 en build de production, 301/301 critères, **sans aucune relance** (`playwright.config.ts`, `retries: 0`) ; une seule exécution e2e à la fois (`tests/e2e/lock.ts`). Retirer les relances a révélé une course réelle du service worker (E2E-OFF-09), corrigée (`public/sw.js`, génération du cache des pages).
- **Moteur en modules** : `src/game/engine/` sépare l'assemblage (`pixi-scene.ts`, 206 lignes) du dessin (`ground.ts`, `zones.ts`, `plants.ts`, `avatars.ts`, `atlas.ts`, `palette.ts`) ; fond et terrain sont précalculés par blocs de 16 × 16 tuiles et par couche (§9.1, écart du lot 7 résorbé).
- **Une seule source pour les règles transverses** : dates calendaires (`src/lib/iso-date.ts`), saison astronomique (`season.pure.ts`), jointure événement → zone (`avatars.ts`, `EVENT_ZONE`), placement des cultures (`layoutCultures`), aides de test (`tests/geometry.ts`, `tests/integration/fixtures.ts`, `tests/e2e/helpers.ts`).
- **Défaut d'interface corrigé** : la feuille d'une zone attend la fin du délai de double toucher (`GardenView.tsx`) ; le zoom au double toucher (POL-03) ne dépend plus de la vitesse de la machine.
- **Dépendances saines** : `pnpm audit --prod` ne signale plus rien (esbuild imposé ≥ 0.25 sous drizzle-kit).

## Constats critiques

Aucun.

## Constats majeurs

Aucun.

## Constats mineurs

- m1 — `src/game/PlanEditor.tsx` (505 lignes) garde l'enregistrement, le rejeu des conflits et les gestes dans un même composant : un hook `usePlanSave` (enregistrement automatique, conflits) et un hook de gestes le réduiraient de moitié.
- m2 — Plants dessinés sprite par sprite et triés avec les avatars dans un calque animé (`src/game/engine/plants.ts`) : un plant ne bouge plus, il pourrait rejoindre un calque précalculé (au risque de perdre le tri en profondeur avec les avatars, à arbitrer).
- m3 — La grille de marche des avatars est recalculée pour chaque avatar à chaque instantané (`src/game/engine/avatars.ts`, `walkGrid`) : une grille par scène, les zones de l'avatar ouvertes à la volée, suffirait.
- m4 — Base : `terrain_element` (convertie, plus lue) et la fonction de conversion restent en base ; `plan_snapshot` n'a pas de politique de rétention. Les deux attendent une décision (SPEC §18).
- m5 — 15 `as` vers un type nommé (tous justifiés par la règle `greenu/justified-as`) ; quelques-uns couvrent des JSON lus en base qui pourraient passer par Zod.
- m6 — Les rencontres d'avatars (LIV-02) restent prouvées en unitaire seulement.
- m7 — Quatre constructions `new Date(\`${iso}T12:00:00Z\`)` hors de `iso-date.ts` (`HistoryPlayer.tsx`, `quests.pure.ts`, `culture/service.ts`) : légitimes (formatage, instant), mais une aide `isoNoon` les rendrait uniformes.

## Depuis le dernier audit

- Corrigés : m1 (moteur découpé), m3 (requête événement → zone unique), m4 (verrou e2e), m5 (plus de relance en CI), m6 (rapports archivés), m7 (README), m8 (vulnérabilité esbuild) de l'audit de suivi ; hooks Git versionnés.
- Défauts trouvés et corrigés en route : feuille de zone qui recouvrait la zone avant le second toucher (POL-03 instable) ; page authentifiée réécrite dans le cache après la perte de session (E2E-OFF-09).
- Toujours ouverts : rencontres en unitaire seulement (m6), décisions de base (m4).

## Détail par axe

### Sécurité — 82/100
Server Actions par `defineAction` (portée et permission à chaque entrée), pages de jardin derrière `requireGardenScope`, refus prouvés de bout en bout sur les nouvelles surfaces ; dépendances sans vulnérabilité connue ; course de confidentialité du cache hors-ligne corrigée. Plafonne : pas de vérification de production possible (pas de déploiement).

### Architecture — 80/100
Couches respectées et contrôlées par ESLint ; le domaine ne dépend plus de la vue ; moteur modulaire avec un point d'entrée unique. Descend : m1.

### Base de données & migrations — 80/100
Inchangé : migrations additives et rejouables, contraintes et plafonds ; m4.

### Typage & validation — 86/100
`strict`, Zod aux frontières ; m5.

### Organisation du code — 80/100
Plus aucun fichier du moteur au-delà de 210 lignes ; m1 reste.

### Tests — 85/100
Sans relance, isolée, mutations tuées à chaque audit, aides partagées ; m6.

### Performance — 78/100
Fond et terrain précalculés, histoire bornée en poids, images d'avatar et atlas à la demande, redessin limité aux calques qui changent ; m2, m3.

### Réutilisation / DRY — 80/100
Doublons relevés supprimés ; m7.

### Documentation — 85/100
README à jour (moteur, jardin vivant, architecture, dépannage), SPEC 0.25, rapports archivés et cycle documenté dans CLAUDE.md.

### DX & CI/CD — 82/100
CI complète sans relance, verrou e2e, hooks utilisables depuis un client graphique ; `main` a des commits non poussés (l'accès en écriture au dépôt distant reste à régler).

## Plan d'action vers 85

| Priorité | Action | Axe(s) | Effort | Gain estimé |
|---|---|---|---|---|
| 1 | m4 — décider : supprimer `terrain_element` ; rétention de `plan_snapshot` (ex. 5 ans, purge par le job de ménage) | BDD | S (+ décision) | +1 pt |
| 2 | m3 et m2 — une grille de marche par scène ; plants dans un calque précalculé si le tri avec les avatars peut être gardé | Performance | M | +1 pt |
| 3 | m1 — `usePlanSave` et hook de gestes pour l'éditeur | Organisation, Architecture | M | +1 pt |
| 4 | m5, m7 — JSON relus par Zod au lieu de `as` ; aide `isoNoon` | Typage, DRY | S | +0,5 pt |

## Méthode

`pnpm typecheck`, `pnpm lint` (0 erreur), `pnpm test` (372/372), `pnpm test:e2e` (100/100, sans relance), `pnpm test:e2e:offline` (8/8), `pnpm test:spec` (301/301), `pnpm audit --prod` (aucune vulnérabilité), comptages (tailles de fichiers, `as`, dates), lecture du diff `main...qualite/vers-85`. Rendu de la vue jardin vérifié par capture (mêmes 162 tuiles et 98 transitions qu'avant le découpage). Non vérifié : production, appareil de référence de NFR-04.
