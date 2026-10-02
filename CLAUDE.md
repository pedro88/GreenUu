@AGENTS.md

# GreenU — consignes de travail

Application Next.js 16 / TypeScript strict / PostgreSQL 18 / Drizzle / Zod / SCSS. Gestionnaire : **pnpm**.
La référence fonctionnelle est [SPEC.md](SPEC.md) : périmètre des lots au §15, critères d'acceptation au §12, écarts au §18.

## Commandes

| Besoin | Commande |
|---|---|
| Dev (Next + worker) | `pnpm dev` |
| Types | `pnpm typecheck` |
| Lint (ESLint + Stylelint) | `pnpm lint` |
| Tests unitaires / intégration | `pnpm test` |
| Tests e2e (Playwright) | `pnpm test:e2e` |
| Traçabilité critères ↔ tests | `pnpm test:spec` |
| Migrations | `pnpm db:generate` puis `pnpm db:migrate` |
| Seed / reset | `pnpm db:seed` / `pnpm db:reset` |

## Cycle de travail par lot

Chaque lot suit toujours ces cinq étapes, dans cet ordre. On ne passe à l'étape suivante que lorsque la précédente est terminée et committée.

```
1. Branche lot-N/<slug>  →  2. Développement du lot N  →  3. /audit-projet-next  →  4. /audit-e2e  →  5. /audit-corrections
```

### 1. Création et checkout de la branche

- Partir de `main` à jour, **working tree propre** (`git status --porcelain` vide).
- Le lot précédent doit avoir été mergé dans `main`. S'il ne l'est pas encore, demander avant de continuer : soit on merge d'abord, soit on part explicitement de la branche du lot précédent.
- Nom : `lot-N/<slug>` en kebab-case, d'après l'intitulé du §15 (ex. `lot-3/ticketing`, `lot-4/guides-tips`).

```bash
git switch main
git switch -c lot-N/<slug>
```

- Premier commit de la branche : passer `currentLot` à `N` dans [spec.config.json](spec.config.json) (et compléter `transverseByLot` si besoin).

### 2. Développement du lot N

- Périmètre : uniquement ce que le §15 attribue au lot N (contenu, critères, pages). Ce qui relève d'un lot ultérieur n'est pas anticipé.
- Avant de coder, relire le §12.N (critères) et le §15 ; pour Next.js, lire la doc locale `node_modules/next/dist/docs/` (cf. AGENTS.md).
- Chaque critère du lot est cité par son ID (ex. `TCK-03`) dans le titre d'au moins un test — c'est ce que vérifie `pnpm test:spec`.
- Commits : `feat(lot-N): …`, `fix(lot-N): …`, `test(lot-N): …`, `docs: …`. Commits cohérents et relisables, pas un commit géant en fin de lot.
- Migrations : générées par `drizzle-kit`, relues, **jamais éditées après coup**.
- Le lot est terminé quand la **définition de « terminé » du §15** est remplie :
  1. `pnpm typecheck` et `pnpm lint` sans erreur ni avertissement ;
  2. `pnpm test`, `pnpm test:e2e`, `pnpm test:spec` au vert (lot courant et précédents) ;
  3. migrations appliquées sur base vide **et** sur la base du lot précédent avec seed ;
  4. seed à jour ;
  5. SPEC.md à jour, écarts consignés au §18 ;
  6. récap court : fait, reste, décisions, dette.

### 3. Audit — `/audit-projet-next`

- Lancé sur la branche du lot, une fois l'étape 2 terminée et committée.
- Produit `AUDIT-YYYY-MM-DD.md` à la racine. L'audit **ne modifie pas le code**.
- Committer le rapport sur la branche du lot : `docs(lot-N): rapport d'audit YYYY-MM-DD`. L'étape suivante exige un working tree propre.

### 4. Audit e2e — `/audit-e2e`

- Lancé sur la branche du lot, juste après l'audit général.
- Produit `E2E-AUDIT-YYYY-MM-DD.md` à la racine : couverture Playwright (parcours, rôles, états, dates), hygiène de la suite et specs rédigées pour les manques. **Aucun code de test n'est écrit** à cette étape.
- Les matrices de rôles s'appuient sur la matrice des permissions (SPEC.md §5.2), et les parcours sur les critères du §12.
- Committer le rapport : `docs(lot-N): rapport d'audit e2e YYYY-MM-DD`.

### 5. Corrections — `/audit-corrections`

- Lancé depuis la branche du lot, les deux rapports committés.
- Le skill crée `audit-fix/YYYY-MM-DD` à partir de la branche du lot.
- **Passe 1 — `AUDIT-*.md`** : constats **critiques et majeurs**, un constat = un commit `fix(audit): …`.
- **Passe 2 — `E2E-AUDIT-*.md`**, sur la même branche, après la passe 1 : implémenter les specs prioritaires du rapport (trous d'autorisation et transitions refusées d'abord), une spec ou un groupe cohérent = un commit `test(audit-e2e): …`. Les suppressions et fusions de tests proposées sont appliquées dans des commits à part. Un test qui révèle un bug n'est pas « corrigé » en assouplissant le test : le bug est remonté.
- Après chaque passe : `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`, `pnpm test:spec`, comparés à la baseline.
- Mettre à jour l'état de chaque constat et de chaque spec dans les deux rapports (commit final séparé).
- Les constats en attente de décision (migration destructive, règle métier, rupture d'API…) sont remontés, pas tranchés.
- Fin de cycle, **à faire par l'utilisateur ou sur demande explicite** :
  1. relire le diff `git diff lot-N/<slug>...audit-fix/YYYY-MM-DD` ;
  2. merger `audit-fix/YYYY-MM-DD` dans `lot-N/<slug>` ;
  3. merger `lot-N/<slug>` dans `main`.

## Règles générales

- Ne jamais merger, pousser, ouvrir de PR ni supprimer de branche sans demande explicite.
- Ne jamais mélanger deux lots, ni des corrections d'audit avec du développement en cours, dans une même branche.
- Les sprites (`sprites*/`, `out*/`, `generer_sprites.py`, `SPRITES.md`) sont gérés à part : ne pas y toucher.
- Style visuel : se référer aux maquettes ; la marque est **GreenU**.
