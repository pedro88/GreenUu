# Audit — GreenU (suivi après les corrections du lot 10)

**Date** : 2026-10-05 · **Commit** : `8833a70` (branche `main`) · **Stack** : Next 16.3 (App Router), React 19.3, TS 6.0, Drizzle 0.45, PostgreSQL 18, PixiJS 8.22
**Volume** : 455 fichiers TS/TSX (src, scripts, tests), ~25 000 lignes dans `src` · **Auditeur** : Claude
**Audit précédent** : [AUDIT-2026-10-05-lot-10.md](AUDIT-2026-10-05-lot-10.md) (75/100 ; M1, M2 et m2 corrigés depuis, m1 sans objet).

## Note globale : 76/100

| Axe | Note | Poids | Tendance |
|---|---|---|---|
| Sécurité | 79/100 | 18 | ↑ +1 |
| Architecture | 76/100 | 13 | ↑ +1 |
| Base de données & migrations | 80/100 | 12 | → |
| Typage & validation | 86/100 | 12 | → |
| Organisation du code | 73/100 | 10 | → |
| Tests | 80/100 | 10 | ↑ +1 |
| Performance | 66/100 | 9 | ↑ +5 |
| Réutilisation / DRY | 67/100 | 6 | → |
| Documentation | 73/100 | 5 | ↓ −2 |
| DX & CI/CD | 71/100 | 5 | ↓ −1 |

Calcul : (79×18 + 76×13 + 80×12 + 86×12 + 73×10 + 80×10 + 66×9 + 67×6 + 73×5 + 71×5) / 100 = 76,48 → **76** (↑ +1 depuis l'audit du lot 10).

## En une phrase

Plus aucun constat critique ni majeur ouvert : les deux risques de volume du lot 10 sont corrigés et verrouillés par des
tests ; ce qui reste tient à l'hygiène (gros fichiers du moteur, documentation à la racine, suite e2e non isolée entre
deux exécutions simultanées).

## Ce qui est bien fait

- **Suite complète au vert et exigeante** : Vitest 372/372, e2e 100/100, hors-ligne en build de production 8/8, traçabilité 301/301 critères ; la CI rejoue les e2e sur un build de production (`playwright.config.ts:22`).
- **Logique en fonctions pures** : remplissage, rangs, chemins, trajets, timelapse et terrain (`src/features/scene/*.pure.ts`) sont testés sans base ni navigateur et partagés par le serveur, l'éditeur et le moteur.
- **Refus prouvés de bout en bout** sur les nouvelles surfaces : aménagements ponctuels (E2E-PNT-07b), `/histoire` sans fuite dans le HTML (E2E-TLP-05b).
- **Typage strict** : 1 seul `any` apparent (`src/game/manifest.ts:129`, en fait une variable nommée `any`, pas un type), 15 `as` vers un type nommé, tous justifiés par la règle ESLint `greenu/justified-as`.
- **Performance du moteur** : fond précalculé par blocs (`pixi-scene.ts`), images d'avatar composées au premier besoin, atlas de saison et d'action chargés à la demande.

## Constats critiques

Aucun.

## Constats majeurs

Aucun.

## Constats mineurs

- m1 — `src/game/engine/pixi-scene.ts` (642 lignes) et `src/game/PlanEditor.tsx` (596 lignes) cumulent plusieurs responsabilités (fond, terrain, zones, plants, avatars, rencontres ; outils, palettes, gestes, enregistrement) : à découper en modules (avatars, fond) et en sous-composants (palettes).
- m2 — Les rencontres d'avatars (LIV-02) ne sont prouvées qu'en unitaire, sans signal DOM (`pixi-scene.ts`, `chatPairs`).
- m3 — La requête qui rattache un événement à sa zone est écrite deux fois (`src/features/scene/avatars.ts`, `lastActions` et `zonesVisited`).
- m4 — Suite e2e non isolée entre exécutions : base `greenu_test` et port 3100 partagés, sans verrou ; deux exécutions simultanées (deux sessions le 2026-10-05) se sont réinitialisé la base et supprimé les traces l'une de l'autre.
- m5 — La CI rejoue un test en échec (`retries: 1`, `playwright.config.ts:11`) : un test qui passe au second essai est compté vert.
- m6 — 20 rapports d'audit à la racine du dépôt (`AUDIT-*.md`, `E2E-AUDIT-*.md`) : à ranger dans `docs/audits/`.
- m7 — `README.md` ne mentionne ni le jardin vivant ni l'histoire du jardin (lots 9 et 10).
- m8 — `pnpm audit --prod` : 1 vulnérabilité modérée (esbuild, outillage de build), inchangée.
- m9 — `console.log('[worker] prêt')` (`src/server/jobs/worker.ts:82`) : journal de démarrage du worker, acceptable, mais hors du journal structuré.

