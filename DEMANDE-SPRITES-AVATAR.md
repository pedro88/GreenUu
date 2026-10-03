# Demande de sprites — variantes d'avatar

**Pour** : la session sprites (`generer_sprites.py`, livraison dans `out_hd/`).
**Objet** : donner plus de finesse à l'éditeur d'avatar de GreenU : formes de visage, corpulences, tailles, âges, yeux.
**État côté application** : le code est prêt (branche `lot-8/avatar-variantes`). Un élément apparaît dans l'éditeur dès que ses sprites sont livrés et synchronisés (`pnpm assets:sync`), sans autre modification. Rien n'est verrouillé : tout est disponible dès le départ.

## 1. Conventions inchangées

Ce sont celles des sprites d'avatar HD déjà livrés :

- **Frame** : 64 × 96 px, ancrage en bas au centre. Toutes les frames d'un même élément ont la même taille.
- **Nom** : `avatar/<clé>-<direction>-<pose>.png`.
  - Directions : `bas`, `haut`, `gauche`, `droite`.
  - Poses obligatoires : `arret`, `marche-f1` à `marche-f4`.
  - Les poses d'action déjà produites (`arroser`, `becher`, `semer`, etc.) sont bienvenues, avec les mêmes noms. À défaut, l'application utilise `arret`.
- **La frame `<clé>-bas-arret.png` est indispensable** : c'est elle qui rend l'élément disponible, et elle sert aux vignettes.
- **Niveaux de gris réservés** (R = G = B, opaques), du plus clair au plus sombre :

| Emplacement | Gris |
|---|---|
| principal | 224, 168, 112, 64 |
| secondaire | 200, 144, 88, 40 |

- **Couleurs fixes** : le contour `#2a1c1e` (42, 28, 30) et les couleurs non grises ne sont jamais recolorés. Les pixels transparents restent transparents.
- **Neutralité** : aucune variante n'est liée à un genre (SPEC §10.2). Les silhouettes ne diffèrent que par la corpulence et la taille.

## 2. Silhouettes (corps sans tête)

| Clé | Contenu |
|---|---|
| `corps-<corpulence>-<taille>` | corps, cou et mains, **sans la tête** ; peau en gris de l'emplacement principal |

- Corpulence : `mince`, `moyenne`, `ronde`. Taille : `petite`, `moyenne`, `grande`. Cela fait 9 silhouettes.
- Le **gabarit** d'une silhouette est `<corpulence>-<taille>`, par exemple `ronde-grande`.
- Le gabarit de référence est `moyenne-moyenne`. Il doit être aligné exactement sur `corps-base` : le cou au même endroit, les épaules à la même hauteur.
- `corps-base` (tête comprise) reste valable : c'est la « silhouette d'origine ».

## 3. Tête et visage

Tout ce qui se porte sur la tête est dessiné **pour le gabarit de référence**, à la position de la tête de `corps-base`. L'application le décale pour les autres gabarits (voir §5).

| Clé | Contenu | Couleur |
|---|---|---|
| `tete-ronde`, `tete-ovale`, `tete-carree`, `tete-coeur`, `tete-longue` | contour du visage, oreilles, nez, bouche ; ni yeux, ni sourcils, ni cheveux | peau : gris principal (recolorée comme le corps) |
| `yeux-ronds`, `yeux-amande`, `yeux-fins`, `yeux-grands`, `yeux-cils`, `yeux-mi-clos` | yeux | iris en gris principal ; le blanc et le contour en couleurs fixes |
| `sourcils-fins`, `sourcils-epais` | sourcils | gris principal (recolorés avec une palette de cheveux) |
| `age-enfant` | joues plus rondes, teint plus clair | ombres de peau en gris principal ; le rose des joues en couleur fixe |
| `age-mur` | ridules au coin des yeux, ombres légères | gris principal |
| `age-aine` | rides marquées, plis du cou | gris principal |

Points d'attention :
- Les yeux, sourcils et signes d'âge doivent tomber juste sur les **5 formes** de tête. Dessiner dans la zone commune aux cinq.
- Les cheveux et couvre-chefs existants (`cheveux-*`, `couvre-chef-*`) doivent couvrir la forme la plus large (`tete-carree`). Les reprendre si ce n'est pas le cas.

## 4. Vêtements ajustés à la silhouette

Pour chaque élément ajusté, une variante par gabarit autre que `moyenne-moyenne` : `avatar/<clé>@<gabarit>-<direction>-<pose>.png`, par exemple `haut-tshirt@ronde-grande-bas-arret.png`.

- Éléments concernés : `haut-tshirt`, `haut-pull`, `bas-pantalon`, `bas-short`, `tablier-jardinier`, `chaussures-baskets`, `chaussures-bottes`, `accessoire-arrosoir`, `accessoire-panier`, `accessoire-beche` (position de la main).
- Si une variante manque, l'application prend la version de base. Le vêtement s'affiche alors mal ajusté sur cette silhouette, sans erreur.

## 5. Table des décalages de tête : `out_hd/avatar/gabarits.json`

Elle donne, pour chaque gabarit, le décalage en pixels HD à appliquer aux calques de tête : tête, yeux, sourcils, âge, cheveux, couvre-chef. Le décalage est donné par direction et pose (marche et respiration comprises), sinon par `*`.

```json
{
  "v": 1,
  "gabarits": {
    "mince-grande": { "*": [0, -8], "bas-marche-f2": [0, -9], "haut-marche-f2": [0, -9] },
    "ronde-petite": { "*": [0, 6] }
  }
}
```

- `[dx, dy]` sont des entiers, en pixels HD, avec y vers le bas.
- `moyenne-moyenne` vaut toujours `[0, 0]` et n'a pas besoin d'entrée.
- L'application cherche dans cet ordre : `<direction>-<pose>`, puis `<direction>-arret`, puis `*`.

## 6. Priorités suggérées

| Priorité | Contenu | Frames (152 par élément, poses d'action comprises) |
|---|---|---|
| P1 | 5 têtes, 6 yeux, 3 signes d'âge | ~2 100 |
| P1 | 3 silhouettes `moyenne-petite`, `moyenne-moyenne`, `moyenne-grande`, leurs vêtements ajustés et `gabarits.json` | ~3 500 |
| P2 | les 6 autres silhouettes (`mince-*`, `ronde-*`) et leurs vêtements ajustés | ~8 100 |
| P2 | 2 sourcils | ~300 |

Sans les poses d'action, compter 20 frames par élément au lieu de 152.

## 7. Après livraison

Côté GreenU : `pnpm assets:sync`, puis `pnpm db:reference`. Le catalogue d'avatar en base est déjà à jour, mais la commande est sans risque. La liste des sprites livrés (`src/generated/avatar-sprites.ts`) est régénérée, et les nouveaux éléments apparaissent dans l'éditeur. Un aperçu de contrôle : `exemples-avatars.png`, avec une silhouette de chaque gabarit, habillée.
