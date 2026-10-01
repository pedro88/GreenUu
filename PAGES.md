# Inventaire des pages

Routes App Router indicatives. Le lot renvoie au découpage du prompt principal. « Modale » = feuille ou modale par-dessus la page courante, avec URL propre (intercepting routes) quand c'est utile.

## 1. Public et authentification

| Route | Page | Contenu clé | Lot |
|---|---|---|---|
| `/` | Accueil public | Présentation, aperçu de la vue jardin pixel art, appel à l'inscription | 1 |
| `/connexion` | Connexion | E-mail / mot de passe, lien magique éventuel | 1 |
| `/inscription` | Inscription | Création de compte, consentements | 1 |
| `/mot-de-passe-oublie` | Mot de passe oublié | Demande de lien de réinitialisation | 1 |
| `/reinitialisation/[token]` | Réinitialisation | Nouveau mot de passe | 1 |
| `/verification/[token]` | Vérification e-mail | Confirmation, redirection | 1 |
| `/invitation/[token]` | Invitation | Aperçu du jardin, accepter / refuser, création de compte si besoin | 1 |
| `/guides-publics`, `/guides-publics/[slug]` | Guides publics | Consultation sans compte, appel à l'inscription | 4 |
| `/cgu`, `/confidentialite`, `/cookies` | Pages légales | Textes légaux, RGPD | 1 |

## 2. Onboarding

| Route | Page | Contenu clé | Lot |
|---|---|---|---|
| `/bienvenue` | Assistant de démarrage | Étapes : avatar, premier jardin (type, environnement), localisation et contexte (sol, exposition), pratiques, premières zones, consentement au partage des résultats | 1 (avatar en 8) |

## 3. Accueil connecté

| Route | Page | Contenu clé | Lot |
|---|---|---|---|
| `/app` | Tableau de bord | Mes tâches du jour, quêtes, cultures à récolter, alertes (soif, retard), météo, accès aux jardins, XP du jour | 3 / 6 |
| `/app/jardins` | Mes jardins | Cartes des jardins (miniature pixel art, rôle, activité), créer / rejoindre | 1 |
| `/app/jardins/nouveau` | Nouveau jardin | Même assistant que l'onboarding, version courte | 1 |

## 4. Un jardin — `/app/jardins/[jardinId]/…`

| Route | Page | Contenu clé | Lot |
|---|---|---|---|
| `/` | Vue jardin gamifiée | Plan pixel art, cultures animées, bulles d'état, cycle jour/nuit, barre d'actions, bascule vers la vue classique | 7 |
| `/plan` | Éditeur de plan | Grille, outils (zone, allée, structure, déco), palette d'objets, échelle, annuler / rétablir | 7 |
| `/zones` | Zones (vue classique) | Arborescence des zones, surfaces, cultures en cours par zone | 1 |
| `/zones/[zoneId]` | Détail zone | Infos, environnement et pratiques (hérités ou propres), cultures actuelles, historique par saison, tickets | 1 / 2 |
| `/cultures` | Cultures | Liste filtrable (saison, zone, espèce, statut), vue chronologique | 2 |
| `/cultures/nouvelle` | Nouvelle culture | Assistant : espèce / variété, zone, méthode, dates ; recommandations et alertes de rotation intégrées ; appliquer un guide | 2 / 5 |
| `/cultures/[cultureId]` | Détail culture | Frise des étapes, journal (texte, photos), tickets liés, résultats, guide appliqué | 2 |
| modale | Saisie rapide | Observation, photo, arrosage, récolte : 2 taps depuis la vue jardin ou la fiche | 2 |
| `/cultures/[cultureId]/bilan` | Bilan de fin de culture | Résultats structurés (quantité, qualité, réussite, problèmes, note), gain d'XP mis en avant | 5 |
| `/saisons` | Planification et rotations | Calendrier de la saison, historique par zone sur plusieurs années, alertes de rotation | 2 |
| `/recommandations` | Que planter ? | Suggestions par zone et période, avec explication et indicateur de confiance | 5 |
| `/tickets` | Tickets | Bascule liste / kanban / calendrier, filtres (assigné, groupe, niveau, type, échéance) | 3 |
| `/tickets/nouveau` | Nouveau ticket | Rattachement (jardin, zone, culture), type, assignation personnes / groupes, échéance, récurrence, checklist | 3 |
| `/tickets/[ticketId]` | Détail ticket | Description, checklist, commentaires, photos, historique, assignation | 3 |
| `/membres` | Membres et groupes | Liste, rôles, groupes, invitations en attente, tableau des contributions | 1 / 8 |
| `/progression` | Progression collective | Niveau du jardin, objectifs de groupe, succès collectifs | 8 |
| `/statistiques` | Tableau de bord pluriannuel | Rendements par espèce et par zone, comparaison entre années, réussites / échecs | 9 |
| `/parametres` | Paramètres du jardin | Infos, contexte géographique et climatique, pratiques, visibilité, archivage, suppression | 1 |

