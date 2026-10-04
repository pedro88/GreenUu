# Demande — lot 9 : plan du jardin, saisons et avatars en action

**Pour** : la session application (SPEC, code, tests). **De** : la session sprites, d'après les décisions de l'utilisateur du 2026-10-03.
**Contexte** : `PREPARATION-JARDIN-VIVANT.md` (état des lieux vérifié dans le code, décisions, sprites livrés au §7).
**Cadre** : ces éléments **entrent dans le lot 9**, en plus de son contenu actuel (§12.10 : OFF, STAT). Le reste du « jardin vivant » (remplissage des parcelles, avatars qui se déplacent et papotent, timelapse) reste au lot 10. À reporter dans SPEC.md (§9, §12.10, §15, §18) au premier commit du lot, comme le prévoit le cycle.

## 1. Ce que l'utilisateur a remonté

1. **« On ne peut pas utiliser les sprites de courbe, donc on ne sait faire que du droit. »** Le terrain est un rectangle (`terrain_element.geometry`, `src/server/db/schema/scene.ts:22`) rempli d'une texture répétée (`pixi-scene.ts:154`) : les transitions dual-grid aux bords arrondis, livrées depuis longtemps (`transitions/herbe-*`), ne sont jamais utilisées.
2. **« Je ne comprends pas ce que signifient type de zone et élément de terrain. »** Libellés `plan.tool_zone`, `plan.tool_terrain`, `plan.zoneType`, `plan.terrainKind` (`src/i18n/messages/fr.json`) : la distinction est réelle mais exprimée en vocabulaire de modèle de données.
3. **« Il faut que l'app utilise les atlas d'actions. »** Les poses d'action de l'avatar sont livrées (`out_hd/avatar-action-<action>.json`, 13 actions) mais ni copiées par `assets:sync`, ni affichées.

## 2. Terrain peint case par case (décision : approche « cases », pas de formes vectorielles)

### Modèle
- Le terrain **surfacique** devient un ensemble de cases de la grille du plan : nouvelle table `terrain_cell(garden_id, scene_zone_id, x, y, kind)`, unique sur `(garden_id, scene_zone_id, x, y)`, mêmes FK composites que `terrain_element`, `x`/`y` en tuiles (la taille réelle découle de `garden.tile_size_cm`). Une case n'a qu'un seul type.
- Types peints et sprites correspondants :

| Type (proposition de code) | Libellé | Tuile pleine | Transition avec l'herbe |
|---|---|---|---|
| `path` | Allée en terre | `tuiles/chemin-*` | `transitions/herbe-chemin-*` |
| `gravel_path` | Allée de gravier | `tuiles/gravier-*` | `transitions/herbe-gravier-*` |
| `water` | Eau (mare, bassin) | `tuiles/eau-f1..f3` | `transitions/herbe-eau-*` |
| `bare_soil` | Terre nue | `tuiles/terre-nue-*` | `transitions/herbe-terre-*` |
| `mulch` | Paillage | `tuiles/paillage-paille-*` | `transitions/terre-paillage-*` (sur terre) |
| `stepping_stones` | Pas japonais, dalles | `tuiles/dalles-1..2` | aucune (bord net) |

- **Linéaires** peints aussi en cases, raccordés automatiquement selon les voisins : `hedge` (`structures/haie-h`, `-v`, `-coin-no/ne/so/se`, `-seule`) et `fence` (`structures/cloture-*`). Les pièces en **T et en croix manquent** : la session sprites les produit (§6).
- **Ponctuels** : `water_point`, `rain_barrel`, `existing_tree`, `gate` deviennent des **objets posés** comme la déco (une position, pas un rectangle), avec leurs sprites actuels (`structures/robinet`, `structures/recuperateur-eau`, `cultures/pommier-*`, `structures/portail-*`).
- **Migration** des données existantes : rastériser chaque `terrain_element` surfacique ou linéaire en cases, convertir les ponctuels en objets posés à leur centre. `terrain_element` est conservée tant que la conversion n'est pas vérifiée, puis retirée dans une migration ultérieure (suppression de table : décision explicite de l'utilisateur au moment voulu).
- Historique (§4) : `terrain_cell` et les objets posés passent en suppression logique ou entrent dans l'instantané du plan du jour.

