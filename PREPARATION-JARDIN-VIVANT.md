# Préparation — « jardin vivant » (saisons, remplissage, avatars, timelapse)

**Pour** : la session application (SPEC, code) et la session sprites (`sprites_hd/`, livraison dans `out_hd/`).
**Objet** : cadrer quatre évolutions de la vue jardin avant de les inscrire dans la SPEC : terrain qui suit les saisons, parcelles remplies de plants, avatars qui vivent dans le jardin, historique graphique en timelapse.
**État** : décisions prises le 2026-10-03 (ci-dessous) ; à reporter dans SPEC.md par la session application. Les identifiants de critères (`TER`, `FIL`, `LIV`, `TLP`) sont libres dans la SPEC actuelle. Production des sprites lancée côté session sprites.

## Décisions (2026-10-03)

| # | Question | Décision |
|---|---|---|
| 1 | Enregistrer l'historique du plan dès maintenant | **Oui**, dans le lot 9 (§4.2, option B : instantanés du plan, suppression logique du terrain et de la déco) |
| 2 | Lot dédié ou répartition | **Répartition** : lot 9 = historique du plan et saisons du terrain ; lot 10 = remplissage des parcelles, avatars vivants, timelapse |
| 3 | Avatars dans les jardins personnels et familiaux | **Oui** : l'avatar de l'utilisateur courant et ceux des membres actifs |
| 4 | Honnêteté de la scène | **Oui** : un avatar rejoue sa dernière action réelle ; marcher, porter, papoter restent génériques, sans texte inventé |
| 5 | Partage public ou export vidéo du timelapse | **Non** pour cette version |

## 0. Ce qu'il faut décider en premier

1. **Commencer tout de suite à enregistrer l'historique du plan** (§4.2), même si le timelapse vient plus tard. Aujourd'hui la géométrie des zones est écrasée sans trace, `moveZone` la remet à `null`, le terrain et la déco sont supprimés physiquement : chaque jour sans enregistrement est un jour que le timelapse ne pourra jamais montrer. Seules les cultures sont reconstructibles rétroactivement (dates réelles des étapes).
2. **Où placer ce travail** : proposition d'un lot 10 « Jardin vivant » après le lot 9 (finitions, hors-ligne), sauf l'enregistrement de l'historique, à glisser dans le lot 9.
3. **Avatars hors jardins collectifs** : aujourd'hui ils n'apparaissent que dans les jardins `collective`, `association` et `educational`. Faut-il montrer son propre avatar dans un jardin personnel ou familial ? (Proposition : oui, l'avatar de l'utilisateur courant, et ceux des membres de la famille actifs.)
4. **Honnêteté de la scène** (principe déjà posé : « la vue gamifiée est une représentation des données réelles ») : les avatars ne doivent pas inventer d'activité. Proposition : un avatar rejoue sa **dernière action réelle** (arroser s'il a arrosé), et les comportements d'ambiance (marcher, porter, papoter) restent visiblement génériques, sans texte inventé.

## 1. Terrain qui évolue avec la saison

### État actuel (vérifié dans le code)
- Seule l'herbe de fond change : `grassFrame(season, 1)` (`src/game/manifest.ts:151`, utilisé `src/game/engine/pixi-scene.ts:128`), variante toujours `1`.
- `TERRAIN_FRAMES` et `ZONE_FRAMES` (`manifest.ts:136-149`) sont des tables fixes, sans saison ; les transitions dual-grid livrées ne sont pas utilisées par le moteur.
- Le filtre de couleur ne dépend que de la période du jour (`src/features/scene/ambient.pure.ts:32-37`) ; la saison est calculée (`ambient.pure.ts:40-45`, hémisphère selon la latitude) mais n'agit que sur l'herbe.