## 5. Savoirs partagés

| Route | Page | Contenu clé | Lot |
|---|---|---|---|
| `/app/plantes` | Référentiel végétal | Recherche par espèce, famille, type ; filtres | 2 |
| `/app/plantes/[especeId]` | Fiche espèce | Variétés, besoins, associations, calendrier indicatif, guides et tips liés, résultats agrégés de la communauté | 2 / 5 |
| `/app/plantes/proposer` | Proposer une variété | Formulaire soumis à modération | 2 |
| `/app/guides` | Guides | Recherche, filtres par contexte (climat, environnement, pratiques), mes guides | 4 |
| `/app/guides/[guideId]` | Lecture d'un guide | Contenu, contexte, versions, auteur, appliquer à une culture, forker | 4 |
| `/app/guides/nouveau`, `/app/guides/[guideId]/edition` | Éditeur de guide | Rédaction, contexte, espèce liée, calendrier type, visibilité | 4 |
| `/app/guides/[guideId]/versions` | Historique du guide | Liste des versions, comparaison | 4 |
| `/app/tips` | Fil de tips | Tips proches de mon contexte, votes, filtres, création rapide | 4 |

## 6. Profil et progression

| Route | Page | Contenu clé | Lot |
|---|---|---|---|
| `/app/profil` | Mon profil | Avatar, niveau, compétences, succès récents, jardins | 6 |
| `/app/profil/succes` | Succès | Grille de badges obtenus et verrouillés | 6 |
| `/app/profil/quetes` | Quêtes | Quotidiennes, hebdomadaires, saisonnières | 6 |
| `/app/profil/xp` | Journal d'XP | Historique des gains, transparent et auditable | 6 |
| `/app/profil/avatar` | Éditeur d'avatar | Calques (corps, peau, cheveux, chapeau, tenue…), aperçu animé | 8 |
| `/app/jardiniers/[pseudo]` | Profil public | Avatar, niveau, guides et tips publiés (selon visibilité) | 4 |
| `/app/notifications` | Notifications | Centre de notifications, tout marquer comme lu | 3 |

## 7. Paramètres du compte — `/app/parametres/…`

| Route | Page | Contenu clé | Lot |
|---|---|---|---|
| `/compte` | Compte | Nom, e-mail, mot de passe, langue | 1 |
| `/notifications` | Préférences de notification | Par type et par canal | 3 |
| `/affichage` | Affichage et accessibilité | Vue par défaut (gamifiée / classique), animations réduites, thème | 7 |
| `/confidentialite` | Confidentialité | Consentement au partage, visibilité du profil, export et suppression des données | 1 / 5 |

## 8. Administration et modération — `/admin/…`

| Route | Page | Contenu clé | Lot |
|---|---|---|---|
| `/` | Tableau de bord admin | Indicateurs, files d'attente | 4 |
| `/signalements` | Signalements | Guides, tips, profils signalés | 4 |
| `/varietes` | Variétés proposées | Validation, fusion de doublons | 2 |
| `/utilisateurs` | Utilisateurs | Recherche, suspension | 4 |
| `/xp` | Contrôle XP | Détection d'abus, recalcul | 6 |

## 9. Pages système

| Route | Page | Contenu clé |
|---|---|---|
| `not-found` | 404 | Illustration pixel art (parcelle vide, épouvantail perdu) |
| `forbidden` | 403 | « Ce jardin n'est pas le tien », demander une invitation |
| `error` | Erreur | Message, réessayer |
| hors-ligne | Mode hors-ligne | Ce qui reste consultable, actions mises en file d'attente |

**Total** : environ 60 pages et modales, dont une quinzaine d'écrans principaux qui méritent une maquette dédiée.
