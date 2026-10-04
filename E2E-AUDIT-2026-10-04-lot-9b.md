# Audit e2e — GreenU (jardin vivant, lot 9, partie 1)

**Date** : 2026-10-04 · **Commit** : `0dd403f` (branche `lot-9b/jardin-vivant`) · **Playwright 1.63** · **88 tests dans 16 fichiers** (projets `mobile` et `desktop`) · **durée de suite : 12 min** (88/88), plus 8/8 en build de production (`test:e2e:offline`, 1 min)
**Audit précédent** : [E2E-AUDIT-2026-10-04-lot-9.md](E2E-AUDIT-2026-10-04-lot-9.md), specs prioritaires implémentées depuis.

## Verdict

Les six nouveaux tests couvrent les parcours nominaux du jardin vivant avec de vraies preuves (cases en base, requêtes
réseau, attributs du moteur) et un jardin dédié par test, ce qui supprime les croisements de versions du plan. Le trou
principal : les gestes de l'éditeur autres que le pinceau (rectangle, gomme de terrain, pipette) et le refus des
aménagements ponctuels côté interface ne sont exercés par aucun test de navigateur. Action n°1 : E2E-PNT-07b.

## Couverture

Périmètre : le jardin vivant (terrain peint, objets ponctuels, saisons, instantanés du plan, avatars en action). Les
dimensions de tout le produit sont reprises de l'audit précédent, avec les cellules nouvelles.

| Dimension | Couvert | Total | % | Tendance |
|---|---|---|---|---|
| Parcours critiques : chemin nominal | 50 | 59 | 85 % | → (46/55) |
| Parcours critiques : chemin d'échec | 19 | 59 | 32 % | → (18/55) |
| Cellules rôle × ressource × action : autorisé | 40 | 114 | 35 % | → (37/108) |
| Cellules rôle × ressource × action : **refusé** | 29 | 111 | **26 %** | → (28/105) |
| Transitions d'état valides | 13 | 50 | 26 % | → |
| Transitions d'état **invalides refusées** | 1 | 39 | 3 % | → |
| Surfaces temporelles avec un test de bascule (toutes couches) | 20 | 38 | 53 % | ↑ (18/35) |
| Fuseaux testés | 2 | — | — | → navigateur Europe/Brussels, Node America/New_York |

Détail des ajouts :
- **Parcours** (4 nouveaux) : peindre le terrain (nominal PNT-01, échec CONFLICT PNT-05), choisir un outil et un type (VOC-01), voir la saison (TER-01), voir l'action des avatars (LIV-01, LIV-04). Pas d'e2e d'échec pour la saison (atlas absent) ni pour les avatars.
- **Cellules** (6 nouvelles) : peindre [propriétaire : autorisé ✓], [membre sans `plan:edit` : refusé — interface ✓ (PLN-06, outil désactivé), requête forgée en intégration seulement] ; poser un aménagement ponctuel [admin : autorisé ✗ e2e], [membre : refusé ✗ e2e, ✓ intégration PNT-07] ; voir son avatar dans un jardin individuel [✓ LIV-07] ; voir l'avatar d'un autre membre au-delà de 24 h [refus ✓ en intégration].
- **Dates** (3 nouvelles surfaces) : fenêtre des 24 h de l'action (✓ unitaire LIV-08 à la borne exacte), jour local de l'instantané du plan (✗ bascule de minuit non testée), saison selon la date locale et l'hémisphère (✓ unitaire TER-02 pour l'hémisphère ; bascule d'équinoxe ✗).

## Inventaire (tests nouveaux ou modifiés)