### Proposition
- **Clés saisonnières** : convention `<clé>-<saison>-<n>` (déjà celle de l'herbe), avec repli sur la clé de base si la variante manque (même logique que le repli des plantes, §9.2).
- **Ce qui varie** :
  - herbe (déjà livrée), terre des planches (givre et neige l'hiver, feuilles mortes l'automne), chemin et terre battue (flaques au printemps, feuilles l'automne, neige l'hiver), paillage, gravier ;
  - transitions dual-grid de l'herbe (`herbe-terre`, `herbe-chemin`, `herbe-gravier`, `herbe-eau`) dans les quatre saisons, sinon le bord d'herbe garde la couleur d'été ;
  - haies et arbres existants (`existing_tree`) : nus l'hiver, fleuris au printemps, orangés l'automne ;
  - eau : gelée l'hiver (une frame).
- **Variantes 1 à 3** : tirer la variante par une fonction pure de la position de la tuile (pas d'aléatoire au rendu), pour casser la répétition sans clignotement.
- **Teinte saisonnière** légère, en plus de la teinte jour/nuit (proposition : printemps neutre, été légèrement chaud, automne doré, hiver bleuté), désactivable dans `/affichage` avec les animations.
- **Transition** : bascule à la date astronomique, sans fondu (une seule fois par saison). Option à décider : « saison choisie » dans `/affichage` (forcer l'hiver pour voir le rendu).

### Côté sprites (à produire)
| Lot | Contenu | Volume |
|---|---|---|
| P1 | terre, terre nue, chemin, terre battue, paillage, gravier × 3 saisons (été = base) × 3 variantes | ~54 tuiles |
| P1 | transitions `herbe-terre`, `herbe-chemin` × 3 saisons × 16 | 96 tuiles |
| P2 | transitions `herbe-gravier`, `herbe-eau`, `terre-paillage` × 3 saisons × 16 ; eau gelée | ~145 tuiles |
| P2 | haie (7 pièces) et arbre existant × 3 saisons | ~25 sprites |
| P3 | neige sur les structures (rebord des planches, toit de serre et de cabane) en surcouche | ~20 sprites |

Budget : l'atlas de scène reste sous 2,5 Mo (contrôle de `assets:sync`). Si la saison fait dépasser, livrer **un atlas de scène par saison** (`atlas-hiver.json`…) et ne charger que la saison courante.

### Critères proposés
| ID | Étant donné | Quand | Alors | Test |
|---|---|---|---|---|
| TER-01 | un jardin de l'hémisphère nord au 15 janvier, et les tuiles d'hiver livrées | on ouvre la vue jardin | l'herbe, les planches et les chemins utilisent leurs variantes d'hiver (`data-season="winter"` sur le canvas) | E |
| TER-02 | le même jardin situé à −34° de latitude | même date | la saison affichée est l'été | U |
| TER-03 | une variante saisonnière absente du manifeste | rendu | la clé de base est utilisée, sans erreur | U |
| TER-04 | deux rendus successifs de la même scène | — | chaque tuile garde la même variante (tirage déterministe par position) | U |

## 2. Parcelles remplies de plants

### État actuel
- Un sprite par culture, au centre de sa case : `layoutInRect(rect, count)` (`src/features/scene/grid.pure.ts:41-49`) répartit les **cultures** d'une zone en grille, pas les plants.
- La base connaît déjà ce qu'il faut : `culture.plant_count` et `culture.area_m2` (nullables, `src/server/db/schema/culture.ts:24-25`), `species.spacing_plant_cm` et `spacing_row_cm` (`src/server/db/schema/plant.ts`). Aucun n'est dans l'instantané de scène (`snapshot.ts:80-84`).

### Proposition
- **Nombre de plants affichés** : `plant_count` s'il est saisi ; sinon dérivé de la surface (`area_m2`, ou part de la zone) et des espacements de l'espèce ; sinon un défaut par modèle visuel. **Plafond d'affichage** (proposition : 48 plants par culture, 200 par scène) : au-delà, on garde la densité visuelle en espaçant, et l'infobulle donne le vrai nombre.
- **Disposition** : en rangs parallèles au grand côté de la zone, espacés selon `spacing_row_cm` converti en pixels via `garden.tile_size_cm` ; plants en quinconce d'un rang à l'autre. Plusieurs cultures dans une même zone : la zone est découpée en bandes proportionnelles à leur surface.
- **Variété visuelle sans aléatoire au rendu** : pour chaque plant, un décalage de ±2 px, un miroir horizontal et un léger décalage de phase (un plant sur cinq un peu plus ou moins avancé dans sa phase), tous tirés d'une graine `(culture_id, index)`.
- **Niveau de détail** : au zoom arrière, remplacer les plants par un « massif » (un sprite de rang ou de zone) pour rester sous le budget de sprites.
- **Interaction et accessibilité** : un seul bouton accessible par culture (sur l'emprise de la culture, pas un par plant), aria-label inchangé avec le nombre de plants. Les bulles d'état restent au-dessus du plant central.
- **Instantané** : ajouter `plantCount` (effectif ou estimé, et sa source), `footprint` (rectangle de la culture dans la zone) et les espacements à `sceneCultureSchema`.

### Côté sprites (à produire)
- **Indispensable** : rien, les sprites actuels suffisent (un plant par sprite).
- **Recommandé (P2)** : pour les cultures semées en ligne et denses (carotte, radis, épinard, laitue à couper, oignon, poireau), un sprite de **rang** 64×32 par phase, plus lisible que 40 petits plants ; et 2 variantes par phase pour les espèces P1 (casse l'effet clone). Environ 6 espèces × 5 phases × (1 rang + 1 variante) ≈ 60 sprites.

### Critères proposés
| ID | Étant donné | Quand | Alors | Test |
|---|---|---|---|---|
| FIL-01 | une culture de tomates avec `plant_count = 8` dans une planche | vue jardin | 8 plants sont dessinés, en rangs dans l'emprise de la culture (`data-plants="8"`) | E |
| FIL-02 | une culture de carottes de 2 m² sans `plant_count` | — | le nombre de plants affiché est dérivé de la surface et des espacements de l'espèce, borné au plafond | U |
| FIL-03 | deux cultures dans la même planche | — | chacune occupe une bande proportionnelle à sa surface, sans chevauchement | U |
| FIL-04 | la même scène rendue deux fois | — | positions et miroirs des plants identiques (tirage déterministe) | U |
| FIL-05 | une culture de 60 plants | lecteur d'écran | un seul élément accessible pour la culture, qui annonce 60 plants | E |

## 3. Avatars qui vivent dans le jardin

### État actuel
- Sélection : membres actifs dans les 24 h, jardins collectifs seulement (`src/features/scene/avatars.ts:15-38`) ; le type de la dernière action n'est pas lu (seuls `actor_id`, `zone_id`, `pseudo`).
- Rendu : alignés sous la zone (`spotsBelow`, `grid.pure.ts:59-61`), toujours de face (`'bas'`), aller-retour de ±12 px (`pixi-scene.ts:307-313`), aucune pose d'action.
- La boucle d'animation s'arrête 20 s après la dernière interaction et ne tourne pas en animations réduites (`src/game/engine/loop.ts:11-12`, `:68-70`).
- Côté sprites, tout existe déjà en HD pour les 4 directions : marche, et 10 actions (arroser, bêcher, semer, planter, récolter, observer, photo, porter, saluer, content), avec outils et effets, pour les 9 gabarits (`out_hd/avatar/`, SPRITES.md §11). Elles ne sont plus dans l'atlas d'avatar depuis l'audit du 2026-10-03 (M1) : il faudra les y remettre, ou les charger à la demande (atlas d'actions séparé, chargé seulement quand un avatar en joue une).

### Proposition
- **Données** : ajouter à `SceneAvatar` la dernière action (type d'événement → action visuelle) et son ancienneté. Correspondance proposée : arrosage → `arroser` ; étape semis → `semer` ; plantation → `planter` ; récolte → `recolter` ; observation, problème → `observer` ; photo → `photo` ; ticket terminé → `content` ; travail du sol (tag `soil`) → `becher` ; sinon `porter`.
- **Comportement** (machine à états côté client, déterministe par `(userId, jour)`) :
  1. **travailler** : l'avatar va à la zone de sa dernière action et y joue l'action correspondante quelques secondes ;
  2. **se déplacer** : vers une autre zone où il a agi dans les 24 h, ou vers un point d'intérêt (composteur, banc, cabane, point d'eau) ; chemins préférés, planches et structures évitées (recherche de chemin sur la grille, A* simple) ; direction et miroir suivent le déplacement ;
  3. **porter** : après une récolte, trajet vers le composteur ou la cabane avec le panier ;
  4. **papoter** : quand deux avatars passent à moins de 2 tuiles, ils se tournent l'un vers l'autre et échangent des bulles **à pictogramme seulement** (« … », cœur, plante, soleil), jamais de texte ;
  5. **se reposer** : sur un banc posé en déco, s'il y en a un.
- **Sobriété** : en animations réduites, rien ne bouge (pose d'action figée, comme aujourd'hui) ; sinon la boucle reste à 30 i/s et s'arrête après 20 s sans interaction, les avatars se figeant dans leur état courant. Nombre d'avatars animés plafonné (proposition : 12), les autres immobiles.
- **Accessibilité** : la couche DOM n'expose pas les déplacements ; la liste textuelle de la scène dit « Lucie a arrosé les tomates il y a 2 h » (information réelle, pas l'animation).
- **Jardins non collectifs** : selon la décision du §0.3.

### Côté sprites (à produire)
| Lot | Contenu |
|---|---|
| P1 | atlas d'actions séparé (ou intégré à l'atlas d'avatar) limité aux actions utilisées, sous budget |
| P1 | pose `papoter` (2-3 frames, gestes de main, tête qui hoche), 4 directions, 9 gabarits |
| P1 | bulles de conversation 32×32 : « … », cœur, plante, soleil, goutte, point d'exclamation doux |
| P2 | pose `assis` (sur un banc), 4 directions ; brouette poussée (marche + brouette) |

### Critères proposés
| ID | Étant donné | Quand | Alors | Test |
|---|---|---|---|---|
| LIV-01 | Lucie a enregistré un arrosage sur la Planche 2 il y a une heure | vue jardin | son avatar est près de la Planche 2 et joue l'action « arroser » (`data-avatar-action="arroser"`) | E |
| LIV-02 | deux avatars à moins de 2 tuiles | boucle d'animation | ils se font face et affichent une bulle à pictogramme, sans texte | U |
| LIV-03 | un trajet entre deux zones | calcul | le chemin évite les planches et structures, et emprunte les chemins s'il en existe | U |
| LIV-04 | `prefers-reduced-motion` | vue jardin | aucun avatar ne se déplace ; chacun montre la pose figée de sa dernière action | E |
| LIV-05 | 20 s sans interaction | — | la boucle s'arrête (`data-ticker="stopped"`), les avatars restent à leur place | E |
| LIV-06 | la liste textuelle de la scène | lecteur d'écran | elle donne la dernière action réelle de chaque avatar et son ancienneté | E |

## 4. Historique graphique en timelapse

### État actuel
- L'instantané de scène ne sait pas se placer dans le passé : `now` ne sert qu'aux phases, à la fenêtre des avatars et au filtre (`src/features/scene/snapshot.ts:25`) ; zones, terrain et déco sont lus dans leur état courant.
- Les événements de domaine ne portent ni géométrie ni position (`zone.updated` ne garde que les noms de champs, `decor.*` que le code de l'objet).
- Le terrain et la déco sont « supprimables, sans historique » (`src/server/db/schema/scene.ts:13`, `:45`) ; `moveZone` remet la géométrie à `null`.
- En revanche, les cultures sont reconstructibles à n'importe quelle date : dates réelles et prévues des étapes (`culture_stage`), `occupied_from` et `occupied_to`.

### 4.1 Expérience proposée
- Page ou mode « Histoire du jardin » (`/app/jardins/[id]/histoire`) : la vue jardin en lecture seule, une frise sous le canvas (mois et saisons), un bouton lecture.
- **Lecture** : une image par semaine (réglable : jour, semaine, mois), environ 4 images par seconde ; entre deux images, les plants changent de phase et les zones apparaissent ou disparaissent en fondu court. La date et la saison sont affichées en grand ; le terrain prend ses variantes saisonnières (§1), ce qui rend le passage des saisons visible.
- **Repères** sur la frise : premières récoltes, créations de zones, succès obtenus (événements réels).
- Sans données de plan (période antérieure à l'enregistrement de l'historique) : on rejoue les cultures sur le plan actuel, avec un bandeau « Plan reconstitué à partir du plan actuel avant le <date> ».
- Animations réduites : pas de lecture automatique, navigation image par image.
- Hors périmètre proposé : export en vidéo ou GIF (à décider, voir §5).

### 4.2 Données à enregistrer (à faire au plus tôt)
Deux options, la seconde est recommandée :
- **A. Événements enrichis** : `zone.created`, `zone.updated`, `decor.*`, `terrain.*` portent la valeur (géométrie, position) ; la scène à une date se reconstruit en rejouant les événements. Précis, mais reconstruction coûteuse et fragile (dépend de tous les événements passés).
- **B. Instantanés du plan** (recommandé) : une table `plan_snapshot(garden_id, taken_on, plan_version, payload jsonb)` qui stocke zones (géométrie, type, nom, archivage), terrain et déco. Écrite dans la même transaction que `applyPlanCommands` et que toute modification de géométrie hors éditeur (`setZoneGeometry`, `moveZone`, archivage), au plus une par jour et par jardin (la dernière de la journée remplace les précédentes). Le timelapse lit l'instantané en vigueur à chaque date, et recalcule les phases des cultures à cette date avec `visualPhase` (déjà pure, §9.3).
  Volume : quelques ko par jardin et par jour de modification ; purge ou compactage au-delà de 5 ans à décider (RGPD : les données suivent la suppression du jardin).
- Dans les deux cas : le terrain et la déco passent en suppression logique (`removed_at`) pour que l'instantané du jour reste juste.

### 4.3 Performance
- La lecture précharge les instantanés de la période (une requête bornée par la période et par jardin), calcule toutes les images côté client (fonctions pures), et ne crée pas de texture par image : mêmes sprites que la vue, seule la scène change.
- Plafond proposé : 3 ans par lecture, 160 images.

### Côté sprites
Aucun sprite nouveau indispensable : les phases des cultures et les variantes saisonnières (§1) suffisent. En option (P3) : pictogrammes de repères pour la frise (récolte, nouvelle zone, succès) en 24×24, dans le style des icônes `ui/`.

### Critères proposés
| ID | Étant donné | Quand | Alors | Test |
|---|---|---|---|---|
| TLP-01 | une modification du plan enregistrée | même transaction | un instantané du plan du jour existe pour ce jardin (un seul par jour) | I |
| TLP-02 | un jardin avec une planche créée le 1er avril et des tomates semées le 10 avril, récoltées en août | lecture du timelapse d'avril à septembre | la planche apparaît à partir d'avril, les tomates passent de graine à récolte dans l'ordre des phases réelles | E |
| TLP-03 | une date antérieure au premier instantané | — | le plan actuel est utilisé et un bandeau l'indique | E |
| TLP-04 | une zone archivée en juin | lecture | elle disparaît à partir de juin, avec ses cultures terminées | I |
| TLP-05 | un membre sans droit de lecture sur le jardin | `/histoire` | refus (mêmes droits que la vue jardin) | I |
| TLP-06 | `prefers-reduced-motion` | ouverture | pas de lecture automatique, navigation image par image au clavier | E |

## 5. Questions ouvertes

1. Lot 10 dédié, ou répartition entre le lot 9 (historique du plan, saisons du terrain) et un lot 10 (remplissage, avatars, timelapse) ?
2. Avatars dans les jardins personnels et familiaux (§0.3).
3. Timelapse partageable (lien public, comme les guides) ou export vidéo / GIF ? Proposition : non au MVP de la fonctionnalité.
4. Saison forcée dans `/affichage` (voir l'hiver en été) : utile pour la démonstration, à confirmer.
5. Plafonds proposés (48 plants par culture, 200 par scène, 12 avatars animés, 160 images de timelapse) : à valider sur l'appareil de référence de NFR-04.

## 6. Ordre de réalisation suggéré

| Étape | Contenu | Dépend de | Côté |
|---|---|---|---|
| 1 | Instantanés du plan et suppression logique du terrain et de la déco (§4.2) | décision §0.1 | app (migration) |
| 2 | Tuiles et transitions saisonnières P1 | — | sprites |
| 3 | Saisons du terrain dans le moteur (§1) | 2 | app |
| 4 | Remplissage des parcelles (§2) | — | app (sprites de rang en P2) |
| 5 | Pose `papoter`, bulles, atlas d'actions | — | sprites |
| 6 | Avatars vivants (§3) | 5 | app |
| 7 | Timelapse (§4) | 1, 3 (et 4 pour le rendu) | app |

## 7. Sprites livrés (2026-10-03, `out_hd/`)

Générés par `python3 -m sprites.build --pkg sprites_hd`, aperçus dans `out_hd/apercus/` et `out_hd/gifs/actions/`. Total du jeu HD : 22 201 sprites.

### Terrain saisonnier (§1), module `sprites_hd/saisons.py`, 405 sprites
- Saisons `printemps`, `automne`, `hiver` ; l'été est la version de base. La saison s'insère avant la variante ou le masque : `tuiles/terre-hiver-2`, `transitions/herbe-chemin-automne-07`.
- P1 : tuiles `terre`, `terre-nue`, `chemin`, `terre-battue`, `paillage-paille`, `gravier` × 3 saisons × 3 variantes ; transitions `herbe-terre` et `herbe-chemin` × 3 saisons × 16 ; **pièces saisonnières de la planche** `structures/planche-<pos>-<saison>` (9 × 3) **et du carré potager** `structures/carre-<pièce>-<saison>` (16 × 3) : même bois au pixel près, seule la terre intérieure change.
- P2 : transitions `herbe-gravier`, `herbe-eau` (eau gelée l'hiver), `terre-paillage` × 3 saisons ; `tuiles/eau-gelee-1` ; haie `structures/haie-<pièce>-<saison>` (7 × 3).
- P3 : surcouches `neige/planche-<pos>` (8 pièces, rien sur `centre`) à poser **par-dessus** `planche-<pos>-hiver` ; `neige/serre-toit`, `neige/cabane-toit` (pièces `milieu*`) et leurs versions `-debut` / `-fin`. Pas encore de surcouche pour le carré potager.
- Chaque transition saisonnière a exactement la même frontière que sa version d'été (vérifié par script) : changer de saison ne fait pas bouger les bords.
- **Arbre existant** : aucun sprite nouveau, utiliser les étapes du pommier selon la saison (`cultures/pommier-1-hiver`, `-2-bourgeons` ou `-3-floraison` au printemps, `-4-feuillage` l'été, `-6-automne`).

### Remplissage (§2), module `sprites_hd/rangs.py`, 84 sprites
- `rangs/<espece>-<n>-<etape>` (P2), 64×32, ancré en bas au centre, pied des plants à y = 25 : carotte, radis, oignon (modèle racine), épinard, laitue, poireau (modèle feuille). Une étincelle par rang à l'étape récolte : l'app peut n'en garder qu'une par culture.
- `cultures/<espece>-<n>-<etape>-b` (P2) : variante de chaque étape des 10 espèces P1, même taille et même ancrage que la base, à alterner avec elle (tirage déterministe par plant).

### Avatars (§3), modules `sprites_hd/avatar.py` et `sprites_hd/conversation.py`
- Nouvelles actions, pour tous les calques, les 9 gabarits et les 4 directions, mêmes conventions que les autres actions :
  - `papoter` (3 frames, boucle, pas d'outil) ;
  - `assis` (2 frames, pas d'outil) : placer le canevas de l'avatar à `x = banc.x + 32`, bas des deux canevas alignés, sur `deco/banc` ;
  - `brouette` (4 frames) : outil `outil-brouette-<dir>-f<n>` ; de profil, la brouette dépasse du canevas : tuile complémentaire `outil-brouette-avant-<gauche|droite>-f<n>` (et `@<gabarit>`), à dessiner à x − 64 pour `gauche` et x + 64 pour `droite`.
- Bulles de conversation `conversation/<picto>` (P1), 32×32, pictogrammes seulement : `points`, `coeur`, `plante`, `soleil`, `goutte`, `exclamation`, `rire`, `question` ; animation `conversation/apparition-f1..f3`. Point d'ancrage : la pointe de la queue en (4, 29), à retourner en miroir pour un avatar tourné vers la gauche (sauf `rire`, dont les notes s'inversent).
- `gabarits.json` : 48 entrées de décalage de tête ajoutées pour les nouvelles poses, aucune entrée existante modifiée.

### Atlas (tous sous le budget de 2,5 Mo de `assets:sync`)
| Atlas | Contenu | Pages | Poids |
|---|---|---|---|
| `atlas.json` | scène, saisons comprises | 2 | 1,90 Mo |
| `avatar-atlas.json` | avatar, arrêt et marche | 4 | 1,09 Mo |
| `avatar-action-<action>.json` | une action : calques, outil, effet, tous les gabarits (13 actions) | 2 à 3 | 0,38 à 0,92 Mo |

**À faire côté application** :
- `scripts/sync-assets.ts` ne copie aujourd'hui que `atlas.json` et `avatar-atlas.json` : ajouter les `avatar-action-*.json` (même budget par atlas) ;
- charger un atlas d'action à la demande, seulement pour les actions jouées par les avatars présents ;
- l'atlas de scène n'a plus que 0,6 Mo de marge : si d'autres variantes saisonnières s'ajoutent, prévoir un atlas de scène par saison et ne charger que la saison courante.
