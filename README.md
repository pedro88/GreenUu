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
| `pnpm test:spec` | Vérifie que chaque critère d'acceptation du lot courant a un test au vert |
| `pnpm db:generate` / `db:migrate` / `db:seed` / `db:reset` | Migrations Drizzle, seed déterministe, remise à zéro (dev) |
| `pnpm db:reference` | Charge le référentiel végétal commun (espèces, variétés) ; à lancer aussi en production après les migrations |
| `pnpm assets:sync` | Copie les assets livrés par la session sprites (hors de ce dépôt) vers `public/sprites` |
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

## Tests et dates

- **Deux fuseaux, exprès** : Vitest et le serveur e2e tournent en `America/New_York` (offset négatif), le navigateur Playwright en `Europe/Brussels`. Un calcul de date qui dépend du fuseau de la machine échoue donc localement comme en CI. `TEST_TZ` permet d'essayer un autre fuseau pour Vitest.
- **Un seul « maintenant »** pour les e2e : `E2E_NOW` (`tests/e2e/db.ts`, le 14 octobre 2026 à 10:00 UTC) est passé au serveur (`APP_NOW`) et au seed (`SEED_REFERENCE_DATE`). Les données du seed sont datées relativement à cet instant.
- **Build séparé** : les e2e compilent dans `.next-e2e` (`NEXT_DIST_DIR`), pour ne pas gêner un `pnpm dev` ouvert. En CI, `next build` puis `next start` ; en local, `next dev`.
- **Traçabilité** : chaque critère d'acceptation du §12 est cité par son ID dans le titre d'au moins un test ; `pnpm test:spec` le vérifie pour le lot courant (`spec.config.json`).

## Qualité

- **Pre-commit** : `pnpm install` active `.githooks/` (lint des fichiers indexés et vérification des types).
- **CI** : `.github/workflows/ci.yml` lance types, lint, Vitest, Playwright et `test:spec` sur chaque PR et sur `main`.

## Cycle de travail

Chaque lot du §15 suit le même cycle, décrit dans [CLAUDE.md](CLAUDE.md) : branche `lot-N/<slug>`, développement, audit général (`AUDIT-*.md`), audit e2e (`E2E-AUDIT-*.md`), puis corrections sur une branche `audit-fix/…`. Les rapports d'audit restent à la racine, avec l'état de chaque constat.

## Architecture

Voir SPEC.md §3 : UI → Server Actions (`defineAction`) → services (logique pure, testable) → dépôts scopés par jardin. Toute lecture ou écriture vérifie l'adhésion au jardin ; la base impose en plus des clés étrangères composites `(garden_id, …)`.
