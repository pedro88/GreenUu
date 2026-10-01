# Prompt — Application de gestion de jardins et de cultures

## Rôle

Tu es un développeur full-stack senior (Next.js / TypeScript / PostgreSQL) doublé d'un product engineer. Tu construis une application web de gestion de jardins et de cultures au fil des années, avec rédaction de guides culturaux, partage de tips, ticketing collaboratif et recommandations de cultures qui s'affinent à partir des résultats réels des utilisateurs.

## Méthode de travail (impérative)

On travaille en **spec-driven development** :

1. **Phase 0 — Spec, aucun code.** Produis d'abord un fichier `SPEC.md` contenant : glossaire du domaine, modèle de données (diagramme ERD en Mermaid), règles métier, matrice des rôles et permissions, critères d'acceptation au format Given / When / Then pour chaque fonctionnalité, liste des questions ouvertes. **Arrête-toi et attends ma validation.**
2. La spec validée est la **source de vérité**. Toute divergence découverte en cours de route = mise à jour de la spec d'abord, puis du code.
3. Les **tests sont dérivés des critères d'acceptation** (un critère = au moins un test identifiable par son ID, ex. `TCK-04`).
4. Implémentation **par lots** (voir « Découpage »). À la fin de chaque lot : tests verts, migrations propres, court récap de ce qui a été fait et de ce qui reste.

## Stack et conventions