| Fichier / titre | Acteur | Type | Assertions | Temps | Valeur |
|---|---|---|---|---|---|
| jardin-vivant › [PNT-01] allée en L de 8 cases | hugo (propriétaire) | nominal | 7, dont cases exactes en base et transitions du moteur | horloge serveur figée | réel |
| jardin-vivant › [PNT-05] deux sessions, CONFLICT et rejeu | hugo × 2 | échec + reprise | 5, versions et cases en base | — | réel |
| jardin-vivant › [VOC-01] outils, aides, vignettes | hugo | nominal | 4 par outil, image chargée | — | réel |
| jardin-vivant › [TER-01] automne, un seul atlas de saison | alice | nominal | 3, réseau | date des e2e (14 oct.) | réel (mutation tuée, voir Méthode) |
| jardin-vivant › [LIV-01] [LIV-07] [LIV-06] avatar qui arrose | hugo | nominal | 5, réseau et texte | arrosage à E2E_NOW − 40 min | réel |
| jardin-vivant › [LIV-04] animations réduites | hugo | état | 4 | — | réel |
| scene › budget des atlas (réécrit) | alice | limite | budget de base + atlas d'action joués | — | réel |
| scene › [PLN-06] (modifié : plus de liste de types) | david | refus | 4 | — | réel, mais refus d'interface seulement |
| avatar › [COL-04] (libellé avec l'action) | bruno, emma | nominal | 7 | — | réel |

Aucun test sans assertion, aucun `.skip` / `.only` / `.fixme`. Une seule attente en dur dans la suite, préexistante et justifiée (`scene.spec.ts:196`, fenêtre d'observation de la boucle).

## Constats

### Majeurs

- **M1 — Le refus des aménagements ponctuels n'est prouvé qu'en intégration.** Dans l'éditeur, un membre sans `plan:edit` voit le point d'eau, le récupérateur, l'arbre et le portail dans la palette « Objets » ; la barrière d'interface (`aria-disabled`, message, aucun geste envoyé : `src/game/PlanEditor.tsx`, branche `tool === 'decor'`) n'est exercée par aucun test, ni le refus de la requête forgée de bout en bout. → E2E-PNT-07b.
- **M2 — Trois gestes de l'éditeur sans aucun test de navigateur.** Rectangle de terrain, gomme de terrain et pipette passent par du code de gestes propre à l'éditeur (`onDown`, `onMove`, `onUp`, `commitStroke`) ; seuls le pinceau et la logique pure (unitaires) sont couverts. Une régression de capture du pointeur ou de mode passerait. → E2E-PNT-08.

### Mineurs

- m1 — `strokeTiles` (`jardin-vivant.spec.ts`) recopie `dragTiles` de `scene.spec.ts` : à extraire dans `helpers.ts`.
- m2 — Le jour local de `plan_snapshot.taken_on` n'est pas testé à la bascule de minuit (édition à 23:30 à Bruxelles = 21:30 UTC) : test d'intégration, pas e2e (voir « Délégué »).
- m3 — Deux fonctions `astronomicalSeason` coexistent (`src/features/progression/quests.pure.ts:27` et `src/features/season/season.pure.ts:29`) ; la vue utilise la première : un test unitaire d'équinoxe sur celle de la vue suffit.

## Specs proposées

```
ID          E2E-PNT-07b
Titre       Un membre sans plan:edit ne peut pas poser un récupérateur d'eau : vignette désactivée, aucun geste envoyé, requête forgée refusée
Parcours    Éditeur de plan, objets                 Priorité  P0 (refus d'autorisation × surface nouvelle)
Pourquoi e2e  Un refus doit être prouvé de bout en bout : barrière d'interface et action serveur, avec une
            session réelle ; les variations de rôle sont déléguées à l'intégration (PNT-07).
Dérivé de   Matrice, cellule [membre, aménagement ponctuel, POSER] = REFUS
Prérequis   Jardin du Canal (collectif, édition réservée aux admins), david (membre)
Étapes      1. david ouvre /plan, outil « Objets », touche « Récupérateur d'eau »
            2. il touche une case libre de la grille
            3. il rejoue l'action applyPlanCommands avec placeDecor rain_barrel (requête capturée sur un banc, objet changé)
Attendu     vignette aria-disabled et message « Réservé aux rôles qui peuvent modifier le plan » ; aucune requête
            d'action après le geste ; la requête forgée répond FORBIDDEN ; aucun récupérateur en base à cette position
Hors périmètre  Les autres objets ponctuels et les autres rôles → intégration.
Durée / place  ~10 s · sous-ensemble bloquant
Risque d'instabilité  Faible : jardin du seed en lecture, aucune écriture attendue
```

```
ID          E2E-PNT-08
Titre       Rectangle, gomme de terrain et pipette : les cases enregistrées suivent les gestes
Parcours    Éditeur de plan, aménagements           Priorité  P1
Pourquoi e2e  Le comportement navigateur (capture du pointeur, modes de l'éditeur) est le sujet même ; les
            règles de peinture sont déjà couvertes en unitaire (terrain.pure).
Prérequis   freshGarden('hugo')
Étapes      1. Rectangle de gravier de (0, 12) à (2, 13)
            2. Gomme de terrain sur (1, 12)
            3. Pipette sur (0, 13) puis pinceau sur (4, 12)
Attendu     en base : 5 cases de gravier aux positions attendues plus (4, 12) en gravier, (1, 12) absente ;
            le mode revient au pinceau après la pipette
Durée / place  ~12 s · sous-ensemble bloquant
Risque d'instabilité  Faible : jardin dédié, attente du statut « Plan enregistré »
```

**Délégué à une couche inférieure (pas d'e2e)** :
- Jour local de l'instantané à minuit : intégration, `recordPlanSnapshot` à `2026-10-14T21:59:00Z` puis `22:01:00Z` (Bruxelles UTC+2) → deux lignes, `taken_on` 2026-10-14 puis 2026-10-15. Fuseau du jardin : Europe/Brussels.
- Bascule de saison : unitaire, `ambientFilter` le 2026-12-20 et le 2026-12-21 (heure locale) → `autumn` puis `winter`, et l'inverse au sud.

## À supprimer ou fusionner

Rien à supprimer. `[LIV-04]` pourrait fusionner avec `[LIV-01]` (même jardin), mais l'émulation d'animations réduites
doit précéder la navigation : deux tests séparés restent plus lisibles.

## Depuis le dernier audit

- Specs du lot 9 implémentées : voir le suivi de l'audit précédent (OFF-03b, OFF-09, STAT-07b…).
- Nouvelles régressions de couverture : aucune ; le test de budget des atlas a été réécrit et reste strict (base sous 3 Mo, atlas d'action seulement pour les actions jouées).
- Ouverts : chemins d'échec et transitions invalides refusées, toujours bas (3 %).

## Méthode et limites

`playwright test --list` (88 tests), suite complète exécutée : 88/88 en 12 min, 8/8 hors-ligne en build de production.
Test de mutation e2e : `ensureSeason` ne chargeant plus l'atlas d'automne → `[TER-01]` passe au rouge (`data-season` vide), code restauré.
Mutation d'intégration (audit général) : permission des aménagements → `[PNT-07]` rouge.
Limites : l'horloge serveur des e2e est unique (14 octobre) : les autres saisons ne se testent pas en e2e ; rendu visuel
vérifié par capture d'écran manuelle, pas par comparaison d'images ; pas d'appareil de référence pour les performances.
