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
| `pnpm typecheck` | Types des routes (`next typegen`) puis `tsc` |
| `pnpm lint` | ESLint + Stylelint |
| `pnpm test` | Vitest : unitaires et intégration (base `greenu_test`) |
| `pnpm test:e2e` | Playwright (réinitialise et seede `greenu_test`, serveur sur le port 3100) |
| `pnpm test:spec` | Vérifie que chaque critère d'acceptation du lot courant a un test au vert |
| `pnpm db:generate` / `db:migrate` / `db:seed` / `db:reset` | Migrations Drizzle, seed déterministe, remise à zéro (dev) |

## Qualité

- **Pre-commit** : `pnpm install` active `.githooks/` (lint des fichiers indexés et vérification des types).
- **CI** : `.github/workflows/ci.yml` lance types, lint, Vitest, Playwright et `test:spec` sur chaque PR et sur `main`.

## Architecture

Voir SPEC.md §3 : UI → Server Actions (`defineAction`) → services (logique pure, testable) → dépôts scopés par jardin. Toute lecture ou écriture vérifie l'adhésion au jardin ; la base impose en plus des clés étrangères composites `(garden_id, …)`.