### Rendu
- Dual-grid : la grille d'affichage est décalée d'une demi-tuile ; chaque tuile d'affichage lit ses 4 coins (masque haut-gauche = 1, haut-droit = 2, bas-gauche = 4, bas-droit = 8, voir `sprites_hd/tuiles.py`).
- **Plusieurs types voisins** (une allée qui longe une mare) : chaque type est une couche, dessinée par-dessus l'herbe dans un ordre fixe (eau, terre nue, paillage, allée, gravier, dalles). Les couches utilisent les **transitions à fond transparent** livrées par la session sprites (§6) : les transitions actuelles sont opaques (elles contiennent l'herbe) et une couche recouvrirait sa voisine.
- Variante 1 à 3 de chaque tuile tirée d'une fonction pure de `(x, y)` ; variante saisonnière selon §3.
- Performances : le terrain est déjà précalculé par blocs de 16 × 16 tuiles (§9.1) ; seul le bloc modifié est recalculé.

### Éditeur
- Outils **pinceau** (une case, ou un carré de 2 × 2 / 3 × 3) et **rectangle** (pour remplir vite), gomme de terrain, pipette.
- Commandes `paintTerrain({ cells, kind })` et `eraseTerrain({ cells })` dans `applyPlanCommands` (même transaction tout-ou-rien, même `baseVersion`), bornées en nombre de cases par lot.
- Les zones cultivées restent des rectangles (elles le sont en réalité et leur surface sert aux calculs) ; on peut peindre du terrain sous une zone, la zone s'affiche par-dessus.

## 3. Vocabulaire et choix visuel dans l'éditeur