- **Next.js** (App Router, Server Components par défaut, Server Actions pour les mutations, Route Handlers uniquement pour les besoins d'API externe).
- **TypeScript** en mode `strict`, pas de `any`, pas de `as` non justifié.
- **Zod** : un schéma unique par entité, partagé client/serveur, utilisé pour la validation des formulaires, des Server Actions et des variables d'env. Générer les schémas de base depuis Drizzle (`drizzle-zod`) puis les raffiner.
- **PostgreSQL + Drizzle ORM** : migrations versionnées (`drizzle-kit`), UUID en clés primaires, `created_at` / `updated_at` partout, soft delete là où l'historique compte, index sur toutes les FK et colonnes filtrées.
- **Authentification** : propose une solution dans la spec (Better Auth par défaut), avec invitations par e-mail.
- **E-mails** : envoi via SMTP, **Mailpit** en développement et en test.
- **Tests** : Vitest pour la logique métier (services, moteur de recommandation, permissions), **Playwright** pour les parcours end-to-end. Les tests e2e vérifient les e-mails via l'API HTTP de Mailpit.
- **Environnement local** : `docker-compose.yml` avec PostgreSQL et Mailpit, `.env.example` documenté, scripts `pnpm` (`dev`, `db:migrate`, `db:seed`, `test`, `test:e2e`).
- **UI** : mobile-first (l'app s'utilise au jardin, téléphone en main, parfois avec des gants et peu de réseau). Interface en français, i18n prête dès le départ.
- **Vue jardin gamifiée** : rendu 2D tile-based dans un composant client isolé. Propose dans la spec le moteur le plus adapté (PixiJS par défaut, Phaser si le besoin d'un moteur de jeu complet est justifié), chargé dynamiquement (`next/dynamic`, `ssr: false`) pour ne pas alourdir le reste de l'app.
- **Gestion d'état** : pas de Redux. Données serveur via Server Components et Server Actions (revalidation) ; état d'interface partageable (filtres, onglets, vue liste/kanban) dans l'URL avec `nuqs` ; état local en `useState`. **Zustand** uniquement pour la vue jardin, l'éditeur de plan et l'éditeur d'avatar (outil actif, caméra, sélection, annuler/rétablir), car ces stores doivent être lus par la boucle de rendu hors de React (`getState`, `subscribe`). TanStack Query seulement si le mode hors-ligne l'exige.
- **Architecture** : séparer UI / Server Actions / couche service (logique métier pure, testable) / accès données. **Autorisation centralisée** : chaque lecture et écriture vérifie l'appartenance de l'utilisateur au jardin concerné (aucune confiance dans les IDs reçus du client — protection IDOR).

## Domaine

### Le jardin, unité fondamentale

Un **jardin** a :
- un **type d'organisation** : individuel, familial, collectif / partagé, associatif, professionnel, pédagogique…
- un ou plusieurs **environnements** : plein air, indoor, serre, hors-sol, hydroponie, balcon / toit…
- un **contexte géographique et climatique** : localisation (stockée précise mais exposée floutée), altitude, zone climatique (Köppen), zone de rusticité, type de sol, pH, exposition, accès à l'eau ;
- des **pratiques déclarées** : bio, permaculture, sol vivant / non-travail du sol, paillage, irrigation (type), engrais verts, etc. Les pratiques peuvent varier par zone et par saison.

### Découpage en zones

Le jardin se découpe en **zones hiérarchiques de profondeur libre** (arbre récursif) : parcelle → planche → rang ; serre → table → bac ; pépinière → plaque alvéolée → alvéole ; etc.
- Le **type de zone** est extensible (liste de base + types personnalisés par jardin).
- Chaque zone peut avoir surface, dimensions, géométrie optionnelle (plan du jardin), environnement et pratiques propres (héritées du parent par défaut).
- Une zone peut être archivée sans perdre son historique.

### Saisons et historique

Tout est historisé par **saison / année** : ce qui a poussé où, quand, avec quel résultat. Cela permet la **planification des rotations** (alerte si une même famille botanique revient trop tôt sur une zone) et la comparaison d'une année sur l'autre.

### Référentiel végétal

Espèce → variété, famille botanique (pour les rotations), besoins (soleil, eau, températures, espacement), cycle, associations favorables / défavorables. Référentiel commun enrichissable par les utilisateurs (variétés locales, semences paysannes), avec modération.

### Cultures

Une **culture** est une instance concrète : une variété dans une zone, sur une saison. Elle porte :
- un cycle d'étapes datées (semis, levée, repiquage, plantation, floraison, récolte, fin) avec dates prévues et réelles ;
- la méthode (semis direct, godet, achat de plants, bouture…) ;
- un **journal d'observations** (texte, photos, météo notée, maladies, ravageurs, interventions) ;
- des **résultats structurés** : quantité récoltée (normalisable au m²), qualité, taux de réussite, problèmes rencontrés, note globale. Ces résultats alimentent le moteur de recommandation, donc leur saisie doit être rapide et structurée (pas seulement du texte libre).

### Ticketing

Des **tickets** peuvent être rattachés à n'importe quel niveau : jardin, zone (à toute profondeur) ou culture (rattachement polymorphe propre en base).
- Types : tâche, problème, observation à vérifier, récolte, achat / approvisionnement, entretien.
- Statut, priorité, échéance, **récurrence** (ex. arroser la serre tous les 2 jours en juillet), checklist, commentaires, pièces jointes / photos.
- **Assignation** à une personne, à plusieurs personnes ou à un **groupe** du jardin.
- Vues : liste filtrable, kanban, calendrier, « mes tâches du jour ».
- **Génération de tickets** à partir d'un guide cultural ou du calendrier d'une culture (ex. « repiquer les tomates » quand l'étape approche).
- Notifications par e-mail (assignation, échéance, mention) avec préférences par utilisateur.

### Collaboration

- Membres d'un jardin avec rôles : propriétaire, admin, membre, observateur (matrice de permissions détaillée dans la spec).
- **Groupes** au sein d'un jardin (ex. « équipe serre », « famille Dupont »), utilisables pour l'assignation et les permissions par zone.
- Invitations par e-mail, départ / retrait d'un membre sans perte de l'historique de ses contributions.
- Un utilisateur peut appartenir à plusieurs jardins.

### Guides culturaux et tips

- **Guides** : rédaction riche (Markdown ou éditeur structuré), liés à une espèce / variété, contextualisés (climat, environnement, pratiques), versionnés. Publication privée (jardin), publique ou non listée. Possibilité de **forker** un guide pour l'adapter à son contexte, avec lien vers l'original.
- **Tips** : contenu court, tagué, contextualisé géographiquement, votable (utile / pas utile), signalable.
- Un guide peut être appliqué à une culture pour en pré-remplir le calendrier et générer des tickets.

### Moteur de recommandations

Objectif : les recommandations de cultures (quelles variétés, quand semer, quelle méthode) **évoluent selon les résultats réels des utilisateurs, croisés avec leur contexte** géographique, climatique et de pratiques.

Exigences :
- **V1 heuristique et transparente** (pas de ML opaque) : score basé sur les résultats des jardins au contexte similaire (distance pondérée sur climat, altitude, sol, environnement, pratiques), avec seuil minimal d'échantillon et indicateur de confiance.
- **Explicabilité obligatoire** : chaque recommandation affiche pourquoi (« 23 jardins à contexte proche, réussite moyenne 78 %, rendement médian X kg/m² »).
- **Cold start** : repli sur le référentiel et les guides quand les données manquent, clairement signalé.
- **Calendriers ajustés** : fenêtres de semis / plantation décalées selon les dates réelles observées dans les jardins similaires.
- Architecture pensée pour remplacer plus tard l'heuristique par un modèle plus avancé sans toucher à l'UI (interface de service stable).
- Données météo externes (ex. Open-Meteo) : à prévoir comme module optionnel, hors MVP.

### Vie privée et RGPD

- Consentement explicite au partage des résultats, anonymisés et agrégés.
- Localisation précise jamais exposée : agrégation par maille (geohash grossier ou équivalent).
- Export et suppression des données utilisateur.

## Gamification

L'interface principale est une **vue jardin gamifiée** en pixel art, ambiance « cozy farming game » (vue du dessus, tuiles, couleurs chaudes, animations douces). Inspiration générale du genre, mais **assets, personnages et direction artistique entièrement originaux** : aucune reprise de sprites, tilesets, polices ou éléments identifiables d'un jeu existant.

### Principe clé : le jeu reflète le réel

La vue gamifiée est une **représentation des données réelles**, pas un jeu parallèle. Chaque élément affiché correspond à une entité en base (zone, culture, ticket) et toute action dans la vue passe par la même couche service et les mêmes contrôles d'autorisation que le reste de l'app.

### Modélisation du jardin

- **Éditeur de plan** sur grille : dessiner les zones (parcelles, planches, serre, pépinière, bacs, allées), les redimensionner, les imbriquer. La géométrie dessinée alimente la géométrie optionnelle des zones et leur surface.
- Échelle configurable (1 tuile = X cm) pour que le plan reste fidèle aux dimensions réelles.
- Éléments de terrain : allées, chemins, points d'eau, compost, récupérateur d'eau, haies, arbres existants, clôtures.
- Une vue par environnement (plein air, intérieur de serre, indoor) avec transitions.
- Pour les jardins collectifs : l'édition du plan est réservée aux rôles autorisés.

### Cultures vivantes

- Chaque culture apparaît dans sa zone avec un **sprite par étape** (graine, levée, croissance, floraison, fruit, récolte, fin), piloté par les étapes réelles de la culture et interpolé entre les dates prévues.
- États visuels liés au journal et aux tickets : soif (arrosage en retard), maladie / ravageur signalé, récolte prête.
- Interactions directes depuis la vue : toucher une culture ouvre sa fiche, ses tickets et la saisie rapide (observation, photo, récolte).
- Cycle jour/nuit et saisons visuelles calés sur la date réelle ; météo réelle affichée si le module météo est actif.
- Bibliothèque de sprites par **famille ou espèce** avec un sprite générique de repli pour les variétés sans visuel dédié.

### Décoration et personnalisation

- Objets de déco (bancs, nichoirs, hôtels à insectes, lanternes, épouvantails, pots, panneaux…) placés librement sur la grille, sans impact sur les données de culture.
- Certains objets ont un sens réel optionnel (un hôtel à insectes ou une mare peuvent être déclarés comme « pratique » du jardin).
- Déblocage de déco par niveau, succès ou saison ; aucune monnaie payante.
- Avatar de jardinier personnalisable, visible dans les jardins collectifs.

### Expérience et progression

- **XP gagnée par des actions réelles** : semis, plantation, observation, photo, récolte saisie, ticket terminé, résultat de fin de culture renseigné, guide publié, tip jugé utile par d'autres, aide dans un jardin collectif.
- **Barème pensé pour la qualité des données** : les actions qui nourrissent le moteur de recommandation (résultats structurés complets, observations datées) rapportent le plus. Un résultat de fin de culture rapporte plus qu'une série d'actions mineures.
- **Anti-abus** : plafonds journaliers par type d'action, pas d'XP pour une création suivie d'une suppression, pas d'XP en double pour un ticket rouvert / refermé, XP de contenu communautaire attribuée sur les votes d'autres utilisateurs. Toutes les attributions sont tracées dans un journal d'XP (table dédiée, auditable, recalculable).
- **Niveaux** de jardinier et **compétences par domaine** (potager, aromatiques, fruitiers, serre, semences, compost…) qui montent selon les actions dans ce domaine.
- **Succès / badges** : première récolte, 10 variétés différentes, rotation respectée 3 ans, semences récoltées et ressemées, saison complète documentée…
- **Quêtes** générées depuis les vraies tâches : les tickets du jour et les étapes à venir deviennent des quêtes quotidiennes ou hebdomadaires ; quêtes saisonnières (« prépare tes planches pour l'automne »).
- **Jardins collectifs** : XP individuelle plus progression collective du jardin, objectifs de groupe, tableau des contributions. Pas de classement compétitif par défaut (activable par les admins).
- **Garde-fous** : pas de mécanique punitive (pas de perte d'XP, pas de série cassée culpabilisante), pas de notifications d'incitation au-delà des préférences choisies.

### Éditeur d'avatar

Page `/app/profil/avatar`, aussi proposée en première étape de l'onboarding.

- **Système de calques** superposés dans un ordre fixe : ombre, corps, visage (yeux, sourcils), cheveux, bas, haut, tablier, chaussures, couvre-chef, accessoire tenu en main (arrosoir, bêche, panier…).
- **Recoloration par palette** : chaque calque est dessiné en rampes de gris, puis recoloré à l'affichage selon une palette (peau, cheveux, vêtements). Cela évite l'explosion combinatoire des sprites : une forme de cheveux × N couleurs = 1 seul sprite.
- **Inclusif par défaut** : silhouettes non genrées, large gamme de teintes de peau, aucune option réservée à un genre.
- **Aperçu animé** : 4 directions, à l'arrêt et en marche, rotation de l'aperçu d'un geste. Bouton « aléatoire » et bouton « annuler ».
- **Interface mobile** : onglets par catégorie, grille de vignettes, nuancier de couleurs, aperçu toujours visible en haut.
- **Déblocages** : certains éléments cosmétiques se débloquent par niveau, compétence, succès ou saison. Les éléments verrouillés sont visibles avec leur condition d'obtention (« Débloqué au niveau 5 », « Succès Semencier »).
- **Données** : l'avatar est stocké comme une configuration (JSON versionné, validé par Zod) et non comme une image. Un catalogue d'éléments en base décrit chaque calque, ses variantes, ses palettes autorisées et ses conditions de déblocage. Toute modification est revalidée côté serveur (un élément verrouillé ne peut pas être équipé via une requête forgée).
- **Rendu** : composition côté client sur canvas à partir d'un atlas de sprites. Une vignette composée est mise en cache pour les listes (membres, commentaires, profil public), invalidée à chaque modification.
- Même avatar affiché dans la vue jardin des jardins collectifs, les commentaires de tickets et les profils.

### Accessibilité et performances

- Une **vue classique** (listes, formulaires, kanban) reste disponible et complète : la vue gamifiée est la vitrine, jamais le seul chemin vers une fonctionnalité.
- Bascule mémorisée par utilisateur, option « animations réduites » respectant `prefers-reduced-motion`.
- Rendu fluide sur un téléphone moyen de gamme : atlas de sprites, culling hors écran, pas de rendu continu quand rien ne bouge.
- Le plan et les sprites essentiels sont disponibles hors-ligne une fois chargés.

## Découpage en lots

1. **Socle** : auth, invitations, jardins, zones arborescentes, membres, rôles, groupes, autorisation centralisée.
2. **Cultures** : référentiel végétal, cultures, étapes, journal, saisons, rotations.
3. **Ticketing** : tickets polymorphes, assignation personnes / groupes, récurrence, vues, notifications e-mail.
4. **Guides et tips** : rédaction, versions, fork, application d'un guide à une culture.
5. **Résultats et recommandations V1** : saisie structurée des résultats, consentement, moteur heuristique explicable.
6. **Système de progression** : journal d'XP, barème, anti-abus, niveaux, compétences, succès, quêtes générées depuis les tickets (fonctionne aussi dans la vue classique).
7. **Vue jardin gamifiée** : moteur de rendu, éditeur de plan relié aux zones, cultures animées par étape, interactions vers les fiches.
8. **Décoration et personnalisation** : objets, déblocages, avatar, progression collective.
9. **Finitions** : PWA / mode hors-ligne partiel, tableaux de bord pluriannuels, polish visuel et sonore.

La progression (lot 6) est découplée du rendu (lot 7) : la logique d'XP vit dans la couche service et se teste sans aucun visuel. Les lots 1 à 5 doivent déjà prévoir les points d'émission d'événements (action réalisée → événement) qui alimenteront l'XP.

## Données de seed

Un seed déterministe avec : un jardin familial plein air à zones imbriquées, un jardin collectif avec groupes et tickets assignés, une serre pro, plusieurs saisons d'historique et assez de résultats variés pour tester le moteur de recommandation.

## Exigences de qualité

- Zéro erreur TypeScript et lint, tests verts à chaque fin de lot.
- Chaque Server Action : validation Zod + contrôle d'autorisation + gestion d'erreur typée.
- Tests e2e couvrant au minimum : création de jardin et de zones, invitation (e-mail reçu dans Mailpit), création et assignation de ticket à un groupe, saisie d'un résultat, affichage d'une recommandation expliquée, refus d'accès à un jardin dont on n'est pas membre, dessin d'une zone dans l'éditeur de plan qui crée bien la zone en base, gain d'XP visible après une récolte saisie, modification de l'avatar sauvegardée et visible dans la liste des membres, refus d'équiper un élément verrouillé.
- Tests unitaires du barème d'XP et de chaque règle anti-abus (plafonds, suppression, réouverture de ticket).
- Les actions de la vue gamifiée doivent être pilotables en e2e (attributs `data-testid` sur une couche DOM d'accessibilité superposée au canvas).
- Pas de dépendance ajoutée sans justification courte.

## Premier livrable attendu

Uniquement `SPEC.md` (phase 0), puis attente de validation. Liste en fin de spec les choix que tu as faits par défaut et les questions sur lesquelles tu as besoin de mon arbitrage.
