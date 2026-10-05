# GreenU

Gestion de jardins et de cultures au fil des saisons. La spécification de référence est [SPEC.md](SPEC.md) ; les maquettes sont dans [Mockup/](Mockup/).

## Démarrer en local

Prérequis : Node ≥ 22.12, pnpm 9, Docker.

```bash
pnpm install
cp .env.example .env            # puis remplacer BETTER_AUTH_SECRET : openssl rand -base64 32
docker compose up -d            # PostgreSQL 18 (port 5434) + Mailpit (SMTP 1026, UI http://localhost:8026)
pnpm db:migrate
pnpm db:seed
pnpm dev                        # Next (http://localhost:3000) + worker pg-boss
```

Comptes du seed (mot de passe commun `jardin-seed-2026`) :

| Compte | Rôle |
|---|---|
| `alice@greenu.test` | propriétaire du jardin familial « Les Tilleuls » |
| `bruno@greenu.test` | propriétaire du jardin collectif « Jardin partagé du Canal » |
| `chloe@greenu.test` | admin du jardin collectif |
| `david@`, `emma@greenu.test` | membres du jardin collectif (groupe « Équipe serre ») |
| `farid@greenu.test` | observateur du jardin collectif |
| `gaelle@greenu.test` | propriétaire de « Maraîchage des Combes », membre et observatrice ailleurs |
| `hugo@greenu.test` | sans jardin (tests d'accès refusé) |
| `nina@greenu.test` | e-mail non vérifié |
| `modo@`, `admin@greenu.test` | modérateur / admin plateforme |

Les e-mails envoyés (vérification, invitations, réinitialisation) arrivent dans Mailpit : http://localhost:8026.

## Scripts

| Script | Rôle |
|---|---|
| `pnpm dev` | Next + worker |
| `pnpm build` / `pnpm start` | Build et serveur de production de Next |
| `pnpm worker` | Worker pg-boss seul (tâches planifiées, voir plus bas) |
| `pnpm typecheck` | Types des routes (`next typegen`) puis `tsc` |
| `pnpm lint` | ESLint + Stylelint |
| `pnpm test` | Vitest : unitaires et intégration (base `greenu_test`) |
| `pnpm test:e2e` | Playwright (réinitialise et seede `greenu_test`, serveur sur le port 3100) |
| `pnpm test:e2e:offline` | Suite hors-ligne sur le build de production (OFF-01 et OFF-06 complets) ; à lancer avant de merger un lot |
| `pnpm test:spec` | Vérifie que chaque critère d'acceptation du lot courant a un test au vert ; échoue si un rapport (`reports/`) manque, contient un échec ou est antérieur au dernier commit |
| `pnpm verify` | Types, lint et tests : à lancer avant tout merge dans `main` (le hook `pre-push` le lance aussi) |
| `pnpm db:generate` / `db:migrate` / `db:seed` / `db:reset` | Migrations Drizzle, seed déterministe, remise à zéro (dev) |
| `pnpm db:reference` | Charge le référentiel commun (espèces, variétés, catalogues d'avatar et de déco, communes) ; à lancer aussi en production après les migrations |
| `pnpm tsx scripts/build-communes.ts <dossier>` | Reconstruit la base de communes (`src/features/location/data/communes.tsv.gz`) à partir des fichiers GeoNames (`dump/` et `zip/` de BE, FR, LU, CH ; CC BY 4.0) |
| `pnpm assets:sync [dossier]` | Copie les assets HD livrés par la session sprites (`out_hd/` par défaut, hors de ce dépôt) vers `public/sprites` |
| `pnpm xp:recompute [--user <id>] [--apply]` | Rejoue l'historique avec le barème d'XP courant (RG-XP-08). Sans `--apply`, rapport des écarts seulement ; avec, lignes de correction ajoutées au journal (append-only) |

## Worker et tâches planifiées

Le worker (`src/server/jobs/worker.ts`) est un processus permanent, lancé avec Next par `pnpm dev`. Il exécute :

| Tâche | Fréquence | Rôle |
|---|---|---|
| `outbox.dispatch` | chaque minute | Distribue les événements de domaine aux abonnés asynchrones (notifications) |
| `tickets.materialize-recurrences` | chaque heure (h:05) | Crée les occurrences des tickets récurrents |
| `tickets.due-reminders` | toutes les 15 min | Rappels de veille d'échéance et retards |
| `notifications.daily-digest` | chaque heure | Récapitulatif quotidien par e-mail, à 7 h dans le fuseau de chacun (si activé) |
| `quests.generate` | chaque heure (h:02) | Quêtes du jour, de la semaine et de la saison, dans le fuseau de chacun (idempotent) |
| `reco.refresh-facts` | chaque heure (h:10) | Rafraîchit la vue anonymisée des résultats partagés |
| `housekeeping` | 03:30 (Europe/Paris) | Sessions et invitations expirées, photos orphelines |
| `privacy.purge` | 03:45 (Europe/Paris) | Archives d'export expirées, comptes supprimés depuis 30 jours |
| `privacy.export`, `mail.send` | à la demande | Archive RGPD, envoi des e-mails |

## Progression (XP)

L'XP est calculée de façon synchrone, dans la transaction de chaque action : l'abonné de `emit` (`src/features/progression/register.ts`) applique le barème pur (`rules.pure.ts`), écrit le journal `xp_ledger_entry` (append-only, garanti par trigger) puis met à jour la projection `user_progress`. Tout point d'entrée qui émet des événements doit importer `register.ts` (c'est le cas des actions, du worker et des tests d'intégration). Le seed, lui, rattrape l'XP en fin de chargement avec le recalcul. Détails : SPEC.md §8.

## Vue jardin et éditeur de plan

La page d'un jardin s'ouvre en vue jardin (PixiJS) ou en vue classique, selon `?vue=jardin|classique` puis la préférence enregistrée (`/app/parametres/affichage`). Le domaine (instantané de scène, phases, terrain, trajets, timelapse) est dans `src/features/scene/`, en fonctions pures (`*.pure.ts`) partagées par le serveur, l'éditeur et le moteur. Le rendu est dans `src/game/` :

| Module | Rôle |
|---|---|
| `GardenCanvas.tsx` | Composant client chargé par `next/dynamic` sans SSR ; seul point d'entrée du moteur |
| `engine/pixi-scene.ts` | Assemble les calques et décide quoi redessiner (seul le terrain quand seules les cases changent) |
| `engine/ground.ts` | Fond d'herbe et terrain peint, précalculés par blocs de 16 × 16 tuiles |
| `engine/zones.ts` | Planches et carrés en pièces, serres de face, sillons des rangs |
| `engine/plants.ts` | Plants (la bande de chaque culture est remplie, environ un par tuile), bulles d'état, objets posés |
| `engine/avatars.ts` | Trajets des avatars dans leurs zones, chemins entre zones, rencontres ; images composées au premier besoin |
| `engine/atlas.ts`, `palette.ts`, `loop.ts` | Chargement des atlas, couleurs, boucle de rendu à la demande |
| `PlanEditor.tsx`, `plan/` | Éditeur de plan : état, gestes et enregistrement ; palettes et formulaire par dimensions |
| `HistoryPlayer.tsx` | Histoire du jardin (`/histoire`) : chaque image est un instantané de scène calculé côté client |

- **Accessibilité** : la couche DOM porte toute l'interaction (`zone-<id>`, `culture-<id>`, `data-state`, `data-plants`, `data-avatar-action`) ; le canvas est `aria-hidden`.
- **Assets** : sprites **HD** (`out_hd/` : tuile de 64 px, avatar de 64 × 96 px). `pnpm assets:sync` copie l'atlas de la scène, les atlas de saison (`saison-*.json`, seul celui de la saison courante est chargé), l'atlas de l'avatar, les atlas des actions jouées (chargés seulement quand un avatar les joue), les vignettes de l'éditeur, les objets de déco et la frame de face de chaque élément d'avatar. La grille logique reste à 32 px. Sans atlas, le moteur dessine des formes de substitution.
- **Terrain** : peint case par case (pinceau, rectangle, gomme, pipette), rendu en dual-grid avec des transitions à fond transparent ; haies et clôtures se raccordent seules. Planches, haies et arbres suivent la saison.
- **Objets** : la déco exige `decor:place` ; les aménagements ponctuels (point d'eau, récupérateur, arbre existant, portail) exigent `plan:edit`. Un objet ★ peut être déclaré comme pratique depuis sa feuille.
- **Avatars** : dans tous les types de jardin, les membres actifs dans les 24 h (et l'utilisateur courant) font le tour des zones où ils ont agi et y rejouent leur dernière action réelle.
- **Histoire du jardin** : un instantané du plan est écrit chaque jour de modification, dans la même transaction ; `/histoire` les rejoue en timelapse avec les phases réelles des cultures.
- **CSP** : la production interdit `eval`. PixiJS est donc chargé avec `pixi.js/unsafe-eval` (shaders précompilés) ; ne pas retirer cet import.
- **Éditeur** (`/plan`) : les gestes deviennent des commandes, enregistrées par lots tout ou rien avec contrôle de version. En cas de `CONFLICT`, l'éditeur recharge l'instantané et rejoue les commandes non confirmées.

## Avatar

L'éditeur est sur `/app/profil/avatar` (et en première étape de `/bienvenue`). Le catalogue (éléments, palettes, conditions de déblocage) est défini en code (`src/features/avatar/catalog.ts`) et chargé en base avec le référentiel (`pnpm db:reference`). Les calques HD sont en niveaux de gris réservés (224, 168, 112, 64) et recolorés en Canvas 2D, sans PixiJS ; les vignettes (`AvatarThumb`) sont mises en cache par `configHash` (mémoire et Cache Storage). Le serveur revalide toute la configuration à l'enregistrement. Tout le catalogue est disponible dès le départ. Les variantes (silhouettes, formes de visage, yeux, âge) n'apparaissent que lorsque leurs sprites sont livrés : `pnpm assets:sync` régénère `src/generated/avatar-sprites.ts`. La demande à la session sprites est décrite dans [DEMANDE-SPRITES-AVATAR.md](DEMANDE-SPRITES-AVATAR.md).

## Tests et dates

- **Deux fuseaux, exprès** : Vitest et le serveur e2e tournent en `America/New_York` (offset négatif), le navigateur Playwright en `Europe/Brussels`. Un calcul de date qui dépend du fuseau de la machine échoue donc localement comme en CI. `TEST_TZ` permet d'essayer un autre fuseau pour Vitest.
- **Un seul « maintenant »** pour les e2e : `E2E_NOW` (`tests/e2e/db.ts`, le 14 octobre 2026 à 10:00 UTC) est passé au serveur (`APP_NOW`) et au seed (`SEED_REFERENCE_DATE`). Les données du seed sont datées relativement à cet instant.
- **Hors-ligne** : le service worker (`public/sw.js`) met en cache les pages visitées et leurs fichiers ; les saisies rapides hors-ligne vont dans une file IndexedDB rejouée au retour du réseau. Sous `next dev`, Turbopack charge les modules à la demande par son serveur de développement : la vue jardin et la page hors-ligne ne s'hydratent donc pas hors-ligne. Les e2e OFF-01 et OFF-06 n'exigent le canvas, le compteur et la liste qu'en build de production : `pnpm test:e2e:offline`, exigé par la définition de « terminé » d'un lot.
- **Build séparé** : les e2e compilent dans `.next-e2e` (`NEXT_DIST_DIR`), pour ne pas gêner un `pnpm dev` ouvert. En CI, `next build` puis `next start` ; en local, `next dev`.
- **Une exécution e2e à la fois** : toutes les exécutions partagent la base `greenu_test` et le port 3100 ; une seconde exécution lancée en même temps refuse de démarrer (verrou `reports/.e2e.lock`).
- **Traçabilité** : chaque critère d'acceptation du §12 est cité par son ID dans le titre d'au moins un test ; `pnpm test:spec` le vérifie pour le lot courant (`spec.config.json`).

## Qualité

- **Pre-commit** : `pnpm install` active `.githooks/` (lint des fichiers indexés et vérification des types).
- **CI** : `.github/workflows/ci.yml` lance types, lint, Vitest, Playwright et `test:spec` sur chaque PR et sur `main`.

## Cycle de travail

Chaque lot du §15 suit le même cycle, décrit dans [CLAUDE.md](CLAUDE.md) : branche `lot-N/<slug>`, développement, audit général (`AUDIT-*.md`), audit e2e (`E2E-AUDIT-*.md`), puis corrections sur une branche `audit-fix/…`. Les rapports du cycle en cours restent à la racine, avec l'état de chaque constat ; ceux des cycles terminés sont archivés dans [docs/audits/](docs/audits/).

## Dépannage

| Symptôme | Cause et remède |
|---|---|
| `ECONNREFUSED ::1:5434` au lancement des tests | La base Docker est arrêtée (redémarrage de la machine) : `docker compose up -d` |
| En dev, la vue jardin plante avec une erreur d'un ancien code (`t.geometry`…) | Un service worker d'avant le correctif sert d'anciens fichiers : outils de développement → Application → « Clear site data », puis recharger |
| `http://localhost:3100 is already used` au lancement des e2e | Une autre exécution e2e tourne (ou un serveur e2e est resté ouvert) : attendre sa fin, ou arrêter le `next dev --port 3100` restant |
| `pnpm` introuvable dans un hook Git lancé par un client graphique | Le hook ajoute `~/.local/share/pnpm` et `~/.local/bin` au `PATH` ; sinon, définir `PNPM_HOME` |

## Architecture

Voir SPEC.md §3 : UI → Server Actions (`defineAction`) → services (logique pure, testable) → dépôts scopés par jardin. Toute lecture ou écriture vérifie l'adhésion au jardin ; la base impose en plus des clés étrangères composites `(garden_id, …)`.

| Dossier | Contenu |
|---|---|
| `src/app/` | Routes App Router (pages, layouts, gardes `requireGardenScope`) |
| `src/features/<domaine>/` | Un dossier par domaine : `schema.ts` (Zod), `service.ts` (règles, écriture), `queries.ts` (lecture), `actions.ts` (Server Actions), `*.pure.ts` (logique sans base), `ui/` |
| `src/server/` | Base (`db/schema`), autorisation (`authz`), événements de domaine, jobs, sécurité (CSP) |
| `src/lib/` | Utilitaires sans dépendance au domaine : énumérations, dates (`iso-date.ts` pour les dates calendaires), erreurs, Zod |
| `src/game/` | Vue jardin, éditeur de plan, histoire (voir plus haut) |
| `tests/` | `unit/`, `integration/` (base réelle, transaction annulée), `e2e/` (Playwright) ; aides partagées dans `tests/geometry.ts`, `tests/integration/fixtures.ts`, `tests/e2e/helpers.ts` |