- Outils renommés : **« Espaces cultivés »** (aujourd'hui « Zone » : planche, carré, serre, verger…) et **« Aménagements »** (aujourd'hui « Terrain » : allées, eau, haies, clôtures…), plus **« Objets »** pour la déco et les ponctuels (§2).
- Une phrase d'aide sous chaque outil : « Un espace cultivé a un historique : cultures, tâches, récoltes » ; « Un aménagement dessine le jardin, sans historique ».
- Le choix du type se fait par **vignettes de sprites** (la tuile ou l'objet réel, comme la palette de déco) et non plus par liste déroulante ; le libellé du type reste lisible pour l'accessibilité.
- Libellés à revoir : `plan.zoneType` → « Quel espace ? », `plan.terrainKind` → « Quel aménagement ? » (à valider avec l'utilisateur).

## 4. Historique du plan et saisons du terrain (déjà décidés)

- Instantanés du plan, option B de `PREPARATION-JARDIN-VIVANT.md` §4.2 : une ligne par jour de modification et par jardin, écrite dans la transaction de `applyPlanCommands` et des modifications de géométrie hors éditeur ; terrain et déco en suppression logique.
- Saisons du terrain, §1 du même document, avec les sprites livrés (§7) : clés `<clé>-<saison>-<n>`, repli sur la clé de base, pièces de planche et de carré saisonnières, surcouches `neige/` l'hiver, étapes du pommier pour l'arbre existant.

## 5. Avatars qui jouent leur vraie action (avancé du lot 10)

- `assets:sync` copie aussi `avatar-action-<action>.json` et leurs pages (même budget de 2,5 Mo par atlas, déjà respecté : 0,4 à 0,9 Mo).
- L'instantané de scène ajoute à chaque avatar sa **dernière action réelle** et son ancienneté (correspondance proposée au §3 de la préparation : arrosage → `arroser`, semis → `semer`, récolte → `recolter`, observation → `observer`, photo → `photo`, ticket terminé → `content`, travail du sol → `becher`, sinon `porter`).
- La composition charge l'atlas d'une action **seulement** quand un avatar présent la joue ; l'avatar joue l'action en boucle près de la zone concernée, figé sur la première frame en animations réduites. Pendant une action : accessoire équipé masqué, calques `-<action>-f<n>`, puis `outil-…`, puis `effet-…` (variantes `@<gabarit>` comprises), comme `sprites_hd/avatars_demo.py`.
- Avatars aussi dans les jardins **personnels et familiaux** : l'utilisateur courant et les membres actifs dans les 24 h (décision 3).

## 6. Ce que la session sprites livre pour ce lot

- Transitions à fond transparent pour chaque type peint (`transitions/alpha-<type>[-<saison>]-<masque>` (été sans suffixe de saison), 4 saisons), à superposer en couches.
- Pièces de haie et de clôture en T et en croix (et leurs versions saisonnières pour la haie).
- Livraison dans `out_hd/` ; la session app synchronise (`pnpm assets:sync`).

## 7. Critères proposés (à intégrer au §12.10)

| ID | Étant donné | Quand | Alors | Test |
|---|---|---|---|---|
| PNT-01 | l'éditeur de plan, outil « Aménagements », type « Allée en terre » | on peint une allée en L de 8 cases | 8 cases `path` sont enregistrées, et l'allée s'affiche avec des bords arrondis (tuiles de transition) | E |
| PNT-02 | une allée peinte le long d'une mare peinte | rendu | les deux restent visibles avec leurs bords, aucune ne recouvre l'autre d'herbe | U |
| PNT-03 | un plan existant avec un `terrain_element` rectangle d'allée et un récupérateur d'eau | migration | l'allée devient les cases équivalentes, le récupérateur un objet posé à son centre | I |
| PNT-04 | des cases de haie peintes en T | rendu | la pièce en T est utilisée | U |
| PNT-05 | un lot de peinture concurrent (`baseVersion` dépassée) | enregistrement | `CONFLICT`, rejeu sans perte, comme les autres commandes | E |
| VOC-01 | l'éditeur de plan | ouverture | les outils s'appellent « Espaces cultivés », « Aménagements », « Objets », chacun avec sa phrase d'aide, et les types se choisissent par vignettes accessibles | E |
| TER-01 à TER-04 | voir `PREPARATION-JARDIN-VIVANT.md` §1 | | | |
| TLP-01 | voir `PREPARATION-JARDIN-VIVANT.md` §4 (instantané du plan dans la transaction) | | | I |
| LIV-01 | Lucie a arrosé la Planche 2 il y a une heure | vue jardin | son avatar joue « arroser » près de la Planche 2, et seul l'atlas `avatar-action-arroser` est téléchargé en plus | E |
| LIV-04 | `prefers-reduced-motion` | vue jardin | l'avatar montre la première frame de son action, sans animation | E |
| LIV-07 | un jardin personnel dont je suis seul membre | vue jardin | mon avatar est affiché, près de la zone de ma dernière action | E |

## 8. Atlas livrés et à synchroniser (état au 2026-10-03)

`out_hd/` livre maintenant des atlas séparés, tous sous le budget de 2,5 Mo de `assets:sync` :

| Atlas | Contenu | Pages | Poids | Chargé |
|---|---|---|---|---|
| `atlas.json` | scène hors saisons (l'herbe saisonnière de fond y reste, comme aujourd'hui), objets, haies et clôtures avec leurs raccords, transitions à fond transparent d'été | 1 | 1,17 Mo | toujours |
| `saison-printemps.json`, `saison-automne.json`, `saison-hiver.json` | tuiles, transitions (opaques et à fond transparent), pièces de planche et de carré, haies de la saison ; surcouches `neige/` dans l'hiver | 1 chacun | 0,30 à 0,35 Mo | **seulement la saison courante** |
| `avatar-atlas.json` | avatar, arrêt et marche | 4 | 0,84 Mo | dès qu'un avatar est affiché |
| `avatar-action-<action>.json` | une action (13) | 2 à 3 | 0,38 à 0,92 Mo | **seulement les actions jouées** |

À faire côté app :
- `scripts/sync-assets.ts` copie aussi `saison-*.json` et `avatar-action-*.json` avec leurs pages (`related_multi_packs`), sous le même budget par atlas ;
- la scène charge `atlas.json` plus l'atlas de la saison courante, et cherche une frame saisonnière d'abord dans celui-ci (repli sur la clé de base, §2 et `PREPARATION-JARDIN-VIVANT.md` §1) ;
- le test e2e de budget de la vue jardin (`tests/e2e/scene.spec.ts`, moins de 3 Mo d'atlas) reste valable : base, saison et avatar font environ 2,3 Mo.