## Depuis le dernier audit

- Corrigés : M1 (histoire bornée en poids, `d73d2cb`), M2 (fond précalculé, `6c97816`), m2 (`ROW_ZONE_TYPE` dans `@/lib/enums`, `530adf0`).
- Sans objet : m1 (géométrie des rangs), conforme au critère FIL-08.
- Toujours ouverts : m3 à m5 de l'audit du lot 10 (ici m1, m2, m8).
- Régressions : aucune.

## Détail par axe

### Sécurité — 79/100
Server Actions par `defineAction` (25 fichiers `'use server'`), portée et permission à chaque entrée ; pages de jardin derrière `requireGardenScope` (403 sans donnée) ; aménagements ponctuels sous `plan:edit` ; requêtes SQL brutes paramétrées. Descend : vulnérabilité modérée d'outillage (m8). Aucune faille exploitable trouvée.

### Architecture — 76/100
Couches respectées (règle `no-restricted-imports` : l'UI ne lit jamais le schéma) ; dépendance du domaine vers la vue retirée (m2 du lot 10). Descend : moteur monolithique (m1).

### Base de données & migrations — 80/100
Migrations additives, conversion du terrain rejouable, contraintes `CHECK` et unicités `NULLS NOT DISTINCT`, plafonds de lecture (cases, instantanés). Descend : pas de rétention des instantanés du plan (à décider), `terrain_element` conservée en attente de décision.

### Typage & validation — 86/100
`strict`, Zod à chaque frontière, instantanés relus en `safeParse`, `as` justifiés.

### Organisation du code — 73/100
m1, m3.

### Tests — 80/100
Pyramide équilibrée, mutations tuées à chaque audit ; m2, m5.

### Performance — 66/100
Corrections M1 et M2 du lot 10. Reste : terrain et plants dessinés sprite par sprite (terrain précalculé par blocs non fait, écart §18) ; chemins A* recalculés à chaque instantané pour chaque avatar (borné à 40 000 cases).

### Réutilisation / DRY — 67/100
`layoutCultures`, `planState`, `plantsPerM2` partagés ; m3.

### Documentation — 73/100
SPEC 0.24 tenue à jour à chaque demande ; m6, m7.

### DX & CI/CD — 71/100
CI complète (typecheck, lint, tests, e2e en build de production, traçabilité), hooks pre-commit et pre-push ; m4, m5 ; des modifications locales non committées des hooks (`.githooks/`, ajout du PATH de pnpm) attendent d'être versionnées.

## Plan d'action suggéré

| Priorité | Action | Axe(s) | Effort | Gain estimé |
|---|---|---|---|---|
| 1 | m4 — verrou ou base par exécution pour la suite e2e | DX, Tests | S | +1 pt |
| 2 | m6, m7 — ranger les rapports, mettre le README à jour | Documentation | S | +1 pt |
| 3 | m1 — sortir avatars et fond du moteur en modules | Organisation, Architecture | M | +2 pts |
| 4 | m3 — une seule requête événement → zone | DRY | S | +0,5 pt |

## Méthode

`pnpm typecheck`, `pnpm lint` (0 erreur), suite complète de la veille sur ce contenu (372/372, 100/100, 8/8, 301/301 ; le seul commit suivant est la constante `ROW_ZONE_TYPE`, vérifiée par typecheck, lint et 31 tests ciblés), `pnpm audit --prod`, comptages (`any`, `as`, `TODO`, `console.log`, tailles de fichiers), lecture de la CI et de la configuration Playwright. Non vérifié : production (pas de déploiement), appareil de référence de NFR-04.
