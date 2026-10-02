# SPEC — GreenU, gestion de jardins et de cultures

> **Statut** : v0.11 — validée le 2026-10-01, mise à jour en fin de lot 7. Les propositions du §17 sont retenues comme décisions provisoires, révisables avant le lot concerné.
> **Date** : 2026-10-01
> **Documents liés** : [PROMPT-app-jardin.md](PROMPT-app-jardin.md) (cahier des charges), [PAGES.md](PAGES.md) (inventaire des routes).
> **Hors périmètre de cette spec** : la production des assets visuels (sprites, tuiles, atlas, icônes pixel art) est traitée séparément. Cette spec définit seulement le **contrat** que le moteur de rendu attend de ces assets (§9.2).
> **Règle** : cette spec est la source de vérité. Toute divergence découverte pendant l'implémentation entraîne d'abord une mise à jour de ce fichier (avec incrément de version et entrée au journal des modifications, §18), puis du code.

## Sommaire

1. [Vision et périmètre](#1-vision-et-périmètre)
2. [Glossaire du domaine](#2-glossaire-du-domaine)
3. [Architecture technique](#3-architecture-technique)
4. [Modèle de données](#4-modèle-de-données)
5. [Rôles et permissions](#5-rôles-et-permissions)
6. [Règles métier](#6-règles-métier)
7. [Moteur de recommandations V1](#7-moteur-de-recommandations-v1)
8. [Système de progression](#8-système-de-progression)
9. [Vue jardin gamifiée](#9-vue-jardin-gamifiée)
10. [Éditeur d'avatar](#10-éditeur-davatar)
11. [Vie privée et RGPD](#11-vie-privée-et-rgpd)
12. [Critères d'acceptation](#12-critères-dacceptation)
13. [Stratégie de tests et traçabilité](#13-stratégie-de-tests-et-traçabilité)
14. [Données de seed](#14-données-de-seed)
15. [Lots et définition de « terminé »](#15-lots-et-définition-de--terminé-)
16. [Choix faits par défaut](#16-choix-faits-par-défaut)
17. [Questions ouvertes](#17-questions-ouvertes)
18. [Journal des modifications](#18-journal-des-modifications)

---

## 1. Vision et périmètre

GreenU sert à gérer un ou plusieurs jardins sur plusieurs années : découpage en zones, cultures et leur cycle, journal d'observations, résultats structurés, tickets collaboratifs, guides culturaux et tips. Des recommandations de cultures s'affinent à partir des résultats réels de jardins au contexte similaire. La vue principale est un **jardin en pixel art** qui représente les données réelles. Une **vue classique** complète permet d'accéder à toutes les fonctionnalités sans passer par la vue gamifiée.

### 1.1 Utilisateurs cibles

| Persona | Contexte | Besoins prioritaires |
|---|---|---|
| Jardinier·e individuel·le ou familial·e | Potager de 20 à 300 m², téléphone au jardin | Saisie rapide, rotations, « que planter ? » |
| Jardin collectif ou associatif | 5 à 80 membres, parcelles et tâches partagées | Tickets, groupes, assignation, contributions |
| Maraîcher·e ou serre pro | Volumes, planification serrée | Calendrier, récurrence, rendement au m² |
| Jardin pédagogique | Enseignant·e et élèves, observateurs | Rôles en lecture, journal photo, progression collective |

### 1.2 Périmètre du MVP (lots 1 à 8)

Tout le contenu du prompt, **sauf** les points ci-dessous, qui sont prévus mais hors MVP :

- module météo externe (Open-Meteo) : une interface `WeatherProvider` est réservée, sans implémentation (lot 9 ou plus tard) ;
- mode hors-ligne avec file d'actions : lot 9 ;
- tableaux de bord pluriannuels (`/statistiques`) : lot 9 ;
- sons et polish visuel avancé : lot 9 ;
- notifications push (web push) : hors périmètre. Les canaux sont l'e-mail et le centre de notifications in-app.

### 1.3 Contraintes non fonctionnelles

| ID | Contrainte | Cible mesurable |
|---|---|---|
| NFR-01 | Mobile-first | Toutes les pages sont utilisables à 360 px de large. Cibles tactiles ≥ 48 × 48 px, et ≥ 56 px pour les actions principales de saisie rapide (usage avec des gants). |
| NFR-02 | Faible réseau | Page jardin en vue classique : moins de 150 ko de JS transféré, vue gamifiée exclue. La vue gamifiée est chargée à la demande. Photos compressées côté client avant envoi (≤ 1600 px, ~300 ko). |
| NFR-03 | Saisie rapide | Observation, arrosage, récolte : au plus 2 taps pour ouvrir la saisie depuis la vue jardin ou la fiche culture, au plus 3 champs obligatoires. |
| NFR-04 | Rendu | Vue jardin à au moins 30 i/s sur un téléphone milieu de gamme (référence : équivalent Pixel 6a) pour un jardin de 60 × 40 tuiles. Aucun rendu quand rien ne bouge. |
| NFR-05 | Accessibilité | Vue classique conforme WCAG 2.1 AA. Vue gamifiée doublée d'une couche DOM accessible (§9.6). |
| NFR-06 | i18n | Aucune chaîne en dur dans les composants. Français par défaut, structure prête pour l'anglais. |
| NFR-07 | Sécurité | Autorisation vérifiée côté serveur sur chaque lecture et chaque écriture. Aucune confiance dans les IDs reçus du client (§3.3). |

---

## 2. Glossaire du domaine

Le code utilise les termes anglais entre parenthèses (identifiants techniques). L'interface et la spec utilisent les termes français.

| Terme | Code | Définition |
|---|---|---|
| Jardin | `garden` | Unité fondamentale. Possède des membres, des zones, des saisons, un contexte géographique et climatique, des pratiques. |
| Type d'organisation | `garden.orgType` | Individuel, familial, collectif / partagé, associatif, professionnel, pédagogique. Fixe des valeurs par défaut (droit d'édition du plan, classement…). |
| Environnement | `environment` | Conditions de culture : plein air, serre, tunnel, indoor, hors-sol, hydroponie, balcon / toit. Un jardin en a un ou plusieurs ; une zone en a exactement un (hérité ou propre). |
| Contexte | `context` | Localisation floutée, altitude, zone Köppen, zone de rusticité, sol, pH, exposition, accès à l'eau, environnement, pratiques. Base du calcul de similarité. |
| Pratique | `practice` | Mode de culture déclaré (bio, permaculture, sol vivant, paillage, goutte-à-goutte…). Déclarée au niveau du jardin ou d'une zone, éventuellement bornée à une saison. |
| Zone | `zone` | Nœud de l'arbre récursif du jardin (parcelle, planche, rang, serre, table, bac, pépinière, plaque, alvéole, composteur…). |
| Type de zone | `zoneType` | Catégorie de zone : liste de base globale plus types personnalisés par jardin. |
| Zone effective | — | Valeurs d'une zone calculées après héritage depuis ses ancêtres (environnement, pratiques). |
| Scène | `scene` | Plan 2D affiché par la vue jardin : la scène extérieure du jardin, ou l'intérieur d'une zone marquée « avec intérieur » (serre, local indoor). |
| Élément de terrain | `terrainElement` | Élément du plan sans culture ni ticket propre : allée, chemin, point d'eau, récupérateur, haie, arbre existant, clôture. |
| Saison | `season` | Année culturale d'un jardin (par défaut du 1er janvier au 31 décembre). Les cultures et les bilans y sont rattachés. |
| Famille botanique | `botanicalFamily` | Sert aux rotations. Porte un délai de retour recommandé, en années. |
| Espèce | `species` | Ex. *Solanum lycopersicum*. Porte les besoins, le cycle, le modèle d'étapes visuelles et le domaine de compétence. |
| Variété | `variety` | Ex. « Cœur de bœuf ». Les utilisateurs peuvent en proposer ; elles sont soumises à modération. |
| Association | `companion` | Relation favorable ou défavorable entre deux espèces. |
| Culture | `culture` | Instance concrète : une variété (ou à défaut une espèce) dans une zone, sur une saison, avec une méthode. |
| Méthode | `culture.method` | Semis direct, semis en godet ou en plaque, achat de plants, bouture, division, plantation de bulbes ou tubercules, greffe. |
| Étape | `cultureStage` | Jalon daté de la culture (semis, levée, repiquage, plantation, floraison, fructification, récolte, fin…), avec une date prévue et une date réelle. |
| Journal | `journalEntry` | Entrée datée sur une culture ou une zone : note, météo notée, maladie, ravageur, intervention, photo. |
| Récolte | `harvest` | Saisie ponctuelle d'une quantité récoltée. |
| Bilan | `cultureResult` | Résultat structuré de fin de culture (rendement, qualité, réussite, problèmes, note). Alimente le moteur de recommandations. |
| Ticket | `ticket` | Élément de travail rattaché au jardin, à une zone ou à une culture : tâche, problème, observation à vérifier, récolte, achat / approvisionnement, entretien. |
| Série récurrente | `ticketSeries` | Modèle de ticket doté d'une règle de récurrence, qui génère des occurrences. |
| Occurrence | — | Ticket généré par une série pour une date donnée. |
| Membre | `gardenMember` | Lien utilisateur ↔ jardin avec un rôle. Conservé après le départ du membre, pour l'historique. |
| Groupe | `group` | Sous-ensemble nommé des membres d'un jardin, utilisable pour l'assignation et pour les permissions par zone. |
| Invitation | `gardenInvitation` | Invitation par e-mail à rejoindre un jardin avec un rôle donné. |
| Guide | `guide` | Contenu cultural riche, versionné, lié à une espèce ou une variété, contextualisé. |
| Version de guide | `guideVersion` | Instantané immuable d'un guide, créé à chaque publication. |
| Fork | — | Nouveau guide créé à partir d'une version d'un autre guide, avec lien vers l'original. |
| Tip | `tip` | Contenu court, tagué, contextualisé, votable et signalable. |
| Recommandation | — | Suggestion calculée (variété, fenêtre de semis, méthode) accompagnée de son explication et d'un indice de confiance. |
| Démarrage à froid | `coldStart` | Recommandation fondée sur le référentiel et les guides, faute de données communautaires suffisantes. |
| Fait partagé | `sharedResultFact` | Ligne anonymisée et agrégeable dérivée d'un bilan dont le partage est consenti. Seule source de données communautaires du moteur. |
| Événement de domaine | `domainEvent` | Fait métier enregistré (par exemple « récolte saisie »), émis par la couche service dans la même transaction que l'action. |
| XP | `xpLedgerEntry` | Point d'expérience. Chaque attribution et chaque annulation est une ligne du journal d'XP. |
| Compétence | `skill` | Domaine de progression : potager, aromatiques, fruitiers, fleurs, serre, semences, compost. |
| Succès | `achievement` | Badge obtenu selon des critères évalués sur l'historique réel. |
| Quête | `quest` | Objectif temporaire (quotidien, hebdomadaire, saisonnier), dérivé de tickets ou d'étapes réels, ou d'un modèle saisonnier. |
| Objet de déco | `decorItem` | Objet placé sur le plan, sans effet sur les données de culture, sauf s'il est déclaré comme pratique. |
| Avatar | `avatar` | Configuration JSON versionnée de calques et de palettes. |
| Vue classique / vue jardin | — | Interface en listes, formulaires et kanban, et interface pixel art. Le choix est mémorisé par utilisateur. |

---

## 3. Architecture technique

### 3.1 Choix techniques

| Sujet | Choix | Justification |
|---|---|---|
| Framework | Next.js, dernière version stable au démarrage du lot 1 (App Router, React 19) | Imposé. Server Components par défaut, Server Actions pour les mutations. Les Route Handlers servent seulement aux fichiers, aux callbacks d'auth et aux besoins d'API externe. |
| Langage | TypeScript `strict`, avec `noUncheckedIndexedAccess` et `exactOptionalPropertyTypes` | Imposé, durci. Pas de `any`. Chaque `as` porte un commentaire `// as: <raison>`, vérifié par une règle de lint. |
| Base de données | PostgreSQL 18 | Fournit `uuidv7()` en natif : clés triées dans le temps, index plus compacts que l'UUID v4. Extensions : `pg_trgm` et `unaccent` (recherche de plantes), `citext` (e-mails). **Pas de PostGIS** : un geohash et la latitude / longitude en `numeric` suffisent (§11). |
| ORM | Drizzle ORM, `drizzle-kit` (migrations SQL versionnées et relues), `drizzle-zod` | Imposé. |
| Driver | `postgres` (postgres.js) | Léger, compatible Drizzle, transactions et types personnalisés. |
| Validation | Zod 4 | Imposé. Un module `schema.ts` par entité : base générée par `drizzle-zod`, puis raffinée (bornes, messages i18n), et partagée entre client et serveur. |
| Authentification | **Better Auth** : e-mail + mot de passe, vérification d'e-mail, réinitialisation, lien magique en option ; adaptateur Drizzle ; sessions en base | Défaut demandé. TypeScript natif, auto-hébergé, sans dépendance à un SaaS. **Les invitations aux jardins passent par notre propre table** et non par le plugin `organization` : les adhésions doivent garder l'historique (départs, changements de rôle), les permissions par zone sont propres au domaine, et l'autorisation doit rester centralisée dans notre couche service. |
| E-mails | `nodemailer` en SMTP ; Mailpit en dev et en test | Standard SMTP. Les gabarits sont des fonctions TypeScript typées (HTML et texte), sans moteur de templates supplémentaire. |
| Jobs et planification | **pg-boss** | File de jobs sur PostgreSQL, sans Redis supplémentaire. Sert à l'outbox des événements, aux e-mails, aux rappels d'échéance, à la matérialisation des récurrences, au rafraîchissement des agrégats et aux exports RGPD. Tourne dans un processus `worker` séparé (`pnpm worker`). |
| Récurrence | `rrule` | Implémentation éprouvée de la RFC 5545 : inutile d'écrire notre propre moteur de récurrence. |
| i18n | `next-intl` | Compatible avec les Server Components, messages typés, formatage `Intl`. Routes en français sans préfixe de locale en V1 (§17 Q-19). |
| Dates et fuseaux | `date-fns` + `@date-fns/tz` | Calcul de « aujourd'hui dans le fuseau du jardin » et des bornes de jour pour les plafonds d'XP. |
| Styles | **SCSS** (`sass`), en CSS Modules (`*.module.scss`) par composant, plus une couche globale `src/styles/` : `_tokens.scss` (design tokens exposés en propriétés CSS personnalisées `--color-*`, `--space-*`, `--radius-*`, `--font-*`, pour le thème clair, le thème sombre et le mode contraste), `_mixins.scss` (points de rupture mobile-first, focus visible, `reduced-motion`, cibles tactiles), `_reset.scss`. Pas de Tailwind. | Choix de l'équipe. Next.js gère SCSS et CSS Modules nativement : il suffit d'ajouter `sass`. Les tokens en propriétés CSS sont lisibles à l'exécution, notamment par la vue gamifiée pour harmoniser ses couleurs d'interface. Une règle Stylelint (`stylelint-config-standard-scss`) interdit les couleurs en dur hors de `_tokens.scss`. |
| Composants UI | Primitives **Radix UI** (`@radix-ui/react-*` : Dialog, DropdownMenu, Tabs, Popover, Select, Toast…), sans styles, habillées en SCSS dans `src/components/ui/` | Accessibilité (focus, clavier, ARIA) sans librairie de composants stylée. shadcn/ui est écarté parce qu'il repose sur Tailwind. Icônes de la vue classique : `lucide-react`. |
| État URL | `nuqs` | Imposé : filtres, onglets, mode liste / kanban / calendrier. |
| État client riche | `zustand`, réservé à la vue jardin, à l'éditeur de plan et à l'éditeur d'avatar | Imposé : ces stores sont lus hors de React par la boucle de rendu (`getState`, `subscribe`). |
| Moteur 2D | **PixiJS v8** (voir §9.1) | Le besoin se limite à un rendu de tuiles et de sprites avec culling et rendu à la demande ; pas de physique, de scènes de jeu ni de gestion d'entrées avancée. Phaser ajouterait environ 1 Mo et une boucle de jeu continue qu'il faudrait désactiver. PixiJS est chargé via `next/dynamic` avec `ssr: false`. |
| Markdown | `react-markdown` + `remark-gfm` + `rehype-sanitize` | Guides en Markdown, rendus côté serveur et assainis. Éditeur : `textarea` avec barre d'outils et onglet d'aperçu, léger et utilisable sur mobile. |
| Diff de versions | `diff` | Comparaison entre deux versions d'un guide. |
| Stockage de fichiers | Interface `FileStorage` avec un pilote disque local (dev, test) et un pilote S3-compatible (prod) basé sur `@aws-sdk/client-s3`, ajouté seulement au moment du déploiement | Les fichiers privés sont servis par un Route Handler qui vérifie l'autorisation. Pas de MinIO dans `docker-compose` en V1 (§17 Q-12). |
| PWA (lot 9) | Serwist | Successeur maintenu de `next-pwa`. |
| Tests | Vitest (unitaires, et intégration sur un PostgreSQL réel), Playwright (e2e) | Imposé. |

Tout ajout de dépendance absente de ce tableau entraîne sa mise à jour, avec une justification d'une ligne.

### 3.2 Couches et organisation du code

```
src/
  app/                      # routes App Router (UI uniquement, aucune logique métier)
  features/<domaine>/       # garden, zone, member, group, plant, culture, journal, season,
                            # ticket, notification, guide, tip, result, recommendation,
                            # progression, plan, decor, avatar, privacy, moderation
    ui/                     # composants (Server et Client)
    actions.ts              # Server Actions fines, qui délèguent au service
    service.ts              # logique métier pure et testable ; reçoit un Scope et des dépôts
                            # (une fonctionnalité volumineuse le découpe : commands.ts, queries.ts, generated.ts, shared.ts)
    repo.ts                 # accès données Drizzle, toujours filtré par gardenId
    schema.ts               # schémas Zod de l'entité (partagés client / serveur)
    events.ts               # types des événements émis par le domaine
    permissions.ts          # actions du domaine et rôle minimal (alimente la matrice §5)
  server/
    db/                     # client Drizzle, définition des tables, migrations
    auth/                   # configuration Better Auth, récupération de session
    authz/                  # résolution du Scope, matrice de permissions, gardes
    events/                 # bus d'événements, outbox, abonnés synchrones et asynchrones
    jobs/                   # définitions des jobs pg-boss, worker
    mail/                   # transport SMTP, gabarits
    storage/                # FileStorage (local, S3)
    clock.ts                # horloge injectable (APP_NOW en test)
    env.ts                  # variables d'environnement validées par Zod
  game/                     # moteur PixiJS, stores Zustand, couche DOM accessible
  avatar/                   # composition canvas, recoloration, schéma de configuration
  components/ui/            # primitives Radix habillées (Button, Dialog, Sheet, Tabs…) + leur .module.scss
  styles/                   # _tokens.scss, _mixins.scss, _reset.scss, globals.scss
  lib/                      # utilitaires purs (geohash, soleil, unités…)
  i18n/                     # messages fr (en préparé)
```

**Règle de dépendance** : `app` → `features/*/actions|ui` → `features/*/service` → `features/*/repo` → `server/db`. Un service n'importe jamais `next/*`. Il reçoit l'horloge et un exécuteur (base ou transaction) en paramètres, ce qui permet de le tester sans Next. La règle ESLint native `no-restricted-imports` vérifie ces sens de dépendance : la couche service / dépôt / lib n'importe ni Next ni React ; l'UI n'importe ni le schéma Drizzle, ni les dépôts, ni `drizzle-orm`. Les Server Components peuvent importer le client `db()` uniquement pour le passer aux fonctions de lecture des services (D-23). Les gardes de page dépendantes de Next vivent dans `src/server/page-guards.ts`.

### 3.3 Autorisation centralisée (anti-IDOR)

1. **Scope** : toute opération sur les données d'un jardin commence par `resolveScope(session, gardenId, permission)`. La fonction charge l'adhésion active (`garden_member` avec `left_at IS NULL`), le rôle et les groupes de l'utilisateur, puis vérifie `permission` dans la matrice (§5). Elle renvoie un `Scope { userId, gardenId, role, groupIds }`, ou lève `FORBIDDEN`.
2. **Dépôts scopés** : les fonctions de `repo.ts` prennent un `Scope` en premier argument et ajoutent toujours `WHERE garden_id = scope.gardenId`. Une ressource demandée par ID qui n'appartient pas au jardin du scope renvoie `NOT_FOUND`, sans distinguer « inexistante » de « dans un autre jardin ».
3. **Permissions de zone** : pour toute action sur une zone ou une culture, `assertZonePermission(scope, zoneId, action)` applique les restrictions par groupe (§5.3) de la zone et de ses ancêtres.
4. **Intégrité en base (défense en profondeur)** : les tables enfants portent `garden_id` et des **clés étrangères composites** : `(garden_id, zone_id) → zone(garden_id, id)`, `(garden_id, culture_id) → culture(garden_id, id)`. La base refuse donc de rattacher une culture à une zone d'un autre jardin, même en cas de bug applicatif.
5. **Jamais de jardin implicite** : le `gardenId` provient de l'URL ou du formulaire mais n'est **jamais cru tel quel** : c'est l'adhésion qui le valide. Les IDs des sous-ressources sont toujours re-filtrés par le jardin du scope.
6. **Ressources hors jardin** (guides publics, tips, profil, avatar) : leurs gardes (`canReadGuide`, `canEditGuide`…) sont centralisées dans `server/authz`.
7. **Fichiers** : photos et pièces jointes sont servies par `GET /api/files/[fileId]`. Le handler résout le jardin du fichier, vérifie l'adhésion, puis diffuse le fichier avec `Cache-Control: private`.
8. **Tests** : un test paramétré parcourt toute la matrice §5.2 (rôle × action). Chaque Server Action a un test d'intégration qui vérifie le refus pour un non-membre (AUTHZ-*).

Le RLS PostgreSQL n'est pas retenu en V1. Il est plus complexe à combiner avec un pool de connexions et Drizzle, et les clés composites couvrent déjà l'essentiel de la défense en profondeur (§17 Q-20).

### 3.4 Contrat des Server Actions

Chaque Server Action est construite avec un même utilitaire :

```ts
export const createCulture = defineAction({
  input: cultureCreateSchema,            // Zod, partagé avec le formulaire
  permission: 'culture:create',          // clé de la matrice §5
  gardenId: (input) => input.gardenId,   // jardin à vérifier
  handler: (scope, input, deps) => cultureService.create(scope, input, deps),
  revalidate: (input) => [tags.garden(input.gardenId), tags.cultures(input.gardenId)],
});
```

L'utilitaire enchaîne : récupération de la session (sinon `UNAUTHENTICATED`) ; validation Zod (sinon `VALIDATION` avec `fieldErrors`) ; résolution du scope (sinon `FORBIDDEN`) ; limitation de débit pour les actions sensibles ; exécution du handler dans une transaction ; publication des événements ; revalidation des tags.

Type de retour unique :

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ActionErrorCode; message: string; fieldErrors?: Record<string, string[]> } };

type ActionErrorCode =
  | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION'
  | 'CONFLICT'        // conflit de version (éditeur de plan, guide) ou doublon
  | 'LOCKED_ITEM'     // élément d'avatar ou de déco non débloqué
  | 'RATE_LIMITED' | 'INTERNAL';
```

Les services lèvent des `DomainError` typées, que l'utilitaire convertit en `ActionResult`. Une erreur inattendue est journalisée et renvoyée en `INTERNAL`, sans détail. Les messages sont des clés i18n.

### 3.5 Événements de domaine (prévus dès le lot 1)

- Chaque service émet ses événements via `events.emit(tx, event)`, **dans la transaction de l'action**. L'événement est inséré dans `domain_event` (pattern outbox).
- **Abonnés synchrones** (même transaction) : réservés à ce qui doit être visible immédiatement. À partir du lot 6, le calcul d'XP en fait partie, pour que le gain s'affiche dans la réponse de l'action.
- **Abonnés asynchrones** (job pg-boss qui lit l'outbox) : notifications, e-mails, succès, quêtes, rafraîchissement des agrégats. Ils sont idempotents (clé `event_id` + nom de l'abonné).
- Pendant les lots 1 à 5, les événements sont enregistrés sans abonné XP. Au lot 6, un **rejeu** de l'historique (`pnpm xp:recompute`) attribue l'XP rétroactivement. Le même mécanisme rend l'XP recalculable.

Catalogue V1. Le payload est minimal : des IDs et les valeurs utiles au barème, jamais de données personnelles en clair.

| Événement | Émis par | Utilisé par |
|---|---|---|
| `garden.created`, `garden.archived` | jardin | progression collective |
| `member.joined`, `member.left`, `member.role_changed` | membres | notifications |
| `invitation.sent`, `invitation.accepted` | invitations | e-mail |
| `zone.created`, `zone.archived`, `zone.updated` (`fields`, dont `geometry`) | zones, plan | revalidation de la vue jardin |
| `garden.plan_saved` (`commands`, `planVersion`) | éditeur de plan | traçabilité des enregistrements |
| `culture.created`, `culture.deleted`, `culture.ended` | cultures | XP, succès, quêtes |
| `culture.stage_recorded` (`stage`, `actualOn`) | étapes | XP, succès |
| `journal.entry_created`, `journal.entry_deleted` (`kind`, `hasPhoto`, `structured`) | journal | XP, états visuels |
| `harvest.recorded`, `harvest.deleted` (`quantity`, `unit`, `seedSaving`) | récoltes | XP, succès |
| `result.submitted`, `result.updated` (`completeness`) | bilans | XP, agrégats, succès |
| `ticket.created`, `ticket.completed`, `ticket.reopened`, `ticket.deleted`, `ticket.assigned` | tickets | XP, quêtes, notifications |
| `comment.created` (`mentions`) | tickets | notifications |
| `guide.published`, `guide.applied`, `guide.forked` | guides | XP de l'auteur |
| `tip.created`, `tip.voted` (`value`, `voterId`) | tips | XP de l'auteur |
| `content.reported`, `moderation.decided` | modération | file `/admin/signalements`, traçabilité des décisions |
| `variety.approved` | modération | XP du proposant |
| `avatar.updated`, `decor.placed` | avatar, déco | invalidation des vignettes |
| `quest.completed`, `achievement.earned` | progression | notifications in-app |

### 3.6 Jobs planifiés (worker pg-boss)

| Job | Fréquence | Rôle |
|---|---|---|
| `outbox.dispatch` | en continu (`LISTEN/NOTIFY`, plus un balayage toutes les 30 s) | Distribue les événements aux abonnés asynchrones. |
| `mail.send` | à la demande | Envoi SMTP, 5 tentatives avec backoff exponentiel. |
| `tickets.materialize-recurrences` | toutes les heures | Crée les occurrences des séries sur un horizon glissant de 14 jours, et passe les occurrences dépassées en « passée » (RG-TCK-08). |
| `tickets.due-reminders` | toutes les 15 min | Rappel la veille de l'échéance à 8 h (heure du jardin), puis notification de retard, une seule fois par ticket. |
| `notifications.daily-digest` | toutes les heures | Résumé quotidien pour qui l'a activé, envoyé à 7 h dans le fuseau de l'utilisateur. |
| `quests.generate` | toutes les heures | Génère les quêtes du jour, de la semaine et de la saison de chaque utilisateur, selon son fuseau. |
| `reco.refresh-facts` | toutes les heures, et 5 min après un `result.*` (anti-rebond) | `REFRESH MATERIALIZED VIEW CONCURRENTLY shared_result_fact`. |
| `privacy.export` / `privacy.purge` | à la demande / tous les jours | Export RGPD ; purge définitive des comptes supprimés depuis 30 jours. |
| `housekeeping` | tous les jours | Purge des sessions expirées, des notifications lues depuis plus de 90 jours et des invitations expirées. |

### 3.7 Temps, fuseaux, horloge

- Les instants sont stockés en `timestamptz`. Les dates agronomiques (étapes, récoltes, échéances à la journée) sont des `date`, interprétées dans le **fuseau du jardin** (`garden.timezone`, IANA). Ce fuseau est déduit de la localisation à la création et reste modifiable.
- Le « jour » des plafonds d'XP et des quêtes est celui du fuseau de **l'utilisateur** (`user_profile.timezone`).
- Une horloge injectable (`Clock`) est utilisée partout. En e2e, `APP_NOW` et `SEED_REFERENCE_DATE` reçoivent le même instant (`E2E_NOW`, `tests/e2e/db.ts`) : la suite ne dépend pas du jour réel. Le navigateur n'est pas figé, car aucun composant client ne décide d'après l'horloge ; `page.clock` serait requis le jour où l'un d'eux le fera. Les dates posées par une bibliothèque tierce (expiration des jetons Better Auth) se comparent à l'horloge système qui les a posées.

### 3.8 Environnement local

- `docker-compose.yml`, projet nommé `greenu-app` (un autre projet Compose « greenu » existe sur la machine de dev) : `postgres:18` (port hôte **5434**, volume nommé ; les bases `greenu` et `greenu_test` et les extensions sont créées par un script d'initialisation) et `axllent/mailpit` (SMTP sur **1026**, UI et API sur **8026**).
- `.env.example` est documenté. Les variables sont validées au démarrage par `server/env.ts` (Zod) : si une variable manque, le processus s'arrête avec un message clair.

| Variable | Exemple | Rôle |
|---|---|---|
| `DATABASE_URL` | `postgres://greenu:greenu@localhost:5434/greenu` | Base principale |
| `DATABASE_URL_TEST` | `postgres://greenu:greenu@localhost:5434/greenu_test` | Base des tests (Vitest, Playwright) |
| `APP_URL` | `http://localhost:3000` | Liens dans les e-mails |
| `BETTER_AUTH_SECRET` | 32 octets aléatoires | Signature des sessions |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_SECURE` | `localhost` / `1026` / vide / vide / `false` | Envoi d'e-mails |
| `MAIL_FROM` | `GreenU <no-reply@greenu.local>` | Expéditeur |
| `STORAGE_DRIVER` | `local` | `local` ou `s3` |
| `STORAGE_LOCAL_DIR` | `./var/uploads` | Pilote local |
| `S3_ENDPOINT` / `S3_BUCKET` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` | — | Pilote S3 (prod) |
| `MAILPIT_API_URL` | `http://localhost:8026` | Tests e2e uniquement |
| `APP_NOW` | `2026-06-15T09:00:00+02:00` | Tests uniquement : horloge figée |
| `FEATURE_WEATHER` | `false` | Module météo (hors MVP) |

Scripts `pnpm` :

- `dev` : Next et worker en parallèle ;
- `build`, `start`, `worker`, `lint`, `typecheck` ;
- `db:generate`, `db:migrate`, `db:seed`, `db:reset` (dev uniquement) ;
- `test` : Vitest ;
- `test:e2e` : Playwright, après remise à zéro et seed de `greenu_test` ;
- `test:spec` : couverture des IDs de critères (§13.3) ;
- `xp:recompute` ;
- `db:reference` : charge ou met à jour le référentiel végétal commun (idempotent, aussi en production) ;
- `assets:sync` : copie les assets livrés par la session sprites (`out/`) vers `public/sprites` et génère `src/generated/sprites.ts` (vignettes disponibles, repli espèce → famille → générique).

### 3.9 Dépendances

Liste blanche, reprise de §3.1.

| Production | Développement |
|---|---|
| `next`, `react`, `react-dom`, `drizzle-orm`, `postgres`, `zod`, `drizzle-zod`, `better-auth`, `nodemailer`, `pg-boss`, `rrule`, `next-intl`, `date-fns`, `@date-fns/tz`, `nuqs`, `zustand`, `pixi.js`, `react-markdown`, `remark-gfm`, `rehype-sanitize`, `diff`, `lucide-react`, primitives `@radix-ui/react-*`, `clsx` (composition de classes CSS Modules), `server-only` (empêche l'import de modules serveur côté client) | `typescript`, `sass`, `stylelint` + `stylelint-config-standard-scss`, `drizzle-kit`, `vitest`, `@playwright/test`, `eslint` 9, `eslint-config-next`, `typescript-eslint`, `prettier`, `tsx` (scripts de seed et worker), `concurrently` (Next et worker en parallèle), `@axe-core/playwright` (A11Y-01) |

Sont **implémentés en interne**, sans dépendance : le geohash, le calcul du lever et du coucher du soleil (approximation NOAA), la compression des photos (canvas, qui supprime au passage les métadonnées EXIF dont le GPS) et la recoloration par palette de l'avatar. Ce sont de petites fonctions pures, testées.

---

## 4. Modèle de données

### 4.1 Conventions

- Clé primaire `id uuid DEFAULT uuidv7()`. Les entités créables hors-ligne (journal, récoltes, tickets) acceptent un `id` fourni par le client, qui sert de clé d'idempotence. Le serveur vérifie qu'il n'existe pas déjà et applique toujours l'autorisation. Un ID fourni ne donne aucun droit.
- `created_at`, `updated_at` (`timestamptz NOT NULL DEFAULT now()`, `updated_at` mis à jour par trigger) sur toutes les tables, sauf les tables de liaison pures et les tables append-only (`domain_event`, `xp_ledger_entry`, `ticket_event`), qui n'ont que `created_at`.
- Soft delete :
  - `deleted_at` sur `culture`, `journal_entry`, `harvest`, `ticket`, `ticket_comment`, `guide`, `tip`, `attachment` ;
  - `archived_at` sur `garden`, `zone`, `group`, `zone_type` ;
  - `left_at` sur `garden_member`.
  Les lectures courantes filtrent ces lignes, avec des index partiels `WHERE deleted_at IS NULL`.
- Index sur **toutes** les FK et les colonnes filtrées ; les index composites sont listés en §4.3.
- Enums : types `pgEnum` pour les listes fermées et stables, tables de référence pour les listes extensibles (pratiques, types de zone, problèmes, tags).
- Les colonnes `jsonb` ont toutes un schéma Zod versionné (§4.5). Elles sont validées à l'écriture et lues via un parseur qui migre les anciennes versions.
- Noms en `snake_case` en base, `camelCase` dans Drizzle.

### 4.2 Diagrammes ERD

Les diagrammes ne montrent que les colonnes structurantes. `created_at` et `updated_at` sont implicites.

#### 4.2.1 Socle : comptes, jardins, zones, membres

```mermaid
erDiagram
  user ||--|| user_profile : "a"
  user ||--o{ session : "a"
  user ||--o{ account : "a"
  user ||--o{ garden_member : "adhère"
  user ||--o{ consent : "donne"
  garden ||--o{ garden_member : "a"
  garden ||--o{ garden_invitation : "a"
  garden ||--o{ garden_group : "a"
  garden_group ||--o{ group_member : "a"
  garden_member ||--o{ group_member : "appartient"
  garden ||--o{ garden_environment : "a"
  garden ||--o{ zone : "contient"
  zone ||--o{ zone : "parent de"
  zone_type ||--o{ zone : "type"
  garden ||--o{ zone_type : "types perso"
  zone ||--o{ zone_group_permission : "restreinte à"
  garden_group ||--o{ zone_group_permission : "autorisé"
  practice ||--o{ practice_declaration : "déclarée"
  garden ||--o{ practice_declaration : "porte"
  zone ||--o{ practice_declaration : "porte"
  season ||--o{ practice_declaration : "bornée à"
  garden ||--o{ season : "a"
  garden ||--o{ terrain_element : "a"

  user {
    uuid id PK
    citext email UK
    text name
    bool email_verified
    text platform_role "user|moderator|admin"
  }
  user_profile {
    uuid user_id PK,FK
    text pseudo UK
    text locale
    text timezone
    text default_view "garden|classic"
    bool reduced_motion
    text profile_visibility "public|members|private"
    timestamptz deletion_requested_at
  }
  consent {
    uuid id PK
    uuid user_id FK
    text kind "terms|share_results|marketing"
    text version
    timestamptz granted_at
    timestamptz revoked_at
  }
  garden {
    uuid id PK
    text name
    text org_type
    numeric lat "précis, jamais exposé"
    numeric lng "précis, jamais exposé"
    text geohash4 "exposé"
    int altitude_m
    text koppen
    text hardiness_zone
    text soil_type
    numeric soil_ph
    text exposure
    text water_access
    text timezone
    int season_start_month
    int tile_size_cm
    text plan_edit_min_role
    bool leaderboard_enabled
    bool share_results
    int plan_version
    timestamptz archived_at
    timestamptz deleted_at
  }
  garden_environment {
    uuid garden_id PK,FK
    text environment PK
  }
  garden_member {
    uuid id PK
    uuid garden_id FK
    uuid user_id FK
    text role "owner|admin|member|observer"
    timestamptz joined_at
    timestamptz left_at
    uuid removed_by FK
  }
  garden_invitation {
    uuid id PK
    uuid garden_id FK
    citext email
    text role
    text token_hash UK
    uuid invited_by FK
    jsonb group_ids
    timestamptz expires_at
    timestamptz accepted_at
    timestamptz revoked_at
  }
  garden_group {
    uuid id PK
    uuid garden_id FK
    text name
    text color
    timestamptz archived_at
  }
  group_member {
    uuid group_id PK,FK
    uuid member_id PK,FK
  }
  zone_type {
    uuid id PK
    uuid garden_id FK "null = type de base"
    text code
    text label
    bool can_host_cultures
    bool has_interior_default
    text default_environment
    timestamptz archived_at
  }
  zone {
    uuid id PK
    uuid garden_id FK
    uuid parent_id FK
    uuid zone_type_id FK
    text name
    text path "ids des ancêtres"
    int depth
    text environment "null = hérité"
    numeric surface_m2_manual
    int length_cm
    int width_cm
    jsonb geometry
    uuid scene_zone_id FK "null = scène extérieure"
    bool has_interior
    int sort_order
    timestamptz archived_at
  }
  zone_group_permission {
    uuid zone_id PK,FK
    uuid group_id PK,FK
    text level "edit|contribute"
  }
  practice {
    uuid id PK
    text code UK
    text category
    text label_key
  }
  practice_declaration {
    uuid id PK
    uuid garden_id FK
    uuid zone_id FK "null = tout le jardin"
    uuid practice_id FK
    uuid season_id FK "null = permanente"
    jsonb details
    bool excluded "désactive une pratique héritée"
    uuid decor_placement_id FK "si déclarée via un objet"
  }
  season {
    uuid id PK
    uuid garden_id FK
    int year
    date starts_on
    date ends_on
    text status "planned|active|closed"
  }
  terrain_element {
    uuid id PK
    uuid garden_id FK
    uuid scene_zone_id FK
    text kind
    jsonb geometry
  }
```

Les tables `session`, `account` et `verification` sont générées par Better Auth. Les colonnes `user.platform_role` et `user_profile` sont ajoutées par nos migrations.

#### 4.2.2 Référentiel végétal et cultures

```mermaid
erDiagram
  botanical_family ||--o{ species : "regroupe"
  species ||--o{ variety : "a"
  species ||--o{ companion : "a"
  species ||--o{ species_calendar : "a"
  variety ||--o{ culture : "cultivée"
  species ||--o{ culture : "cultivée"
  zone ||--o{ culture : "accueille"
  season ||--o{ culture : "contient"
  culture ||--o{ culture_stage : "a"
  culture ||--o{ journal_entry : "a"
  zone ||--o{ journal_entry : "a"
  culture ||--o{ harvest : "a"
  culture ||--o{ culture_result : "a"
  culture_result ||--o{ culture_result_problem : "a"
  problem ||--o{ culture_result_problem : "référence"
  problem ||--o{ journal_entry : "référence"
  journal_entry ||--o{ attachment : "a"
  culture ||--o| culture : "semences issues de"

  botanical_family {
    uuid id PK
    text code UK
    text latin_name
    text label_key
    int rotation_return_years
  }
  species {
    uuid id PK
    uuid family_id FK
    text latin_name UK
    jsonb common_names "par locale"
    text visual_model "fruit|leaf|root|tuber|perennial|tree|flower"
    text skill_domain
    bool perennial
    text sun "full|partial|shade"
    text water "low|medium|high"
    numeric temp_min_c
    numeric temp_opt_c
    numeric temp_max_c
    int spacing_row_cm
    int spacing_plant_cm
    int days_to_maturity_min
    int days_to_maturity_max
    numeric avg_unit_weight_g
    text sprite_key
  }
  variety {
    uuid id PK
    uuid species_id FK
    text name
    text origin "commercial|local|peasant"
    text description
    text status "pending|approved|rejected|merged"
    uuid proposed_by FK
    uuid proposed_garden_id FK
    uuid merged_into_id FK
    uuid moderated_by FK
    text sprite_key
  }
  companion {
    uuid species_a_id PK,FK "a < b"
    uuid species_b_id PK,FK
    text effect "favorable|unfavorable"
    text note_key
  }
  species_calendar {
    uuid id PK
    uuid species_id FK
    text koppen_group
    text environment
    text method
    text stage
    int window_start_doy
    int window_end_doy
    text source
  }
  culture {
    uuid id PK
    uuid garden_id FK
    uuid zone_id FK
    uuid season_id FK
    uuid species_id FK
    uuid variety_id FK
    text method
    text status "planned|active|finished|failed|abandoned"
    int plant_count
    numeric area_m2
    text seed_source "bought|own_saved|exchange|unknown"
    uuid seed_parent_culture_id FK
    uuid applied_guide_version_id FK
    uuid created_by FK
    date occupied_from
    date occupied_to
    timestamptz deleted_at
  }
  culture_stage {
    uuid id PK
    uuid garden_id FK
    uuid culture_id FK
    text stage
    date planned_on
    date actual_on
    uuid recorded_by FK
  }
  journal_entry {
    uuid id PK
    uuid garden_id FK
    uuid culture_id FK "un seul des deux"
    uuid zone_id FK "un seul des deux"
    text kind "note|weather|disease|pest|intervention|photo"
    timestamptz observed_at
    text body
    uuid problem_id FK
    int severity "1..3"
    text intervention "watering|fertilizing|treatment|pruning|weeding|mulching|transplant|other"
    jsonb weather
    bool resolved
    uuid author_id FK
    timestamptz deleted_at
  }
  harvest {
    uuid id PK
    uuid garden_id FK
    uuid culture_id FK
    date harvested_on
    numeric quantity
    text unit "g|kg|unit|bunch|l"
    numeric quantity_kg "normalisé, null si inconvertible"
    int quality "1..5"
    bool seed_saving
    uuid author_id FK
    timestamptz deleted_at
  }
  culture_result {
    uuid id PK
    uuid garden_id FK
    uuid culture_id FK
    uuid season_id FK
    numeric total_kg
    numeric area_m2
    numeric yield_kg_m2
    int quality "1..5"
    int success_pct "0..100"
    int rating "1..5"
    bool would_grow_again
    bool no_harvest
    text notes
    int completeness "0..100"
    uuid author_id FK
    timestamptz submitted_at
  }
  problem {
    uuid id PK
    text code UK
    text category "disease|pest|climate|soil|other"
    text label_key
  }
  culture_result_problem {
    uuid result_id PK,FK
    uuid problem_id PK,FK
    int severity
  }
  attachment {
    uuid id PK
    uuid garden_id FK
    uuid journal_entry_id FK "arc exclusif"
    uuid ticket_id FK "arc exclusif"
    uuid ticket_comment_id FK "arc exclusif"
    text storage_key
    text mime
    int bytes
    int width
    int height
    uuid uploaded_by FK
    timestamptz deleted_at
  }
```

#### 4.2.3 Ticketing et notifications

```mermaid
erDiagram
  garden ||--o{ ticket : "a"
  zone ||--o{ ticket : "rattaché"
  culture ||--o{ ticket : "rattaché"
  culture_stage ||--o{ ticket : "génère"
  ticket_series ||--o{ ticket : "génère"
  ticket ||--o{ ticket_assignee : "a"
  garden_member ||--o{ ticket_assignee : "assigné"
  garden_group ||--o{ ticket_assignee : "assigné"
  ticket ||--o{ ticket_checklist_item : "a"
  ticket ||--o{ ticket_comment : "a"
  ticket ||--o{ ticket_event : "historique"
  ticket ||--o{ attachment : "a"
  user ||--o{ notification : "reçoit"
  user ||--o{ notification_preference : "règle"

  ticket {
    uuid id PK
    uuid garden_id FK "toujours renseigné"
    uuid zone_id FK "arc exclusif"
    uuid culture_id FK "arc exclusif"
    text level "garden|zone|culture (généré)"
    text type "task|problem|check|harvest|purchase|maintenance"
    text action_tag "watering|... optionnel"
    text title
    text description
    text status "todo|in_progress|blocked|done|cancelled|skipped"
    text priority "low|normal|high|urgent"
    date due_on
    timestamptz due_at
    date visible_from
    text source "manual|recurrence|stage|guide"
    uuid series_id FK
    date occurrence_on
    uuid source_stage_id FK
    uuid source_guide_version_id FK
    text skill_domain
    uuid created_by FK
    timestamptz completed_at
    uuid completed_by FK
    timestamptz first_completed_at
    timestamptz overdue_notified_at
    timestamptz deleted_at
  }
  ticket_series {
    uuid id PK
    uuid garden_id FK
    uuid zone_id FK
    uuid culture_id FK
    jsonb template
    text rrule
    date dtstart
    date until
    bool skip_missed
    jsonb assignees
    uuid created_by FK
    timestamptz ended_at
  }
  ticket_assignee {
    uuid id PK
    uuid ticket_id FK
    uuid member_id FK "arc exclusif"
    uuid group_id FK "arc exclusif"
  }
  ticket_checklist_item {
    uuid id PK
    uuid ticket_id FK
    text label
    bool done
    int sort_order
  }
  ticket_comment {
    uuid id PK
    uuid ticket_id FK
    uuid author_id FK
    text body
    jsonb mentions
    timestamptz edited_at
    timestamptz deleted_at
  }
  ticket_event {
    uuid id PK
    uuid ticket_id FK
    uuid actor_id FK
    text kind
    jsonb diff
  }
  notification {
    uuid id PK
    uuid user_id FK
    uuid garden_id FK
    text type
    jsonb payload
    timestamptz read_at
    timestamptz emailed_at
  }
  notification_preference {
    uuid user_id PK,FK
    text type PK
    text channel PK "email|in_app"
    bool enabled
  }
```

#### 4.2.4 Guides, tips, modération

```mermaid
erDiagram
  user ||--o{ guide : "rédige"
  guide ||--o{ guide_version : "a"
  guide_version ||--o{ guide : "forké en"
  species ||--o{ guide : "concerne"
  variety ||--o{ guide : "concerne"
  garden ||--o{ guide : "privé à"
  guide_version ||--o{ culture : "appliquée à"
  user ||--o{ tip : "rédige"
  tip ||--o{ tip_tag : "a"
  tag ||--o{ tip_tag : "a"
  tip ||--o{ tip_vote : "reçoit"
  user ||--o{ tip_vote : "vote"
  user ||--o{ content_report : "signale"

  guide {
    uuid id PK
    uuid author_id FK
    uuid garden_id FK "si visibilité privée"
    uuid species_id FK
    uuid variety_id FK
    text visibility "private|unlisted|public"
    text slug UK
    uuid forked_from_version_id FK
    uuid current_version_id FK
    jsonb draft "brouillon en cours"
    bool hidden_by_moderation
    timestamptz deleted_at
  }
  guide_version {
    uuid id PK
    uuid guide_id FK
    int number
    text title
    text body_md
    jsonb context
    jsonb calendar_template
    text change_note
    timestamptz published_at
  }
  tip {
    uuid id PK
    uuid author_id FK
    uuid species_id FK
    text body "max 500"
    text geohash4
    text koppen
    text environment
    int useful_count
    int not_useful_count
    bool hidden_by_moderation
    timestamptz deleted_at
  }
  tag {
    uuid id PK
    text slug UK
  }
  tip_tag {
    uuid tip_id PK,FK
    uuid tag_id PK,FK
  }
  tip_vote {
    uuid tip_id PK,FK
    uuid user_id PK,FK
    int value "+1|-1"
  }
  content_report {
    uuid id PK
    uuid reporter_id FK
    uuid guide_id FK "arc exclusif"
    uuid tip_id FK "arc exclusif"
    uuid reported_user_id FK "arc exclusif"
    text reason
    text details
    text status "open|dismissed|actioned"
    uuid handled_by FK
  }
```

#### 4.2.5 Événements et progression

```mermaid
erDiagram
  user ||--o{ domain_event : "acteur"
  domain_event ||--o{ xp_ledger_entry : "produit"
  user ||--o{ xp_ledger_entry : "reçoit"
  garden ||--o{ xp_ledger_entry : "contexte"
  user ||--o{ user_achievement : "obtient"
  user ||--o{ quest : "a"
  garden ||--o{ garden_goal : "a"
  garden_group ||--o{ garden_goal : "cible"

  domain_event {
    uuid id PK
    text type
    uuid actor_id FK
    uuid garden_id FK
    text subject_type
    uuid subject_id
    jsonb payload
    timestamptz occurred_at
    timestamptz dispatched_at
  }
  xp_ledger_entry {
    uuid id PK
    uuid user_id FK
    uuid garden_id FK
    uuid event_id FK
    text action_code
    int amount "peut être 0 ou négatif (annulation)"
    text skill_primary
    text skill_secondary
    text reason "award|cap_reached|reversal|quest|recompute"
    text idempotency_key UK
    uuid reverses_entry_id FK
    uuid subject_id "contenu à l'origine du gain"
    uuid culture_id "culture liée, pour les annulations"
    date local_day
    int rules_version
  }
  user_progress {
    uuid user_id PK,FK
    int total_xp
    int level
    jsonb skills
    timestamptz recomputed_at
  }
  user_achievement {
    uuid user_id PK,FK
    text achievement_code PK
    uuid garden_id FK
    timestamptz earned_at
    jsonb evidence
  }
  quest {
    uuid id PK
    uuid user_id FK
    uuid garden_id FK
    text kind "daily|weekly|seasonal"
    text source "ticket|stage|template"
    uuid ticket_id FK
    uuid stage_id FK
    uuid culture_id
    text template_code
    text title_key "clé i18n"
    jsonb title_params
    int target
    int progress
    date period_start
    date period_end
    text status "open|done|expired"
    timestamptz completed_at
  }
  garden_goal {
    uuid id PK
    uuid garden_id FK
    uuid group_id FK
    text title
    text metric
    numeric target
    date period_start
    date period_end
    uuid created_by FK
  }
```

`user_progress` est une projection recalculable du journal d'XP ; elle n'est jamais la source de vérité. Le journal porte aussi `subject_id` et `culture_id` : ils retrouvent les gains liés à un contenu supprimé (RG-XP-02) sans relire les événements. Une quête stocke son texte sous forme de clé i18n et de paramètres (`title_key`, `title_params`), et son avancement (`progress` / `target`) pour les quêtes à plusieurs étapes. Deux tables complètent le modèle : `xp_flag` (fenêtres de saisie en masse signalées, RG-XP-07) et la colonne `user_profile.leaderboard_opt_out` (retrait du classement, §8.7). Les définitions des succès et des modèles de quêtes vivent **dans le code** (registre typé et testé), pas en base.

#### 4.2.6 Plan, décoration, avatar

```mermaid
erDiagram
  decor_item ||--o{ decor_placement : "placé"
  garden ||--o{ decor_placement : "a"
  practice ||--o{ decor_item : "peut déclarer"
  avatar_item ||--o{ avatar_item_palette : "autorise"
  palette ||--o{ avatar_item_palette : "autorisée"
  user ||--|| user_avatar : "a"

  decor_item {
    uuid id PK
    text code UK
    text sprite_key
    int width_tiles
    int height_tiles
    uuid practice_id FK "objet ★"
    jsonb unlock_condition
    int sort_order
  }
  decor_placement {
    uuid id PK
    uuid garden_id FK
    uuid scene_zone_id FK
    uuid decor_item_id FK
    int x_cm
    int y_cm
    text label "panneaux"
    uuid placed_by FK
  }
  avatar_item {
    uuid id PK
    text code UK
    text layer
    text sprite_key
    jsonb palette_slots
    jsonb unlock_condition
    bool default_unlocked
    int sort_order
  }
  palette {
    uuid id PK
    text code UK
    text slot_kind "skin|hair|eyes|cloth|material"
    jsonb ramp "couleurs claires→sombres"
  }
  avatar_item_palette {
    uuid avatar_item_id PK,FK
    uuid palette_id PK,FK
  }
  user_avatar {
    uuid user_id PK,FK
    int config_version
    jsonb config
    text config_hash
  }
```

### 4.3 Contraintes et index notables

| Table | Contraintes | Index |
|---|---|---|
| `garden_member` | unique `(garden_id, user_id) WHERE left_at IS NULL` ; au plus un `owner` actif par jardin (index unique partiel) | `(user_id) WHERE left_at IS NULL` |
| `garden_invitation` | `token_hash` unique ; une seule invitation active par `(garden_id, email)` | `(garden_id, email)` |
| `zone` | `parent_id` dans le même jardin (FK composite `(garden_id, parent_id) → zone(garden_id, id)`) ; absence de cycle garantie par le service (le parent ne doit pas avoir l'ID de la zone dans son `path`) ; `depth ≤ 8` | `(garden_id, parent_id)`, `(garden_id, path text_pattern_ops)` (sous-arbre par préfixe), `(garden_id, scene_zone_id)` |
| `zone_type` | unique `(coalesce(garden_id, '00000000-…'), code)` | — |
| `practice_declaration` | `zone_id` dans le même jardin ; unique `(garden_id, coalesce(zone_id), practice_id, coalesce(season_id))` | `(garden_id, zone_id)` |
| `season` | unique `(garden_id, year)` ; `starts_on < ends_on` | — |
| `culture` | FK composites `(garden_id, zone_id)` et `(garden_id, season_id)` ; `variety.species_id = species_id` vérifié par le service et un trigger ; `area_m2 > 0` si renseignée | `(garden_id, season_id)`, `(garden_id, zone_id, occupied_from)`, `(species_id)`, `(variety_id)` ; tous partiels `WHERE deleted_at IS NULL` |
| `culture_stage` | unique `(culture_id, stage)` | `(garden_id, planned_on) WHERE actual_on IS NULL` |
| `journal_entry` | `CHECK (num_nonnulls(culture_id, zone_id) = 1)` | `(garden_id, culture_id, observed_at DESC)`, `(garden_id, zone_id, observed_at DESC)` |
| `harvest` | `quantity > 0` | `(garden_id, culture_id, harvested_on)` |
| `culture_result` | unique `(culture_id, season_id)` ; bornes `1..5`, `0..100` | `(season_id)` |
| `attachment` | `CHECK (num_nonnulls(journal_entry_id, ticket_id, ticket_comment_id) = 1)` | une par FK |
| `ticket` | `CHECK (num_nonnulls(zone_id, culture_id) <= 1)` ; `level` est une colonne générée ; unique `(series_id, occurrence_on)` ; unique `(source_stage_id) WHERE deleted_at IS NULL` | `(garden_id, status, due_on)`, `(garden_id, zone_id)`, `(garden_id, culture_id)`, `(garden_id, visible_from)` |
| `ticket_assignee` | `CHECK (num_nonnulls(member_id, group_id) = 1)` ; unique par cible | `(member_id)`, `(group_id)` |
| `guide` | `garden_id NOT NULL` si et seulement si `visibility = 'private'` | `(visibility, species_id) WHERE deleted_at IS NULL`, `(author_id)` |
| `guide_version` | unique `(guide_id, number)` ; ligne immuable (trigger qui refuse `UPDATE`) | — |
| `tip_vote` | `user_id ≠ tip.author_id` (service + trigger) | `(user_id)` |
| `content_report` | `CHECK (num_nonnulls(guide_id, tip_id, reported_user_id) = 1)` ; unique par `(reporter_id, cible)` | `(status)` |
| `xp_ledger_entry` | `idempotency_key` unique ; table append-only (trigger qui refuse `UPDATE` et `DELETE`) | `(user_id, local_day, action_code)`, `(garden_id, created_at)`, `(event_id)` |
| `domain_event` | append-only | `(dispatched_at) WHERE dispatched_at IS NULL`, `(actor_id, occurred_at)` |
| `notification` | — | `(user_id, read_at, created_at DESC)` |

**Rattachement polymorphe** (tickets, pièces jointes, signalements) : on utilise des **arcs exclusifs**, c'est-à-dire une colonne FK nullable par cible et une contrainte `CHECK num_nonnulls`, plutôt qu'un couple `(target_type, target_id)`. On garde ainsi de vraies clés étrangères, des suppressions cohérentes et des jointures typées dans Drizzle. Pour un ticket, `garden_id` est toujours renseigné. Le niveau se déduit des colonnes : ni zone ni culture → jardin ; `zone_id` → zone ; `culture_id` → culture. La zone d'un ticket rattaché à une culture est celle de la culture, obtenue par jointure.

**Arbre de zones** : liste d'adjacence (`parent_id`) plus un chemin matérialisé (`path` : IDs des ancêtres séparés par `/`) et `depth`. On lit un sous-arbre par préfixe de `path`, et les ancêtres en découpant `path`. Un déplacement réécrit les `path` du sous-arbre dans une transaction. Ce choix évite l'extension `ltree`, que Drizzle ne connaît pas nativement, et les CTE récursives sur les chemins de lecture fréquents.

### 4.4 Listes de référence (V1)

| Liste | Valeurs |
|---|---|
| `org_type` | `individual`, `family`, `collective`, `association`, `professional`, `educational` |
| `environment` | `open_air`, `greenhouse`, `tunnel`, `indoor`, `soilless`, `hydroponic`, `balcony_roof` |
| `soil_type` | `clay`, `silty`, `sandy`, `loam`, `chalky`, `peaty`, `stony`, `potting_mix`, `unknown` |
| `exposure` | `full_sun`, `partial_sun`, `partial_shade`, `shade` (et orientation optionnelle `N…NW`) |
| `water_access` | `tap`, `rainwater`, `well`, `river`, `none` |
| Types de zone de base | parcelle, planche, rang, carré potager, bac, pot / jardinière, serre, tunnel, table de culture, pépinière, plaque alvéolée, alvéole, composteur, verger, haie fruitière, massif, prairie / engrais vert |
| Pratiques de base | `organic`, `permaculture`, `no_dig`, `living_soil`, `mulching`, `green_manure`, `irrigation_drip`, `irrigation_sprinkler`, `irrigation_manual`, `irrigation_none`, `crop_rotation`, `companion_planting`, `biodiversity_insect_hotel`, `biodiversity_pond`, `biodiversity_hedge`, `biodiversity_birdhouse`, `seed_saving`, `composting`, `no_pesticides` |
| Étapes (`stage`) | `sowing`, `emergence`, `transplanting`, `planting`, `flowering`, `fruiting`, `harvest_start`, `harvest_end`, `seed_set`, `end` |
| `method` | `direct_sowing`, `tray_sowing`, `bought_plants`, `cutting`, `division`, `bulb_tuber`, `grafting` |
| Compétences | `vegetable`, `herbs`, `fruit`, `flowers`, `greenhouse`, `seeds`, `compost` |
| Éléments de terrain | `path`, `gravel_path`, `stepping_stones`, `water_point`, `rain_barrel`, `hedge`, `existing_tree`, `fence`, `gate` |

Toutes les étapes ne s'appliquent pas à toutes les cultures. Une culture achetée en plants commence à `planting`. Le service ne crée que les étapes pertinentes pour la méthode et le modèle de l'espèce.

### 4.5 Schémas JSON versionnés

```ts
// zone.geometry, terrain_element.geometry : coordonnées en centimètres, dans la scène
type GeometryV1 = { v: 1; kind: 'rect'; x: number; y: number; w: number; h: number; rotation?: 0 };

// guide_version.context
type GuideContextV1 = { v: 1; koppen?: string[]; environments?: Environment[]; practices?: string[];
                        altitudeMaxM?: number; hemisphere?: 'N' | 'S' };

// guide_version.calendar_template
type GuideCalendarV1 = {
  v: 1;
  anchor: 'sowing' | 'planting';            // date choisie à l'application
  stages: { stage: Stage; offsetDays: number }[];
  tasks: { title: string; type: TicketType; actionTag?: ActionTag;
           relativeTo: Stage; offsetDays: number; leadDays?: number }[];   // V1 : pas de tâche récurrente (journal 0.7)
};

// conditions de déblocage (déco, avatar)
type UnlockConditionV1 =
  | { v: 1; kind: 'none' }
  | { v: 1; kind: 'level'; min: number }
  | { v: 1; kind: 'skill'; skill: Skill; min: number }
  | { v: 1; kind: 'achievement'; code: AchievementCode }
  | { v: 1; kind: 'season_active'; season: 'spring' | 'summer' | 'autumn' | 'winter' }; // action réelle pendant cette saison

// user_avatar.config : voir §10.3
```

Les coordonnées sont stockées **en centimètres réels** et non en tuiles. Changer l'échelle (`tile_size_cm`) ne modifie donc pas les dimensions réelles : le plan est simplement re-quantifié à l'affichage.

---

## 5. Rôles et permissions

### 5.1 Rôles

**Rôles dans un jardin** (un par adhésion) :

| Rôle | Intention |
|---|---|
| `owner` (propriétaire) | Responsable du jardin. Exactement un par jardin. Seul à pouvoir supprimer le jardin, transférer la propriété et décider du partage des résultats. |
| `admin` | Gère les membres, les groupes, le plan et les paramètres. Modère le contenu du jardin. |
| `member` (membre) | Cultive : cultures, journal, récoltes, bilans, tickets. |
| `observer` (observateur) | Lecture seule (élèves, visiteurs, conseillers). Peut gérer ses propres préférences et quitter le jardin. |

**Rôles plateforme** (`user.platform_role`) : `user`, `moderator` (signalements, variétés proposées), `admin` (tout `/admin`, recalcul d'XP, suspension). Un rôle plateforme ne donne **aucun** accès aux données privées des jardins. La modération porte uniquement sur les contenus publics, non listés ou signalés, ainsi que sur les variétés proposées.

### 5.2 Matrice des permissions

✅ autorisé · ❌ refusé · « propre » = sur les éléments dont l'utilisateur est l'auteur · « assigné » = l'utilisateur est assigné au ticket, directement ou via un groupe · ⚙️ = dépend d'un réglage du jardin · 🔒 = soumis aux restrictions de zone (§5.3).

| Clé de permission | Action | owner | admin | member | observer |
|---|---|:-:|:-:|:-:|:-:|
| `garden:read` | Voir le jardin, ses zones, cultures, tickets, journal | ✅ | ✅ | ✅ | ✅ |
| `garden:update` | Modifier infos, contexte, pratiques du jardin | ✅ | ✅ | ❌ | ❌ |
| `garden:read_location` | Voir la localisation précise | ✅ | ✅ | ❌ | ❌ |
| `garden:share_results` | Activer ou désactiver le partage des résultats | ✅ | ❌ | ❌ | ❌ |
| `garden:archive` | Archiver ou désarchiver | ✅ | ❌ | ❌ | ❌ |
| `garden:delete` | Supprimer (après confirmation) | ✅ | ❌ | ❌ | ❌ |
| `garden:transfer` | Transférer la propriété à un admin | ✅ | ❌ | ❌ | ❌ |
| `member:invite` | Inviter (rôle ≤ admin pour l'owner, ≤ member pour un admin) | ✅ | ✅ | ❌ | ❌ |
| `member:change_role` | Changer un rôle (un admin ne peut agir que sur member et observer) | ✅ | ✅ | ❌ | ❌ |
| `member:remove` | Retirer un membre (un admin ne peut pas retirer un admin) | ✅ | ✅ | ❌ | ❌ |
| `member:leave` | Quitter le jardin (l'owner doit d'abord transférer) | ❌ | ✅ | ✅ | ✅ |
| `group:manage` | Créer, renommer, archiver des groupes, gérer leurs membres | ✅ | ✅ | ❌ | ❌ |
| `zone:create` / `zone:update` / `zone:archive` | Gérer les zones (classique ou plan) | ✅ | ✅ | ⚙️ 🔒 | ❌ |
| `zone:restrict` | Restreindre une zone à des groupes | ✅ | ✅ | ❌ | ❌ |
| `plan:edit` | Éditeur de plan : zones, terrain, échelle | ✅ | ✅ | ⚙️ | ❌ |
| `decor:place` | Placer ou déplacer de la déco | ✅ | ✅ | ✅ (⚙️) | ❌ |
| `culture:create` / `culture:update` | Créer ou modifier une culture, renseigner une étape | ✅ | ✅ | ✅ 🔒 | ❌ |
| `culture:delete` | Supprimer une culture (soft delete) | ✅ | ✅ | propre 🔒 | ❌ |
| `journal:create` | Journal, photo, récolte | ✅ | ✅ | ✅ 🔒 | ❌ |
| `journal:update` / `journal:delete` | Modifier ou supprimer une entrée | ✅ | ✅ | propre | ❌ |
| `result:submit` | Saisir ou modifier le bilan | ✅ | ✅ | ✅ 🔒 | ❌ |
| `ticket:create` | Créer un ticket ou une série | ✅ | ✅ | ✅ 🔒 | ❌ |
| `ticket:update` | Modifier titre, description, échéance, checklist | ✅ | ✅ | propre ou assigné | ❌ |
| `ticket:assign` | Assigner des personnes ou des groupes | ✅ | ✅ | ✅ | ❌ |
| `ticket:transition` | Changer le statut (dont terminer) | ✅ | ✅ | propre ou assigné, ou ticket non assigné | ❌ |
| `ticket:delete` | Supprimer | ✅ | ✅ | propre | ❌ |
| `ticket:comment` | Commenter, mentionner | ✅ | ✅ | ✅ | ❌ |
| `checklist:toggle` | Cocher un élément de checklist | ✅ | ✅ | ✅ | ❌ |
| `guide:create_private` | Créer un guide privé au jardin | ✅ | ✅ | ✅ | ❌ |
| `guide:apply` | Appliquer un guide à une culture | ✅ | ✅ | ✅ 🔒 | ❌ |
| `goal:manage` | Objectifs collectifs | ✅ | ✅ | ❌ | ❌ |
| `leaderboard:toggle` | Activer le classement | ✅ | ✅ | ❌ | ❌ |
| `garden:export` | Exporter les données du jardin | ✅ | ✅ | ❌ | ❌ |

Réglages qui modulent la matrice (⚙️) :

| Réglage | Défaut | Effet |
|---|---|---|
| `garden.plan_edit_min_role` | `member` pour `individual` et `family` ; `admin` pour les autres types | Rôle minimal pour `plan:edit` et pour `zone:create`, `zone:update`, `zone:archive` |
| `garden.decor_min_role` | `member` | Rôle minimal pour `decor:place` |

**Permissions hors jardin** :

| Action | Règle |
|---|---|
| Lire un guide | `public` ou `unlisted` : tout le monde (y compris sans compte pour `public` via `/guides-publics`) ; `private` : membres actifs du jardin du guide. Un guide masqué par la modération n'est visible que de son auteur et des modérateurs. |
| Modifier ou publier un guide | Auteur uniquement. |
| Forker | Toute personne qui peut lire le guide. Le fork d'un guide privé est forcément privé au même jardin. |
| Tips | Créer, voter ou signaler : tout utilisateur connecté à l'e-mail vérifié. Interdit de voter pour son propre tip. |
| Proposer une variété | Tout utilisateur à l'e-mail vérifié. |
| Modérer | `moderator` ou `admin` plateforme. |
| Profil public | Selon `profile_visibility` : `public` (tous les connectés), `members` (personnes partageant au moins un jardin), `private` (soi seul). |

### 5.3 Restrictions de zone par groupe

- Par défaut, une zone n'a pas de restriction : la matrice §5.2 s'applique telle quelle.
- Un owner ou un admin peut **restreindre** une zone à un ou plusieurs groupes (`zone_group_permission`), avec un niveau :
  - `edit` : les membres du groupe peuvent tout faire sur la zone, y compris la renommer, la redimensionner ou créer des sous-zones, même si `plan_edit_min_role` est plus élevé ;
  - `contribute` : les membres du groupe peuvent cultiver (cultures, journal, récoltes, bilans, tickets), mais pas modifier la zone elle-même.
- Les restrictions **s'héritent** : une zone sans restriction propre reprend celle de son ancêtre restreint le plus proche.
- Sur une zone restreinte, les membres (`member`) hors des groupes autorisés gardent la **lecture**, et peuvent **commenter** les tickets et terminer ceux qui leur sont assignés. Ils ne peuvent pas créer de culture, d'entrée de journal ni de ticket. Les owners et admins ne sont jamais restreints.
- Le symbole 🔒 de la matrice indique les actions concernées.

### 5.4 Contrôle d'accès aux pages

- `/app/**` exige une session. Sinon, redirection vers `/connexion?next=…`.
- `/app/jardins/[jardinId]/**` exige une adhésion active. Sinon, la page 403 « Ce jardin n'est pas le tien » s'affiche **sans révéler le nom du jardin**, avec un lien pour demander une invitation à son propre réseau (aucune demande n'est envoyée au jardin).
- Une sous-ressource (zone, culture, ticket) d'un autre jardin, ou inexistante, donne une 404.
- `/admin/**` exige `platform_role ∈ {moderator, admin}`. `/admin/utilisateurs` et `/admin/xp` exigent `admin`.

---

## 6. Règles métier

Chaque règle a un identifiant `RG-<DOMAINE>-nn`, repris par les critères d'acceptation.

### 6.1 Comptes et authentification (AUTH)

- **RG-AUTH-01** L'inscription demande un e-mail, un mot de passe (12 caractères minimum, comparé à une liste de mots de passe courants), un pseudo unique (3 à 24 caractères, `[a-z0-9_-]`, insensible à la casse) et l'acceptation des CGU (`consent.kind = terms`, avec version).
- **RG-AUTH-02** L'e-mail doit être vérifié avant toute création de jardin, publication ou vote. Un utilisateur non vérifié peut accepter une invitation : le lien d'invitation vaut vérification si l'e-mail correspond (RG-INV-04).
- **RG-AUTH-03** Tentatives limitées : 5 échecs de connexion par e-mail par tranche de 15 minutes, et 3 demandes de réinitialisation par heure. Les messages d'erreur sont génériques (aucune énumération des comptes possible).
- **RG-AUTH-04** Le lien de réinitialisation est valable 1 heure et à usage unique. Changer de mot de passe révoque les autres sessions.
- **RG-AUTH-05** Les sessions durent 30 jours, avec prolongation glissante. Cookie `HttpOnly`, `Secure`, `SameSite=Lax`.

### 6.2 Jardins (GRD)

- **RG-GRD-01** Créer un jardin demande : un nom, un type d'organisation, au moins un environnement et une localisation (point sur une carte ou commune saisie). Altitude, Köppen et zone de rusticité sont **proposés** à partir de la localisation, quand une table de correspondance interne le permet, et restent modifiables ; ils peuvent rester inconnus (`unknown`). Le créateur devient `owner`.
- **RG-GRD-02** La localisation précise (`lat`, `lng`) n'est lue que par `garden:read_location`. Partout ailleurs, seul `geohash4` (cellule d'environ 39 × 20 km) est exposé.
- **RG-GRD-03** À la création, la saison de l'année en cours est créée automatiquement (`status = active`). Une saison N+1 est créée à la demande lors de la planification, ou automatiquement à la date de début de saison.
- **RG-GRD-04** Un jardin archivé passe en lecture seule pour tous (aucune mutation, aucune génération de ticket ni de rappel). Seul l'owner peut le désarchiver.
- **RG-GRD-05** La suppression d'un jardin est un soft delete, suivi d'une purge définitive à J+30. Elle exige de taper le nom du jardin. Les membres sont prévenus par e-mail. Les données déjà agrégées dans `shared_result_fact` (anonymes) sont retirées au rafraîchissement suivant.
- **RG-GRD-06** Les pratiques déclarées au niveau du jardin s'appliquent à toutes les zones, sauf exclusion explicite par une zone (`excluded = true`). Une déclaration peut être bornée à une saison.

### 6.3 Zones (ZON)

- **RG-ZON-01** Une zone a un parent optionnel dans le même jardin. La profondeur maximale est de 8 niveaux. Un déplacement qui créerait un cycle est refusé (`VALIDATION`).
- **RG-ZON-02** Types de zone : liste de base globale, plus des types personnalisés créés par un admin du jardin (code unique dans le jardin). Archiver un type ne touche pas les zones existantes : le type n'est simplement plus proposé.
- **RG-ZON-03** Environnement effectif = environnement propre, sinon celui de l'ancêtre le plus proche qui en a un, sinon le premier environnement du jardin. Pratiques effectives = déclarations du jardin + déclarations de chaque ancêtre et de la zone elle-même, moins les exclusions, pour la saison concernée.
- **RG-ZON-04** Surface effective : si la zone a une géométrie, `w × h / 10 000` m² (la géométrie prime ; une surface manuelle différente déclenche un avertissement dans le formulaire) ; sinon `surface_m2_manual` ; sinon `length_cm × width_cm` ; sinon inconnue. La surface d'un parent n'est **jamais** la somme de ses enfants (il peut exister des allées entre eux).
- **RG-ZON-05** La géométrie d'une zone enfant doit être entièrement contenue dans celle de son parent quand les deux sont dans la même scène. Deux zones sœurs ne peuvent pas se chevaucher (`VALIDATION`). Les enfants d'une zone « avec intérieur » sont dessinés dans la scène intérieure de cette zone.
- **RG-ZON-06** Archiver une zone archive tout son sous-arbre. Une zone archivée garde son historique (cultures, journal, tickets, résultats). Elle disparaît du plan et des listes par défaut, mais reste dans l'historique des saisons et dans les filtres « archivées ». Archiver une zone qui porte des cultures `planned` ou `active` demande confirmation et propose de les terminer : une culture en cours reçoit une date de fin au jour même (`finished`), une culture seulement prévue est `abandoned`.
- **RG-ZON-07** Une zone peut être recréée à l'identique ; aucune contrainte d'unicité ne porte sur le nom.
- **RG-ZON-08** Une zone dont le type a `can_host_cultures = false` (allée, composteur) ne peut pas recevoir de culture. Elle peut recevoir des tickets et des entrées de journal.

### 6.4 Membres, groupes, invitations (MBR, GRP, INV)

- **RG-INV-01** Une invitation porte un e-mail, un rôle (observer, member ou admin selon §5.2) et des groupes optionnels. Le jeton fait 32 octets aléatoires ; seul son hash SHA-256 est stocké. Il est valable 7 jours et à usage unique.
- **RG-INV-02** Réinviter le même e-mail révoque l'invitation précédente et en crée une nouvelle. Une invitation peut être révoquée tant qu'elle n'est pas acceptée.
- **RG-INV-03** Inviter l'e-mail d'un membre actif est refusé (`CONFLICT`).
- **RG-INV-04** Accepter une invitation :
  - utilisateur connecté avec le même e-mail : adhésion immédiate ;
  - pas de compte : inscription avec l'e-mail pré-rempli et verrouillé, e-mail considéré comme vérifié ;
  - compte connecté avec un e-mail différent : refus, avec le message « Cette invitation est destinée à une autre adresse » (§17 Q-05).
- **RG-INV-05** Un ancien membre qui accepte une nouvelle invitation obtient une **nouvelle** adhésion. L'ancienne reste dans l'historique.
- **RG-MBR-01** Quitter le jardin ou en être retiré renseigne `left_at` (et `removed_by` en cas de retrait). Les contributions (cultures, journal, tickets, commentaires, XP) restent attribuées à l'utilisateur et sont affichées « (ancien membre) ».
- **RG-MBR-02** Au départ d'un membre : ses assignations directes aux tickets ouverts sont retirées (les assignations de groupe ne sont pas concernées), il est retiré de ses groupes, et les admins reçoivent une notification listant les tickets désormais non assignés.
- **RG-MBR-03** L'owner ne peut pas quitter le jardin. Il doit d'abord transférer la propriété à un admin actif. Le transfert le rétrograde en `admin`.
- **RG-MBR-04** Un utilisateur peut être membre d'un nombre illimité de jardins, avec un rôle différent dans chacun.
- **RG-GRP-01** Un groupe appartient à un jardin et ne contient que des membres actifs de ce jardin. Son nom est unique parmi les groupes actifs du jardin.
- **RG-GRP-02** Archiver un groupe retire ses assignations aux tickets ouverts (en notifiant les créateurs) et supprime ses restrictions de zone. Les tickets terminés gardent l'historique.

### 6.5 Référentiel végétal (PLT)

- **RG-PLT-01** Les espèces et les familles sont gérées par la modération et le seed. Les utilisateurs proposent des **variétés** uniquement (§17 Q-08).
- **RG-PLT-02** Une variété proposée a le statut `pending`. Elle est utilisable tout de suite dans les jardins de son proposant (le jardin courant au moment de la proposition, `proposed_garden_id`), avec la mention « en attente de validation ». Elle n'apparaît ni dans le référentiel public ni dans les recommandations.
- **RG-PLT-03** Modération : `approved` rend la variété publique ; `rejected` la laisse utilisable dans le jardin de son proposant mais jamais publique ; `merged` (doublon) redirige toutes les cultures et tous les guides vers la variété cible, dans une transaction.
- **RG-PLT-04** La recherche ignore la casse et les accents, et tolère les fautes de frappe (`pg_trgm` + `unaccent`). Elle porte sur le nom latin, les noms communs dans la locale et les noms de variétés.
- **RG-PLT-05** Associations : relation symétrique entre deux espèces, stockée une seule fois (`species_a_id < species_b_id`).

### 6.6 Saisons, cultures, étapes, journal (SEA, CUL, JRN)

- **RG-SEA-01** Une saison couvre par défaut l'année civile. Pour un jardin de l'hémisphère sud, `season_start_month = 7` est proposé. Les saisons d'un même jardin ne se chevauchent pas.
- **RG-SEA-02** Une saison `closed` est en lecture seule pour les cultures, sauf la saisie ou la correction des bilans, possible pendant 12 mois après sa clôture. La clôture est **manuelle** et réversible (owner ou admin, `garden:update`) : une saison passée reste modifiable tant qu'elle n'est pas close, ce qui permet de saisir un historique.
- **RG-CUL-01** Une culture exige une espèce, une zone qui peut accueillir des cultures (RG-ZON-08), une saison et une méthode. La variété est optionnelle ; si elle est renseignée, elle doit appartenir à l'espèce.
- **RG-CUL-02** La culture est rattachée à la saison qui contient sa première date d'étape (prévue ou réelle). Une culture qui déborde sur la saison suivante, comme de l'ail planté en novembre, reste rattachée à sa saison de départ. Elle apparaît aussi dans l'historique de la saison suivante, par recouvrement de sa période d'occupation `[occupied_from, occupied_to]`.
- **RG-CUL-03** Période d'occupation de la zone : de la date de semis direct ou de plantation (la date réelle prime sur la prévue) jusqu'à la date de fin. Un semis en plaque n'occupe pas la zone finale avant le repiquage ou la plantation. Si le semis en plaque est rattaché à une zone de pépinière, il occupe cette zone ; la culture change alors de zone au repiquage (`zone_id` mis à jour, et changement tracé dans le journal sous forme d'entrée `intervention`).
- **RG-CUL-04** Statuts : `planned` (aucune date réelle) → `active` (première date réelle) → `finished` (étape `end` renseignée) ou `failed` (fin déclarée en échec), ou `abandoned` (abandonnée avant toute récolte). Les transitions sont calculées à partir des étapes ; `failed` et `abandoned` sont choisis explicitement. Une culture vivace reste `active` d'une saison à l'autre (§17 Q-09).
- **RG-CUL-05** Les dates réelles des étapes doivent respecter l'ordre logique (semis ≤ levée ≤ repiquage ≤ plantation ≤ floraison ≤ fructification ≤ début de récolte ≤ fin de récolte ≤ fin). Une incohérence produit un **avertissement** non bloquant, car le réel est parfois surprenant. Une date réelle dans le futur est refusée, à 1 jour près.
- **RG-CUL-06** Surface de la culture (`area_m2`) : surface saisie ; sinon nombre de plants × espacement entre plants × espacement entre rangs de l'espèce ; sinon surface effective de la zone, si la culture est seule sur la zone pendant sa période. La source retenue est affichée.
- **RG-CUL-07** Supprimer une culture est un soft delete. Ses tickets ouverts sont annulés, et ses récoltes et son journal sont masqués avec elle. La restauration est possible pendant 30 jours par un admin ou par l'auteur.
- **RG-CUL-08** Semences maison : `seed_source = own_saved` permet de choisir une culture d'origine (`seed_parent_culture_id`), dans le même jardin ou dans un jardin dont l'utilisateur est membre, ayant au moins une récolte `seed_saving` de la même espèce.
- **RG-JRN-01** Une entrée de journal est rattachée soit à une culture, soit à une zone. `observed_at` vaut maintenant par défaut et peut être antidaté de 30 jours au plus.
- **RG-JRN-02** Les entrées `disease` et `pest` exigent un `problem_id` du catalogue (avec « autre » + texte libre) et une sévérité de 1 à 3. Elles restent « non résolues » jusqu'à ce qu'on les marque résolues.
- **RG-JRN-03** Photos : au plus 6 par entrée et 10 Mo chacune avant compression. Formats acceptés : JPEG, PNG, WebP, HEIC (converti côté client si le navigateur le permet). Côté client : redimensionnement à 1600 px et ré-encodage en WebP ou JPEG, ce qui **supprime les métadonnées EXIF (dont le GPS)**. Côté serveur : vérification du type réel par les octets d'en-tête, **suppression des segments de métadonnées JPEG** (défense en profondeur si le client n'a pas ré-encodé), côté maximal de 4096 px. Une photo est d'abord téléversée « en attente » (`POST /api/files`, pièce jointe sans cible), puis rattachée à l'entrée de journal par l'action de création ; les pièces jointes en attente depuis plus de 24 h sont purgées.
- **RG-JRN-04** Arrosage rapide : l'action « Arroser » crée une entrée `intervention = watering` sur la culture ou la zone **et** termine les tickets ouverts avec `action_tag = watering` échus aujourd'hui ou avant, rattachés à cette culture, à sa zone ou à un ancêtre de sa zone.
- **RG-JRN-05** Récolte : quantité > 0 et unité obligatoires. Conversion en kg : `g` et `kg` directement ; `unit` à l'aide de `species.avg_unit_weight_g` quand il est connu ; sinon `quantity_kg = null`, et la récolte est exclue du rendement au m² mais comptée dans le nombre de récoltes.

### 6.7 Rotations et associations (ROT)

- **RG-ROT-01** À la création ou au déplacement d'une culture annuelle de famille F sur une zone Z, le service cherche les cultures de la même famille F (non supprimées, quel que soit leur statut sauf `abandoned` sans plantation) dont la période d'occupation touche une saison de `année(culture) − (rotation_return_years(F) − 1)` à `année(culture) − 1`, sur Z, **un ancêtre de Z ou un descendant de Z**.
- **RG-ROT-02** Le résultat est un **avertissement non bloquant**, du type : « Solanacées cultivées ici en 2025 (Tomate Cœur de bœuf, Planche 2). Retour conseillé : 4 ans, soit à partir de 2029. » L'utilisateur peut passer outre en le **confirmant explicitement** (sans confirmation, la création renvoie `CONFLICT` `rotationNotAcknowledged`) ; ce choix est tracé (`rotation_override = true` sur la culture) et pris en compte par le succès « rotation respectée ».
- **RG-ROT-03** Délais par défaut (`rotation_return_years`, modifiable par la modération) : solanacées 4, brassicacées 4, alliacées / amaryllidacées 4, cucurbitacées 3, apiacées 3, fabacées 3, amaranthacées (betterave, épinard, blette) 3, astéracées 2, poacées 2, autres 2. Les vivaces et les engrais verts ne déclenchent pas d'alerte.
- **RG-ROT-04** Associations : à la création d'une culture, le service liste les cultures actives sur la même zone et sur les **zones voisines** pendant la période d'occupation. Zones voisines = zones sœurs dont la géométrie partage un bord ou se trouve à moins d'une tuile ; à défaut de géométrie, toutes les zones sœurs. Il signale les associations favorables (information) et défavorables (avertissement).
- **RG-ROT-05** La vue `/saisons` affiche, pour chaque zone, une frise des 5 dernières saisons avec la famille de chaque culture, et met en évidence les retours trop précoces.

### 6.8 Ticketing (TCK, RCR, NTF)

- **RG-TCK-01** Un ticket a toujours un jardin, et au plus une zone **ou** une culture (arc exclusif). Le type, le titre (3 à 140 caractères) et la priorité (`normal` par défaut) sont obligatoires. La description (Markdown, 10 000 caractères maximum), l'échéance (date, avec heure optionnelle), la checklist (50 éléments maximum) et les pièces jointes (10 maximum) sont optionnelles.
- **RG-TCK-02** Statuts et transitions autorisées : `todo ↔ in_progress ↔ blocked`, `todo|in_progress|blocked → done|cancelled`, `done|cancelled → todo` (réouverture). `skipped` est réservé aux occurrences récurrentes dépassées (RG-TCK-08) et peut revenir à `todo`. Toute transition est tracée dans `ticket_event`.
- **RG-TCK-03** Terminer un ticket renseigne `completed_at` et `completed_by`, ainsi que `first_completed_at` s'il est vide. La réouverture efface `completed_at` mais **conserve** `first_completed_at`, ce qui sert à l'anti-abus d'XP.
- **RG-TCK-04** Assignation : zéro, une ou plusieurs cibles. Une cible est un membre actif ou un groupe actif du jardin. Un groupe assigné couvre ses membres **au moment de la consultation** : un membre ajouté au groupe voit les tickets du groupe. Un observateur ne peut pas être assigné.
- **RG-TCK-05** Un ticket assigné à un groupe est terminé par n'importe quel membre du groupe. Le premier qui le termine le termine pour tous.
- **RG-TCK-06** « Mes tâches du jour » regroupe les tickets non terminés qui me sont assignés directement ou via un groupe, ou que j'ai créés sans assignation, avec `due_on ≤ aujourd'hui` (fuseau du jardin) et `visible_from ≤ aujourd'hui`. Ils sont triés retard d'abord, puis par priorité puis par échéance, et regroupés par jardin.
- **RG-TCK-07** Récurrence : une série porte un modèle de ticket, une règle RRULE (sous-ensemble autorisé : `FREQ=DAILY|WEEKLY|MONTHLY|YEARLY`, `INTERVAL`, `BYDAY`, `BYMONTHDAY`, `BYMONTH`, `COUNT`, `UNTIL`), une date de départ et un fuseau (celui du jardin). Exemple « arroser la serre tous les 2 jours en juillet » : `FREQ=DAILY;INTERVAL=2;BYMONTH=7`. Les occurrences sont **matérialisées** en tickets sur un horizon glissant de 14 jours (unicité `(series_id, occurrence_on)`).
- **RG-TCK-08** Occurrences manquées : si la série a `skip_missed = true` (valeur par défaut), l'occurrence précédente non terminée passe en `skipped` à l'échéance de la suivante. Cela évite l'empilement de tâches en retard, sans notification ni pénalité.
- **RG-TCK-09** Modifier une série propose deux options : « cette occurrence seulement » (le ticket est marqué `detached` : il garde `series_id` pour l'historique mais la série ne le modifie plus) ou « cette occurrence et les suivantes » (le modèle de la série et les occurrences futures non terminées et non détachées sont mises à jour). Arrêter une série supprime ses occurrences futures non commencées.
- **RG-TCK-10** Tickets d'étape : quand une culture a une étape prévue (`planned_on`) sans date réelle, un ticket `task` est créé ou mis à jour (unicité par `source_stage_id`) avec `due_on = planned_on` et `visible_from = planned_on − délai`. Délai par défaut : 3 jours pour semis, repiquage et plantation, 0 pour les autres ; le titre est i18n, par exemple « Repiquer : Tomate Cœur de bœuf (Planche 2) ». Si la date prévue change, l'échéance suit. Si la date réelle est saisie, le ticket est terminé automatiquement. Terminer le ticket propose de renseigner la date réelle de l'étape (un tap, date du jour par défaut). Ces tickets sont rattachés à la culture et assignés par défaut à son créateur ; leur titre est traduisible (`title_key` + paramètres, `title` en repli) et suit la zone si la culture est déplacée. Une culture terminée, en échec, abandonnée ou supprimée n'a plus de ticket d'étape ouvert.
- **RG-TCK-11** Tickets de guide : appliquer un guide crée les tickets de `calendar_template.tasks` avec `source = guide`, une échéance calculée à partir de l'étape de référence et `visible_from = due_on − leadDays` (3 jours par défaut). Réappliquer une version plus récente annule les tickets de guide non terminés de la version précédente et crée les nouveaux.
- **RG-TCK-12** Vues : liste (filtres : statut, type, assigné, groupe, niveau, zone avec sous-zones, culture, échéance, priorité ; tri), kanban (colonnes `todo`, `in_progress`, `blocked`, `done` ; glisser-déposer = transition), calendrier (mois et semaine, par `due_on`, occurrences futures virtuelles affichées au-delà de l'horizon de 14 jours), « mes tâches du jour ». Filtres et vue sont dans l'URL (`nuqs`). Le kanban offre aussi, sur chaque carte, un menu « Déplacer vers » (clavier, tactile) équivalent au glisser-déposer.
- **RG-TCK-13** Tickets cachés : les tickets avec `visible_from` dans le futur n'apparaissent pas dans la liste par défaut ni dans « mes tâches du jour ». Ils apparaissent dans le calendrier et avec le filtre « à venir ».
- **RG-TCK-14** Mentions : `@pseudo` dans un commentaire, résolu uniquement parmi les membres actifs du jardin. Une mention inconnue reste du texte.
- **RG-NTF-01** Types de notification : `assigned` (on m'assigne, directement ou via un groupe au moment de l'assignation), `due_soon` (veille de l'échéance, 8 h heure du jardin), `overdue` (une seule fois), `mentioned`, `commented` (ticket que j'ai créé ou qui m'est assigné), `invited`, `member_left_unassigned` (admins), `digest` (récapitulatif quotidien), `achievement` et `quest` (in-app seulement). Lot 4 : `content_hidden` (contenu masqué après 3 signalements, RG-MOD-02) et `moderation_decision` (contenu retiré, avec le motif, RG-MOD-03), in-app par défaut, e-mail désactivé par défaut.
- **RG-NTF-02** Préférences par type × canal (`email`, `in_app`). Défauts e-mail : `assigned`, `mentioned`, `due_soon` et `invited` activés ; `commented`, `overdue` et `digest` désactivés. In-app : tout activé. `achievement` et `quest` **ne sont jamais envoyés par e-mail** (aucune notification d'incitation).
- **RG-NTF-03** On n'est jamais notifié de ses propres actions. Les notifications identiques (même type, même ticket, même destinataire) sont regroupées sur une fenêtre de 10 minutes : la notification existante non lue voit son compteur incrémenté, sans nouvel e-mail. Les occurrences d'une série « à sauter » (RG-TCK-08) ne déclenchent pas d'alerte `overdue`. Un type `group_archived_unassigned` prévient le créateur d'un ticket désassigné par l'archivage d'un groupe (RG-GRP-02).
- **RG-NTF-04** Chaque e-mail contient un lien de désinscription pour son type, qui fonctionne sans connexion (jeton signé). Ouvrir le lien affiche une confirmation sans rien modifier ; la préférence n'est désactivée qu'au clic sur « Me désinscrire » (POST), pour que les préchargements de liens et les scanners de messagerie ne désinscrivent personne.

### 6.9 Guides et tips (GUI, TIP, MOD)

- **RG-GUI-01** Un guide a un auteur, une espèce (obligatoire) et éventuellement une variété, une visibilité, un contexte (§4.5) et un calendrier type optionnel. Le brouillon (`draft`) est privé à l'auteur.
- **RG-GUI-02** Publier crée une `guide_version` immuable (numéro incrémenté, note de changement optionnelle) et met à jour `current_version_id`. On peut ensuite rééditer le brouillon. Une version n'est jamais modifiée ni supprimée, sauf suppression complète du guide.
- **RG-GUI-03** Visibilité : `private` = membres du jardin rattaché ; `unlisted` = toute personne qui a le lien (non indexé, absent des recherches) ; `public` = listé, recherchable, indexable (`/guides-publics/[slug]`). Passer de `public` à `private` est autorisé et retire le guide des listes. Les forks existants restent valides, avec la mention « original devenu privé ». Un guide non listé se lit sans compte à `/guides-publics/[slug]`, avec `noindex`. Un guide masqué par la modération reste lisible de son auteur et des modérateurs (sauf s'il est privé : un rôle plateforme ne donne aucun accès aux données privées, §5.1). Un guide illisible renvoie 404, jamais 403.
- **RG-GUI-04** Fork : crée un nouveau guide de l'utilisateur dont le brouillon est la copie de la version courante, avec `forked_from_version_id`. Le guide original affiche le nombre de forks publics. Le fork affiche « adapté de … (version n) ».
- **RG-GUI-05** Appliquer un guide à une culture : l'utilisateur choisit la date d'ancrage. Les dates **prévues** des étapes vides sont calculées ; pour celles déjà renseignées, le service demande s'il faut les écraser. Les dates réelles ne sont jamais modifiées. Les tickets du modèle sont générés (RG-TCK-11) et `applied_guide_version_id` est enregistré. Une tâche du calendrier part de la date **réelle** de son étape si elle existe, sinon de la date calculée, sinon de la date prévue de la culture ; sans aucune date, elle n'est pas créée. Réappliquer un guide (même version ou plus récente) annule d'abord les tickets de guide encore ouverts de la culture. Le guide doit concerner l'espèce de la culture ; un guide privé ne s'applique qu'aux cultures de son jardin.
- **RG-GUI-06** La comparaison de versions affiche un diff ligne à ligne du Markdown et un diff du contexte et du calendrier.
- **RG-TIP-01** Un tip compte 10 à 500 caractères et 1 à 5 tags. Ses tags sont normalisés en slugs ; un tag absent est créé, et 3 suggestions sont faites à partir des tags existants. Le contexte (geohash4, Köppen, environnement) est pris par défaut dans le jardin courant, et peut être retiré.
- **RG-TIP-02** Vote : un vote par utilisateur et par tip (+1 « utile », −1 « pas utile »), modifiable et annulable. Interdit sur ses propres tips.
- **RG-TIP-03** Fil de tips : classé par score de Wilson (borne inférieure, 95 %) des votes, pondéré par la proximité de contexte (§7.2) avec le jardin courant. Filtres par tag, espèce et environnement. Rang V1 : `0,7 × Wilson + 0,3 × (1 − d)`, où `d` est la distance de contexte entre le tip (geohash4, Köppen, environnement) et le jardin courant ; les 300 tips les plus récents correspondant aux filtres sont classés, 50 sont affichés.
- **RG-MOD-01** Signalement : motif (spam, inexact ou dangereux, inapproprié, droits d'auteur, autre) et détail optionnel. Un seul signalement par utilisateur et par contenu. On ne signale pas son propre contenu ; on ne signale qu'un contenu qu'on peut lire.
- **RG-MOD-02** Un contenu qui reçoit 3 signalements ouverts d'utilisateurs distincts est **masqué automatiquement** en attendant la décision de la modération. L'auteur en est notifié.
- **RG-MOD-03** Décisions de modération : `dismissed` (le contenu est réaffiché) ou `actioned` (le contenu reste masqué, l'auteur est notifié avec le motif). Les décisions sont tracées.
- **RG-MOD-04** Plafonds horaires par utilisateur (anti-spam) : 10 tips, 5 guides ou forks, 120 votes, 20 signalements ; au-delà, `RATE_LIMITED`. Le seuil de masquage automatique (RG-MOD-02) compte pour l'instant tous les comptes vérifiés ; le restreindre aux comptes de plus de 7 jours est en attente de décision.

### 6.10 Bilans et partage (RES)

- **RG-RES-01** Un bilan par culture et par saison. Il est proposé quand la culture passe à `finished` ou `failed`, ou depuis la fiche à tout moment après la première récolte. Pour une vivace, un bilan est proposé par saison.
- **RG-RES-02** Champs du formulaire en un écran : rendement total en kg (pré-rempli avec la somme des récoltes convertibles, modifiable) ou case « pas de récolte » ; qualité (1 à 5 étoiles) ; taux de réussite (curseur de 0 à 100 %, pré-rempli à partir du nombre de plants si connu) ; problèmes (puces multi-choix tirées du catalogue, pré-cochées depuis le journal, avec sévérité) ; note globale (1 à 5) ; « je recommencerais » (oui / non) ; notes libres (optionnelles). V1 : le taux de réussite n'est pas encore pré-rempli à partir du nombre de plants.
- **RG-RES-03** Complétude : 100 % si le rendement (ou « pas de récolte »), la qualité, le taux de réussite, la note globale et « je recommencerais » sont renseignés, et que les problèmes ont été passés en revue (choix explicite « aucun problème » accepté). Sinon, chaque champ requis vaut 20 %. Sans revue des problèmes, un bilan dont les cinq champs sont renseignés plafonne à 80 %.
- **RG-RES-04** `yield_kg_m2 = total_kg / area_m2` si `area_m2` est connue (RG-CUL-06), sinon null.
- **RG-RES-05** Un bilan est **partagé** (alimente `shared_result_fact`) si et seulement si : le jardin a `share_results = true` (décision de l'owner, avec consentement tracé), la complétude est ≥ 60 %, la variété est `approved` (ou la culture n'a qu'une espèce), et la culture n'est pas supprimée. Révoquer le partage retire les faits au rafraîchissement suivant (au plus 1 heure plus tard).

---

## 7. Moteur de recommandations V1

### 7.1 Interface de service stable

L'UI ne dépend que de cette interface. Une implémentation future (modèle statistique ou ML) la remplacera sans toucher à l'UI.

```ts
interface RecommendationEngine {
  /** Variétés conseillées pour une zone et une période. */
  recommendVarieties(q: { gardenId: string; zoneId: string; from: Date; to: Date; speciesId?: string; limit?: number },
                     scope: Scope): Promise<VarietyRecommendation[]>;
  /** Fenêtres de semis / plantation ajustées pour une espèce ou une variété dans une zone. */
  adjustedCalendar(q: { zoneId: string; speciesId: string; varietyId?: string; method?: Method },
                   scope: Scope): Promise<CalendarRecommendation>;
  /** Comparaison des méthodes pour une espèce dans le contexte de la zone. */
  compareMethods(q: { zoneId: string; speciesId: string }, scope: Scope): Promise<MethodRecommendation[]>;
}

type Explanation = {
  source: 'community' | 'reference' | 'guide' | 'own_history';
  confidence: 'high' | 'medium' | 'low' | 'cold_start';
  gardensCount: number;            // jardins distincts similaires
  resultsCount: number;
  meanSuccessPct?: number;
  medianYieldKgM2?: number;
  topProblems?: { code: string; sharePct: number }[];
  contextSummary: string;          // clé i18n + paramètres : « climat Cfb, 0–400 m, plein air, paillage »
  ownHistory?: { seasons: number; meanRating: number };
  warnings: ('rotation' | 'unfavorable_companion' | 'out_of_window' | 'environment_mismatch')[];
};
type VarietyRecommendation = { speciesId: string; varietyId?: string; score: number; window?: DoyWindow;
                               bestMethod?: Method; explanation: Explanation };
```

`engine.version` est renvoyé avec chaque réponse et journalisé.

### 7.2 Distance de contexte

Le contexte d'une zone est son contexte effectif (§6.3) combiné au contexte du jardin. La distance `d(A, B) ∈ [0, 1]` est une somme pondérée de distances partielles normalisées :

| Composante | Poids | Distance partielle |
|---|---|---|
| Climat (Köppen) | 0,25 | 0 si code identique ; 0,3 si même groupe et même régime de précipitations (deux premières lettres) ; 0,6 si même groupe principal (première lettre) ; 1 sinon ; 0,5 si l'un est inconnu |
| Environnement | 0,20 | 0 si identique ; 0,4 entre `greenhouse` et `tunnel`, ou entre `open_air` et `balcony_roof` ; 0,6 entre `indoor`, `soilless` et `hydroponic` ; 1 sinon |
| Altitude | 0,15 | `min(|Δ| / 800 m, 1)` ; 0,5 si inconnue |
| Latitude | 0,10 | `min(|Δlat| / 8°, 1)`, latitude du centre de la cellule geohash4 ; hémisphère opposé = 1 |
| Rusticité | 0,05 | `min(|Δ demi-zones| / 4, 1)` ; 0,5 si inconnue |
| Sol | 0,10 | 0 si identique ; 0,5 entre types voisins (matrice V1 : limoneux ↔ limon fin, limoneux ↔ argileux, limoneux ↔ sableux, limon fin ↔ argileux, sableux ↔ caillouteux, calcaire ↔ caillouteux, tourbeux ↔ terreau) ; 1 sinon ; 0,5 si inconnu |
| pH | 0,05 | `min(|Δ| / 2, 1)` ; 0,5 si inconnu |
| Pratiques | 0,10 | distance de Jaccard sur les pratiques effectives qui influencent la culture (`organic`, `no_dig`, `living_soil`, `mulching`, `irrigation_*`, `green_manure`) |

- Sont **similaires** les contextes avec `d ≤ 0,35`. Leur poids de similarité est `s = 1 − d / 0,35`, compris entre 0 et 1.
- Filtres durs : les environnements `indoor`, `soilless` et `hydroponic` ne sont jamais comparés à `open_air`, quel que soit le reste ; les faits de l'hémisphère opposé ne sont pas comparés (RCO-07), le décalage de 182 jours ne servant qu'à aligner le référentiel pour un jardin de l'hémisphère sud.
- Poids et seuils sont des constantes versionnées (`RECO_WEIGHTS_V1`), testées unitairement, documentées ici, et modifiables uniquement par une mise à jour de la spec.

### 7.3 Score d'une variété

Pour chaque fait partagé `f` d'une variété (ou d'une espèce, si `varietyId` est absent), dans un contexte similaire :

1. Résultat unitaire `o(f) = 0,5 × success_pct/100 + 0,3 × (rating − 1)/4 + 0,2 × p_yield(f)`. `p_yield` est le rang centile moyen du rendement au m² parmi les faits de la même espèce dans le même environnement. Une composante inconnue (rendement, réussite ou note) voit son poids redistribué sur les autres.
2. **Plafond par jardin** : au plus les 3 faits les plus récents par jardin d'origine et par variété. Un jardin très actif ne pèse donc pas plus que 3 faits.
3. **Lissage bayésien** vers un a priori `μ₀` :
   `score = (Σ s·o + k·μ₀) / (Σ s + k)`, avec `k = 5`. `μ₀` vaut le score moyen de l'espèce dans les contextes similaires, sinon 0,6.
4. **Indice de confiance**, d'après le nombre de **jardins distincts** `n` et la taille effective `n_eff = (Σs)² / Σs²` :
   - `high` : `n ≥ 15` et `n_eff ≥ 10` ;
   - `medium` : `n ≥ 8` ;
   - `low` : `5 ≤ n < 8` ;
   - en dessous de 5 jardins distincts : **démarrage à froid** (§7.5). Le seuil « 8 faits » est retiré : il contredisait RCO-02 (5 jardins et 7 faits donnent `low`).
5. **Ajustements** :
   - avertissement `rotation` (RG-ROT-01) : × 0,7 ;
   - association défavorable avec une culture voisine : × 0,85 ;
   - période demandée hors de la fenêtre de semis ou de plantation : exclusion, sauf si `speciesId` est explicitement demandé, auquel cas l'avertissement `out_of_window` est ajouté.
6. **Historique propre** : les bilans du jardin de l'utilisateur, consentis ou non, sont affichés à part (« Dans ton jardin : 3 saisons, note moyenne 4,2 »). Ils n'entrent pas dans le score communautaire, pour éviter l'auto-renforcement.

Tri : score décroissant, puis confiance. Ex æquo : la variété la plus cultivée dans les contextes similaires.

### 7.4 Calendriers ajustés

- Pour chaque fait similaire avec un résultat unitaire `o ≥ 0,6`, on collecte le jour de l'année de l'étape demandée (semis ou plantation). Dans l'hémisphère sud, on décale de 182 jours pour comparer des saisons équivalentes.
- **Fenêtre ajustée** = percentiles pondérés P20 à P80 (poids `s`). L'optimum est la médiane pondérée.
- Affichage : fenêtre de référence (`species_calendar` du groupe Köppen et de l'environnement), fenêtre ajustée, et décalage en jours, par exemple « 12 jours plus tôt que la référence dans 18 jardins similaires ».
- Moins de 5 jardins distincts : la fenêtre de référence est affichée seule, avec l'étiquette « référentiel ».

### 7.5 Démarrage à froid

Quand le seuil n'est pas atteint, les sources sont utilisées dans cet ordre :

1. guides publics de l'espèce dont le contexte correspond (même groupe Köppen et même environnement), triés par nombre d'applications ;
2. `species_calendar` et besoins de l'espèce (température minimale, soleil) confrontés au contexte de la zone ;
3. espèces adaptées à l'environnement et à la saison, sans score.

La recommandation porte alors `confidence = 'cold_start'`. L'UI affiche un bandeau distinct, par exemple : « Pas encore assez de résultats de jardins proches du tien (3 sur les 5 nécessaires) ; suggestion issue du référentiel. »

### 7.6 Données et performances

- Source unique : la vue matérialisée `shared_result_fact` (§11.3), qui ne contient ni `user_id` ni `garden_id` en clair, mais un identifiant de jardin pseudonymisé (HMAC avec un secret serveur, renouvelé chaque année) pour le plafond par jardin.
- Calcul en SQL plus TypeScript, à la demande. Prévu : mise en cache par `(zoneContextHash, période, speciesId)` pendant 1 heure (`unstable_cache` avec tag `reco`), invalidée au rafraîchissement de la vue ; non implémentée en V1 (volumes du seed), à reprendre avec la mesure de charge.
- Le service est découpé en fonctions pures (distance, score, percentiles, confiance) testées sans base, et une fonction d'orchestration testée avec des faits seedés.
- Le module météo (hors MVP) pourra ajouter une composante « climat observé » à la distance, sans changer l'interface.

---

## 8. Système de progression

### 8.1 Principes

- L'XP vient **uniquement d'actions réelles**, captées par les événements de domaine (§3.5). Le calcul est une **fonction pure** : `score(event, history) → LedgerDraft[]`, versionnée par `rules_version`.
- Le journal d'XP (`xp_ledger_entry`) est append-only et auditable. Chaque ligne référence son événement et une clé d'idempotence. `user_progress` est une projection recalculable.
- **Pas de mécanique punitive** : ni perte d'XP par inactivité, ni série (« streak ») à entretenir, ni quête « ratée » affichée comme un échec. Les seules lignes négatives sont des **annulations** de gains liés à un contenu supprimé. Elles sont présentées de façon neutre (« Récolte supprimée : gain annulé »).
- Le barème favorise la **qualité des données** : un bilan complet vaut plus qu'une dizaine d'actions mineures.
- Toute la progression fonctionne dans la vue classique (profil, journal d'XP, succès, quêtes). La vue gamifiée ne fait que l'afficher.

### 8.2 Barème V1 (`rules_version = 1`)

| Code | Déclencheur | XP | Plafond (par jour local de l'utilisateur) | Compétences |
|---|---|---:|---|---|
| `stage.sown_planted` | Date réelle de semis ou de plantation renseignée | 10 | 10 occurrences | domaine de l'espèce (+ `greenhouse` si l'environnement est sous abri) |
| `stage.other` | Autre étape réelle renseignée (levée, repiquage, floraison…) | 3 | 20 | idem |
| `journal.observation` | Entrée de journal avec texte ≥ 20 caractères ou données structurées | 5 | 10 | idem |
| `journal.problem` | Entrée `disease` ou `pest` structurée (problème + sévérité) | 8 | 5 | idem |
| `journal.photo` | Entrée avec au moins une photo (une fois par entrée) | 3 | 10 | idem |
| `harvest.recorded` | Récolte avec quantité | 8 | 10 | idem ; `seeds` si `seed_saving` |
| `result.complete` | Bilan à 100 % de complétude (une fois par culture et par saison) | 40 | aucun | idem |
| `result.partial` | Bilan à 60 % ou plus mais incomplet (complété ensuite : on verse la différence jusqu'à 40) | 15 | aucun | idem |
| `result.documented_bonus` | Bilan complet d'une culture qui a au moins 3 observations datées à des jours différents | 10 | aucun | idem |
| `ticket.completed` | Ticket terminé pour la **première** fois (`first_completed_at`), par la personne qui le termine | 5 | 15 | `ticket.skill_domain`, sinon déduite de la culture ou de la zone (`compost` pour une zone composteur) |
| `ticket.collective_help` | Bonus quand le ticket terminé est assigné à un groupe ou créé par un autre membre, dans un jardin `collective`, `association` ou `educational` | +3 | 10 | idem |
| `guide.first_published` | Première publication d'un guide public ou non listé (au moins 300 mots) | 30 | 1 | domaine de l'espèce |
| `guide.applied_by_other` | Un autre utilisateur, dans un jardin dont l'auteur n'est pas membre, applique le guide | 5 | 10 (par auteur) | idem |
| `guide.forked_by_other` | Fork public par un autre utilisateur | 5 | 5 | idem |
| `tip.useful_vote` | Vote « utile » d'un autre utilisateur | 2 | 30 par jour, 40 au total par tip | — |
| `variety.approved` | Variété proposée et approuvée | 15 | aucun | domaine de l'espèce |
| `quest.daily` / `quest.weekly` / `quest.seasonal` | Quête terminée | 5 / 15 / 30 | 3 quotidiennes par jour | — |

Volontairement, rien ne rapporte d'XP pour : créer un jardin, une zone ou un ticket, envoyer une invitation, commenter, voter, modifier l'avatar ou placer de la déco. Ces actions sont trop faciles à répéter et n'apportent rien au moteur.

### 8.3 Règles anti-abus

- **RG-XP-01 Plafonds** : au-delà du plafond journalier d'un code, l'action est tout de même enregistrée dans le journal avec `amount = 0` et `reason = cap_reached`, pour la transparence. Le jour est celui du fuseau de l'utilisateur au moment de l'événement (`local_day`).
- **RG-XP-02 Suppression** : quand un contenu ayant rapporté de l'XP est supprimé (culture, entrée de journal, photo, récolte, bilan, ticket), une ligne `reversal` de montant opposé est ajoutée pour **chaque** gain lié (`reverses_entry_id`). C'est le seul cas de montant négatif. La restauration d'un contenu supprimé ne redonne pas l'XP : la clé d'idempotence d'origine est consommée (§17 Q-14).
- **RG-XP-03 Réouverture** : l'XP `ticket.completed` a pour clé `ticket.completed:{ticketId}`. Fermer, rouvrir puis refermer ne la verse qu'une fois, quelle que soit la personne qui referme. Chaque occurrence récurrente est un ticket distinct, plafonné à 15 par jour.
- **RG-XP-04 Contenu communautaire** : l'XP des tips et des guides n'est attribuée que sur des actions **d'autres utilisateurs**, ayant un e-mail vérifié et un compte de plus de 7 jours. Retirer ou inverser un vote annule le gain correspondant. Les votes de membres qui partagent un jardin avec l'auteur comptent pour le score affiché mais, au-delà de 5 par tip, **pas pour l'XP** (anti-collusion).
- **RG-XP-05 Idempotence** : chaque gain a une clé `{code}:{subjectId}[:{suffix}]` (par exemple `journal.photo:{entryId}`, `result.complete:{cultureId}:{seasonId}`). Une clé déjà présente ne produit pas de nouveau gain.
- **RG-XP-06 Antidatage** : les gains sont datés à l'instant de la saisie et non à la date déclarée (`observed_at`). Antidater ne permet donc pas de contourner les plafonds.
- **RG-XP-07 Saisies en masse** : plus de 30 événements générateurs d'XP en 10 minutes par un même utilisateur placent les suivants en `amount = 0, reason = cap_reached` jusqu'à la fin de la fenêtre, et signalent le cas dans `/admin/xp`.
- **RG-XP-08 Recalcul** : `pnpm xp:recompute [--user <id>]` rejoue tous les événements dans l'ordre avec le barème courant, dans une table fantôme. Il produit un rapport des écarts, puis, avec `--apply`, ajoute dans la même transaction des lignes de correction `reason = recompute` dont la clé est `{clé d'origine}#recompute{horodatage}`. Le journal reste donc append-only et un second recalcul ne trouve aucun écart. La table fantôme est tenue en mémoire. Le recalcul est lancé par un admin en ligne de commande ; il n'y a pas de recalcul ciblé déclenché par un événement. Un recalcul ne fait **jamais baisser le niveau affiché** : le niveau est un maximum historique conservé dans `user_progress` (§17 Q-14).

### 8.4 Niveaux et compétences

- XP cumulée pour atteindre le niveau L : `seuil(L) = 50 × L × (L − 1)`. Soit : niveau 2 à 100, niveau 3 à 300, niveau 5 à 1 000, niveau 10 à 4 500, niveau 20 à 19 000. Pas de niveau maximum.
- Ordre de grandeur : une saison bien documentée (15 cultures, bilans complets, une centaine d'observations) rapporte environ 2 000 XP, soit le niveau 6 ou 7.
- **Compétences** : chaque gain alimente jusqu'à deux compétences (`skill_primary`, `skill_secondary`) du même montant. Les compétences sont des compteurs indépendants qui ne s'ajoutent pas au total. Niveau de compétence : `seuil_c(L) = 25 × L × (L − 1)`.
- Domaine de l'espèce (`species.skill_domain`) : `vegetable`, `herbs`, `fruit` ou `flowers`. `greenhouse` s'ajoute en compétence secondaire si l'environnement effectif est `greenhouse`, `tunnel` ou `indoor`. `seeds` s'applique aux récoltes `seed_saving` et aux semis issus de semences maison. `compost` s'applique aux tickets et entrées de journal des zones de type composteur.

### 8.5 Succès (registre en code)

| Code | Condition (évaluée sur l'historique de l'utilisateur, dans tous ses jardins) |
|---|---|
| `first_emergence` | Première date de levée réelle renseignée |
| `first_harvest` | Première récolte saisie |
| `ten_varieties` | 10 variétés distinctes (ou espèces sans variété) dans des cultures qu'il a créées |
| `rotation_3_years` | Une zone où il a créé au moins une culture annuelle pendant 3 saisons consécutives, sans aucun avertissement de rotation ignoré |
| `seed_saver` | Une culture `own_saved` dont la culture d'origine a une récolte `seed_saving`, et qui a elle-même une date réelle de levée |
| `season_documented` | Une saison close avec au moins 5 cultures créées par lui, toutes avec un bilan complet et au moins 3 observations |
| `first_guide` | Premier guide public ou non listé publié |
| `useful_tips_10` | 10 votes « utile » comptés pour l'XP, tous tips confondus |
| `collective_active` | 20 tickets terminés dans des jardins collectifs, associatifs ou pédagogiques |
| `all_seasons` | Au moins une action génératrice d'XP pendant chacune des 4 saisons astronomiques d'une même année glissante |

Les succès sont évalués **de façon synchrone**, dans la transaction de l'événement qui les déclenche, par l'abonné de progression (§3.5) ; le seed les évalue une fois en fin de chargement. Ils sont idempotents et **jamais retirés** (même après une suppression qui annule de l'XP). Les succès verrouillés sont visibles avec leur condition et, si possible, leur avancement (« 7 / 10 variétés »).

### 8.6 Quêtes

- **Quotidiennes** (au plus 3, générées à 0 h du fuseau de l'utilisateur) : tirées de « mes tâches du jour » (RG-TCK-06), en privilégiant les retards puis les priorités élevées. Exemple : « Arroser la serre ». Elles sont terminées automatiquement quand le ticket source est terminé, quelle que soit la vue utilisée.
- **Hebdomadaires** (au plus 3, générées le lundi) : étapes prévues dans les 7 jours (« Repiquer les tomates d'ici dimanche ») ou bilans en attente (« Fais le bilan de tes radis »).
- **Saisonnières** : modèles en code, déclenchés selon la saison astronomique et l'hémisphère, et pertinents seulement si le jardin a des zones concernées. Exemples : « Prépare tes planches pour l'automne » (3 tickets `maintenance` terminés sur des planches entre le 1er septembre et le 30 novembre), « Documente 5 levées ce printemps ».
- Une quête non terminée **expire sans trace visible d'échec**. Elle disparaît simplement à la fin de sa période.
- Aucune quête n'existe sans tâche réelle correspondante. Il n'y a pas de quête « artificielle » du type « ouvre l'app 3 jours de suite ».

### 8.7 Progression collective (jardins collectifs)

- **XP du jardin** = somme des gains (hors annulations) dont `garden_id` est ce jardin. Niveau du jardin : `seuil(L) × 5`.
- **Objectifs collectifs** (`garden_goal`) : métrique (`tickets_completed`, `harvest_kg`, `observations`, `results_complete`, `cultures_started`), cible, période, et groupe optionnel. La progression est calculée à la lecture.
- **Tableau des contributions** : par membre, sur une période, le nombre d'actions par catégorie (tickets, observations, récoltes, bilans). Il est **trié par ordre alphabétique** par défaut, sans rang affiché. Il est affiché dans l'onglet « Contributions » de la page des membres, avec les objectifs. Si un admin active `leaderboard_enabled`, un classement trié par XP s'ajoute sous ce tableau, et chaque membre peut choisir d'en être exclu depuis son profil (`user_profile.leaderboard_opt_out`).

---

## 9. Vue jardin gamifiée

### 9.1 Moteur et intégration

- **PixiJS v8**, dans un composant client isolé `GardenCanvas`, chargé via `next/dynamic(() => import(...), { ssr: false })`. Le reste de l'app ne charge jamais PixiJS. La page jardin affiche d'abord un aperçu statique (miniature et liste accessible), puis le canvas.
- Le Server Component de la page charge un **instantané de scène** (`SceneSnapshot` : zones avec géométrie, terrain, déco, cultures avec étape visuelle calculée, états, avatars des membres), validé par Zod et passé en prop. Les mutations passent par les mêmes Server Actions que la vue classique. Après revalidation, un nouvel instantané est comparé à l'ancien (diff) et appliqué au store.
- **Stores Zustand** (`game/stores`) : `sceneStore` (données de l'instantané), `cameraStore` (position, zoom), `selectionStore`, `toolStore` (éditeur), `historyStore` (annuler / rétablir de l'éditeur). Le moteur s'abonne via `subscribe` et lit via `getState()`. React n'est pas sur le chemin de rendu.
- **Rendu à la demande** : le ticker Pixi est arrêté par défaut. Un rendu est demandé (`requestRender`) quand un store change, quand la caméra bouge ou au redimensionnement. Les animations ambiantes (ondulation, insectes) font tourner le ticker à 30 i/s au plus, seulement si « animations réduites » est désactivé, que l'onglet est visible et que la scène est à l'écran. Elles s'arrêtent après 20 s sans interaction.
- **Performances** : terrain précalculé en textures par blocs de 16 × 16 tuiles (re-précalcul seulement du bloc modifié) ; culling des conteneurs hors champ (`cullable`) ; une seule texture d'atlas par catégorie ; mise à l'échelle entière en `nearest` (pixel art net) ; tri de profondeur par le bas des sprites.
- **Scènes** : la scène extérieure, plus une scène intérieure par zone `has_interior = true`. Entrer dans une serre lance une transition (fondu de 300 ms, instantané en animations réduites). Un fil d'Ariane permet de remonter.
- **Cycle jour / nuit et saisons** : filtre de couleur global (pas d'assets dédiés), calculé à partir de l'heure locale du jardin, du lever et du coucher du soleil (approximation NOAA, latitude de la cellule geohash) et de la saison astronomique selon l'hémisphère. La variante saisonnière du terrain est choisie si les assets en fournissent une (§9.2). La météo réelle sera affichée seulement si le module météo est actif (hors MVP).

### 9.2 Contrat avec les assets visuels

La production des assets est hors de cette spec. Le moteur attend :

- **Taille de tuile** : 32 × 32 px à l'échelle 1. Les objets plus grands sont des multiples de la tuile ; l'ancrage se fait en bas au centre. Les assets retenus sont la version **HD** (64 × 64 px par tuile, avatar de 64 × 96 px, atlas en plusieurs pages `related_multi_packs`) : le moteur les affiche à la résolution 2, la grille logique reste à 32 px.
- **Clés de sprites** : `species.sprite_key`, `variety.sprite_key`, `decor_item.sprite_key` et `avatar_item.sprite_key` référencent des entrées d'un **manifeste d'atlas** (JSON : clé → frames, taille, ancrage, animations). Le manifeste est livré avec les assets et validé par Zod au chargement.
- **Phases visuelles des cultures** : le moteur ne calcule pas de numéro d'image. Il calcule une **phase visuelle** générique (`seed`, `sprout`, `growing`, `flowering`, `fruiting`, `harvest_ready`, `seed_set`, `dormant`, `finished`) et une progression `0..1` dans la phase (§9.3). Le manifeste associe chaque `(sprite_key, phase)` à une frame, selon le modèle visuel de l'espèce (`species.visual_model`).
- **Repli** : clé de la variété → clé de l'espèce → clé générique de la famille botanique (`family:<code>`) → clé `unknown_plant`. Une clé absente du manifeste ne fait jamais planter le rendu : le repli suivant est utilisé et une alerte est journalisée en dev.
- **Terrain** : clés par type d'élément de terrain et de sol (`terrain:<kind>`), avec variantes optionnelles (`…:<season>`).
- **Avatar** : calques en niveaux de gris, avec rampes compatibles §10.2 ; 4 directions ; images à l'arrêt et en marche.
- Tant que les assets ne sont pas livrés, le moteur s'appuie sur des **assets de substitution** (formes colorées générées à l'exécution), pour que les lots 7 et 8 restent testables.

### 9.3 Phase visuelle d'une culture

Fonction pure `visualPhase(culture, today) → { phase, progress, flags }` :

1. On part des étapes qui ont une **date réelle** ≤ aujourd'hui. La plus avancée fixe la phase de base : `sowing` → `seed`, `emergence` → `sprout`, `transplanting` ou `planting` → `growing`, `flowering` → `flowering`, `fruiting` → `fruiting`, `harvest_start` → `harvest_ready`, `seed_set` → `seed_set`, `end` → `finished`.
2. Entre la dernière étape réelle et la prochaine étape **prévue**, la progression est interpolée linéairement. Si la prochaine étape prévue est atteinte en date, on bascule visuellement dans sa phase. On ne saute qu'une phase à la fois, et un drapeau `needsConfirmation` est ajouté si la date prévue est dépassée de plus de 7 jours sans date réelle.
3. Une culture plantée depuis des plants (`bought_plants`) commence en `growing`.
4. Une vivace hors période d'activité (hiver, selon l'hémisphère, sans étape en cours) est en `dormant`.
5. Une culture `finished` reste visible 14 jours en `finished`, puis disparaît du plan (elle reste dans l'historique).

### 9.4 États visuels

Bulles affichées au-dessus de la culture, calculées côté serveur dans l'instantané. Au plus 2 sont visibles à la fois ; l'ordre de priorité est l'ordre du tableau.

| État | Condition |
|---|---|
| `overdue_ticket` | Ticket ouvert en retard rattaché à la culture |
| `thirsty` | Ticket ouvert `action_tag = watering`, échu, sur la culture, sa zone ou un ancêtre (RG-JRN-04) |
| `disease` / `pest` | Entrée de journal `disease` ou `pest` non résolue depuis moins de 30 jours, ou ticket `problem` ouvert |
| `harvest_ready` | Phase `harvest_ready`, et `harvest_end` non renseignée |
| `needs_confirmation` | Drapeau de §9.3 |
| `assigned_to_me` | Ticket ouvert qui m'est assigné sur la culture |

### 9.5 Interactions

- Toucher une culture ouvre une **feuille inférieure** : nom, étape, bulles expliquées en texte, actions rapides (Observer, Photo, Arroser, Récolter, Ticket), liens vers la fiche et vers les tickets. Une action rapide ouvre la modale de saisie rapide (NFR-03) directement dans son mode, sans quitter la vue (la même modale que la fiche culture ; pas d'intercepting route).
- Toucher une zone ouvre sa feuille : cultures en cours, tickets, « Planter ici » (assistant de nouvelle culture pré-rempli).
- Gestes : glisser un doigt pour déplacer, pincer pour zoomer, double-tap pour zoomer sur une zone. Boutons + / − / recentrer toujours visibles.
- Les cultures n'ont pas de géométrie propre en V1 : elles sont réparties automatiquement dans le rectangle de leur zone, ou de son ancêtre placé le plus proche. Les cultures dont aucune zone ancêtre n'est placée, et les zones non placées, apparaissent dans un tiroir « À placer » ; l'éditeur de plan permet de dessiner l'emplacement d'une zone non placée.
- **Avatars** (jardins collectifs) : les membres actifs dans les 24 dernières heures apparaissent près de la dernière zone où ils ont agi. Ils sont statiques en animations réduites, avec une marche lente sinon. Ce ne sont pas des personnages contrôlables.

### 9.6 Couche DOM accessible

Au-dessus du canvas, une couche DOM superposée et synchronisée avec la caméra contient, pour chaque entité interactive visible, un `<button>` transparent positionné sur l'entité. Chaque bouton porte :
- `aria-label` en clair (« Tomate Cœur de bœuf, Planche 2, floraison, récolte prête ») ;
- `data-testid="culture-<id>"`, `"zone-<id>"`, `"decor-<id>"`, et `data-state` avec la liste des états.

Les éléments sont focusables au clavier, dans l'ordre de lecture de la scène, et un focus visible les entoure.

En plus de cette couche, une **liste textuelle** équivalente (« Liste des éléments de la scène ») est disponible pour les lecteurs d'écran.

Dans l'éditeur de plan, la couche expose :
- `data-testid="plan-grid"`, avec `data-tile-px` et `data-origin-x` / `data-origin-y`, pour que Playwright convertisse des coordonnées de tuiles en pixels ;
- les outils (`data-testid="tool-zone"`, …) ;
- un **formulaire alternatif** « Ajouter une zone par dimensions » (x, y, largeur, hauteur en cm, parent). Ce formulaire produit la même commande que le dessin à la souris.

### 9.7 Éditeur de plan

- **Outils** : sélectionner, dessiner une zone (rectangle aligné sur la grille, avec choix du type et du parent ; le parent est déduit de la zone qui contient le rectangle), redimensionner (tuile du coin bas-droit de la zone sélectionnée), déplacer, élément de terrain, déco (lot 8), gomme, échelle (`tile_size_cm` : 10, 25, 50 ou 100), annuler / rétablir (50 niveaux, sur les gestes non encore enregistrés : un enregistrement fixe une nouvelle base). Une zone dessinée reçoit un nom par défaut (« Planche 5 »), modifiable ensuite dans sa fiche.
- **Modèle de commandes** : chaque geste produit une `PlanCommand` (`createZone`, `resizeZone`, `moveZone`, `archiveZone`, `addTerrain`, `removeTerrain`, `placeDecor`, `moveDecor`, `removeDecor`, `setScale`), appliquée de façon optimiste au store local. Les commandes sont envoyées par lots à la Server Action `applyPlanCommands({ gardenId, sceneZoneId, baseVersion, commands })`, avec un enregistrement automatique 1,5 s après le dernier geste et un bouton « Enregistrer ».
- **Côté serveur** : validation Zod de chaque commande, permission `plan:edit` (ou `decor:place`, ou restriction de zone `edit`), contrôle des invariants (RG-ZON-05), puis application **transactionnelle tout-ou-rien** et incrément de `garden.plan_version`. Si `baseVersion ≠ plan_version` → `CONFLICT` : le client recharge l'instantané, rejoue ses commandes non confirmées et signale les conflits.
- La création d'une zone par dessin crée une vraie ligne `zone` (type, parent, géométrie, surface dérivée) et émet `zone.created`. Elle apparaît aussitôt dans la vue classique.
- Les zones et cultures ne sont jamais supprimées depuis l'éditeur : la gomme **archive**, toujours après confirmation (les cultures en cours de la zone sont alors terminées, RG-ZON-06). Un élément de terrain, sans historique, est supprimé.
- Chaque enregistrement émet `garden.plan_saved` (nombre de commandes, nouvelle version) ; les zones émettent leurs propres événements (`zone.created`, `zone.updated`, `zone.archived`).

---

## 10. Éditeur d'avatar

### 10.1 Calques

Ordre fixe de composition, de l'arrière vers l'avant : `shadow`, `body`, `face_eyes`, `face_brows`, `hair_back`, `bottom`, `top`, `apron`, `shoes`, `hair_front`, `headwear`, `held_item`.

Les cheveux sont découpés en `hair_back` et `hair_front` pour que les couvre-chefs se superposent correctement. Pour l'utilisateur, il n'y a qu'un seul choix « cheveux ».

Les calques `shadow`, `body` et `face_eyes` sont obligatoires. Les autres acceptent « aucun ».

### 10.2 Recoloration par palette

- Chaque calque est dessiné avec des **niveaux de gris réservés** : par exemple 4 niveaux par emplacement de couleur, et jusqu'à 2 emplacements par calque (principal, secondaire), soit des plages de gris distinctes.
- Une palette (`palette.ramp`) fournit 4 couleurs, de la plus claire à la plus sombre, pour un type d'emplacement (`skin`, `hair`, `eyes`, `cloth`, `material`).
- À l'affichage, chaque pixel gris est remplacé par la couleur de la palette choisie, par table de correspondance. Le calcul se fait en Canvas 2D, sans PixiJS, ce qui permet de l'utiliser aussi pour les vignettes. Le résultat est mis en cache en mémoire par `(item, palettes)`.
- **Teintes de peau** : au moins 12 palettes `skin` couvrant toute l'échelle. **Aucun** élément n'est restreint à un genre : pas de catégorie « homme / femme », les silhouettes sont neutres et toutes les options sont disponibles pour tous.

### 10.3 Configuration

```ts
const avatarConfigV1 = z.object({
  v: z.literal(1),
  layers: z.record(LayerSchema, z.object({
    item: z.string().nullable(),                         // code avatar_item, null = aucun
    palettes: z.array(z.string()).max(2).default([]),    // codes palette, un par emplacement
  })),
});
```

- Le serveur **revalide toute la configuration** à chaque enregistrement : l'élément existe et appartient au bon calque ; les palettes sont autorisées pour l'élément (`avatar_item_palette`) et compatibles avec le type d'emplacement ; la condition de déblocage est satisfaite **au moment de l'enregistrement**, d'après `user_progress` et `user_achievement` ; les calques obligatoires sont présents. Un élément verrouillé → `LOCKED_ITEM`, et rien n'est enregistré.
- Un élément déjà équipé reste équipé même si sa condition cesse d'être satisfaite (cas qui ne devrait pas arriver, puisque le niveau ne baisse jamais).
- `config_hash = sha256(JSON canonique)` est recalculé à l'enregistrement.
- Un avatar par défaut est généré à l'inscription, de façon déterministe à partir de l'ID utilisateur, avec uniquement des éléments débloqués par défaut.

### 10.4 Interface (`/app/profil/avatar`, et étape 1 de `/bienvenue`)

- Aperçu animé toujours visible en haut (sticky), d'environ 30 % de la hauteur sur mobile : 4 directions, à l'arrêt et en marche. Glisser horizontalement fait tourner l'aperçu, ce qui équivaut aux boutons ◀ ▶ (accessibles).
- Onglets par catégorie (Corps, Visage, Cheveux, Haut, Bas, Tablier, Chaussures, Chapeau, Accessoire), grille de vignettes, nuancier pour les emplacements de couleur de l'élément sélectionné.
- Élément verrouillé : vignette grisée avec un cadenas et sa condition en clair (« Débloqué au niveau 5 », « Succès Semencier »). Il n'est pas sélectionnable, mais un tap affiche la condition.
- Boutons « Aléatoire » (tirage parmi les éléments **débloqués** uniquement), « Annuler » (retour à la dernière version enregistrée) et « Enregistrer ». L'état d'édition (sélection, historique local) est dans un store Zustand, lu par la boucle d'animation de l'aperçu.

### 10.5 Vignettes

- Liste de membres, commentaires, profil public : un composant client `AvatarThumb` reçoit `(userId, config, configHash)` dans les données serveur. Il compose la vignette (tête et buste, 64 × 64) sur un canvas hors écran, une fois par `configHash`. Le résultat est mis en cache en mémoire et dans Cache Storage sous la clé `avatar:<configHash>`.
- **Invalidation** : toute modification change le `configHash`, donc la clé. La revalidation des tags (`tags.avatar(userId)`) met à jour les listes. Aucune image n'est générée ni téléversée par le serveur (aucune image forgée possible).
- Repli sans JavaScript ou avant composition : initiale du pseudo sur une couleur dérivée du hash.

---

## 11. Vie privée et RGPD

### 11.1 Données et finalités

| Donnée | Finalité | Base légale | Exposition |
|---|---|---|---|
| E-mail, mot de passe (haché par Better Auth, scrypt ou argon2) | Compte | Contrat | Jamais exposée à d'autres utilisateurs. Les membres voient le pseudo, pas l'e-mail (les admins d'un jardin voient l'e-mail des invitations en attente). |
| Localisation précise du jardin | Contexte, fuseau, soleil | Contrat | Owner et admins du jardin uniquement |
| Contexte agrégé (geohash4, Köppen…) | Recommandations, tips | Consentement (partage) ou contrat (usage interne au jardin) | Cellule d'environ 39 × 20 km au minimum |
| Bilans | Recommandations communautaires | **Consentement explicite** au niveau du jardin | Agrégés, anonymisés, k ≥ 5 jardins |
| Photos | Journal | Contrat | Membres du jardin |
| Événements, XP | Progression | Contrat | L'utilisateur ; contributions visibles des membres |

### 11.2 Consentement au partage

- Le partage des bilans est **désactivé par défaut**. L'owner l'active (onboarding ou paramètres du jardin) après un texte clair indiquant ce qui est partagé, sous quelle forme et comment le révoquer. L'activation crée un `consent` (`kind = share_results`, version du texte) au nom de l'owner, et `garden.share_results = true`.
- Les membres sont informés (bandeau dans le jardin) que les bilans du jardin sont partagés de façon anonyme (§17 Q-10 : faut-il aussi un opt-out individuel ?).
- La révocation est effective au rafraîchissement suivant de `shared_result_fact`, au plus 1 heure plus tard.

### 11.3 Anonymisation : `shared_result_fact`

La vue matérialisée ne contient que :
- le pseudo-identifiant du jardin (HMAC annuel) ;
- `geohash4` ;
- Köppen, zone de rusticité ;
- altitude arrondie à 100 m ;
- type de sol, pH arrondi à 0,5 ;
- environnement effectif et pratiques effectives (codes) ;
- espèce, variété, méthode ;
- jours de l'année des étapes réelles (pas de dates complètes, ni d'année au-delà de l'année culturale) ;
- `success_pct`, `rating`, `quality`, `yield_kg_m2`, codes des problèmes ;
- année.

Elle ne contient **aucun** identifiant d'utilisateur, nom de zone, texte libre ni photo. L'environnement effectif est celui de la zone, de son ancêtre le plus proche qui en déclare un, sinon le premier du jardin ; les pratiques sont celles déclarées au niveau du jardin. Les jardins supprimés, les cultures supprimées, les bilans sous 60 % et les variétés non validées en sont exclus.

**Seuil de k-anonymat** : aucune statistique n'est affichée si elle repose sur moins de 5 jardins distincts. C'est le même seuil que le démarrage à froid du moteur. Il s'applique aussi aux résultats communautaires des fiches espèces.

### 11.4 Export et suppression

- **Export** (`/app/parametres/confidentialite`) : job asynchrone qui produit une archive ZIP. Elle contient un JSON du profil, des adhésions, des contenus rédigés, des cultures, du journal, des récoltes et des bilans des jardins dont l'utilisateur est owner ou auteur, du journal d'XP et des consentements, plus les photos qu'il a téléversées. L'utilisateur reçoit un lien par e-mail, valable 7 jours et utilisable seulement par lui, connecté. Une demande au plus par 24 heures.
- **Suppression du compte** :
  1. Si l'utilisateur est owner d'un jardin qui a d'autres membres actifs, il doit transférer la propriété. Sinon, elle est transférée automatiquement à l'admin le plus ancien ; à défaut d'admin, au membre le plus ancien après confirmation ; un jardin sans autre membre est supprimé. Ces transferts et suppressions ont lieu **à la purge** (J+30), pour que le rétablissement rende le compte à l'identique (PRV-09).
  2. Le compte est désactivé immédiatement (sessions révoquées), avec un délai de grâce de 30 jours pendant lequel il peut être rétabli par un lien envoyé par e-mail.
  3. À J+30, purge : e-mail, nom, avatar, profil, préférences, consentements (une preuve minimale est conservée : hash de l'ID, type et date), photos téléversées, tips, votes. Les contributions aux **jardins partagés** (cultures, tickets, commentaires, journal) sont **conservées mais anonymisées**, avec l'auteur affiché « Jardinier·e supprimé·e » (suivi d'un suffixe court, le pseudo restant unique). Les consentements restent rattachés au compte anonymisé, comme preuve minimale. Les guides publics sont supprimés par défaut ; l'utilisateur peut choisir de les laisser sous forme anonyme (§17 Q-11).
- Les e-mails d'invitation non acceptées sont purgés 30 jours après expiration.

---

## 12. Critères d'acceptation

Format : **Étant donné** (contexte) · **Quand** (action) · **Alors** (résultat attendu).

Colonne « Test » : **U** = Vitest unitaire (fonction pure), **I** = Vitest intégration (services avec PostgreSQL réel), **E** = Playwright e2e. ★ = parcours e2e explicitement exigé par le cahier des charges.

Chaque ID doit apparaître dans le titre d'au moins un test, par exemple `it('[TCK-04] …')` (§13.3).

### 12.1 Lot 1 — Socle

#### Authentification

| ID | Étant donné | Quand | Alors | Test |
|---|---|---|---|---|
| AUTH-01 | un visiteur sur `/inscription` | il soumet un e-mail, un mot de passe valide, un pseudo libre et accepte les CGU | le compte est créé, un consentement `terms` est tracé, un e-mail de vérification arrive dans Mailpit et l'utilisateur est redirigé vers `/bienvenue` | E |
| AUTH-02 | un visiteur | il soumet un pseudo déjà pris (casse différente) ou un mot de passe de moins de 12 caractères | une erreur de champ s'affiche et aucun compte n'est créé | I |
| AUTH-03 | un utilisateur à l'e-mail non vérifié | il tente de créer un jardin | l'action renvoie `FORBIDDEN` et l'UI invite à vérifier l'e-mail, avec renvoi du lien | I |
| AUTH-04 | un utilisateur qui a reçu le lien de vérification | il ouvre le lien | `email_verified = true` ; un second usage du lien affiche « lien déjà utilisé » | E |
| AUTH-05 | un e-mail inconnu ou un mauvais mot de passe | on tente de se connecter | le même message générique s'affiche dans les deux cas | I |
| AUTH-06 | 5 échecs de connexion en 15 minutes sur un e-mail | une 6e tentative a lieu | elle est refusée avec `RATE_LIMITED` | I |
| AUTH-07 | un utilisateur a demandé une réinitialisation | il utilise le lien dans l'heure et choisit un nouveau mot de passe | il est connecté, ses autres sessions sont révoquées, et le lien ne fonctionne plus | E |
| AUTH-08 | un lien de réinitialisation de plus d'une heure | on l'ouvre | « lien expiré » s'affiche, avec la possibilité de redemander un lien | I |
| AUTH-09 | un visiteur non connecté | il ouvre `/app/jardins` | il est redirigé vers `/connexion?next=/app/jardins`, puis ramené à cette page après connexion | E |

#### Jardins

| ID | Étant donné | Quand | Alors | Test |
|---|---|---|---|---|
| GRD-01 ★ | un utilisateur vérifié | il crée un jardin avec un nom, un type, un environnement et une localisation | le jardin existe, l'utilisateur en est `owner`, la saison de l'année en cours est `active` et l'événement `garden.created` est enregistré | E |
| GRD-02 | une création de jardin sans environnement | on la soumet | `VALIDATION` sur le champ environnement | I |
| GRD-03 | un jardin avec une localisation précise | un `member` consulte les paramètres, ou un autre utilisateur consulte un tip de ce jardin | seul le geohash4 est visible ; `lat` et `lng` sont absents du HTML et des réponses | I |
| GRD-04 | un jardin | l'owner ou un admin modifie le contexte (sol, pH, exposition, Köppen) | les valeurs sont enregistrées et la zone effective des zones sans valeur propre en tient compte | I |
| GRD-05 | un jardin archivé | un admin tente de créer une culture ou un ticket | `FORBIDDEN` (jardin en lecture seule) ; aucun rappel ni occurrence n'est généré | I |
| GRD-06 | un owner | il supprime le jardin en saisissant son nom | le jardin disparaît des listes, les membres reçoivent un e-mail, et une purge est planifiée à J+30 | I |
| GRD-07 | une pratique déclarée au niveau du jardin et exclue sur une zone | on calcule les pratiques effectives de cette zone et de ses enfants | la pratique est absente pour cette zone et ses descendants, et présente ailleurs | U |
| GRD-08 | une pratique déclarée pour la saison 2025 seulement | on calcule les pratiques effectives en 2026 | la pratique est absente | U |

#### Zones

| ID | Étant donné | Quand | Alors | Test |
|---|---|---|---|---|
| ZON-01 ★ | un jardin | l'owner crée « Potager » (parcelle), puis « Planche 1 » (planche) dans Potager, puis « Rang A » (rang) dans Planche 1 | l'arbre à trois niveaux s'affiche dans `/zones` avec les bons `depth` et `path` | E |
| ZON-02 | une zone A avec un descendant B | on tente de déplacer A sous B | `VALIDATION` (cycle) | I |
| ZON-03 | une zone de profondeur 8 | on tente de lui ajouter un enfant | `VALIDATION` (profondeur maximale) | I |
| ZON-04 | une zone du jardin X | on tente de la donner comme parent d'une zone du jardin Y | `NOT_FOUND`, et la FK composite empêche aussi l'insertion directe en base | I |
| ZON-05 | une zone sans environnement propre, dont le parent est en `greenhouse` | on lit sa zone effective | environnement = `greenhouse` | U |
| ZON-06 | une zone avec une géométrie de 250 × 120 cm | on lit sa surface | 3,00 m², source « plan » | U |
| ZON-07 | un admin | il crée le type personnalisé « Butte lasagne » et l'utilise | le type est proposé dans ce jardin uniquement | I |
| ZON-08 | une zone qui a des cultures passées et un enfant | on l'archive | la zone et son enfant sont archivés, l'historique reste consultable avec le filtre « archivées », et elles disparaissent du plan | I |
| ZON-11 | deux zones sœurs avec une géométrie | on redimensionne l'une pour qu'elle chevauche l'autre | `VALIDATION` | U |

#### Membres, invitations, groupes

| ID | Étant donné | Quand | Alors | Test |
|---|---|---|---|---|
| INV-01 ★ | un admin de jardin | il invite `nouveau@test.local` comme `member` | un e-mail arrive dans Mailpit (destinataire, nom du jardin, lien `/invitation/<token>`) et l'invitation est listée « en attente » | E |
| INV-02 ★ | l'e-mail d'INV-01, pour une personne sans compte | elle ouvre le lien, s'inscrit (e-mail pré-rempli et verrouillé) et accepte | elle est `member` active, son e-mail est vérifié, et le jardin apparaît dans `/app/jardins` | E |
| INV-03 | un utilisateur connecté avec un autre e-mail que celui de l'invitation | il ouvre le lien | le message « destinée à une autre adresse » s'affiche et aucune adhésion n'est créée | I |
| INV-04 | une invitation de plus de 7 jours, ou révoquée, ou déjà acceptée | on ouvre son lien | la page indique l'invitation invalide, sans afficher de données du jardin | I |
| INV-05 | une invitation en attente | l'admin réinvite le même e-mail | l'ancienne est révoquée et un nouvel e-mail est envoyé | I |
| INV-06 | un membre actif | on l'invite à nouveau | `CONFLICT` | I |
| INV-07 | un admin | il tente d'inviter quelqu'un comme `admin` | `FORBIDDEN` ; seul l'owner peut inviter un admin | I |
| INV-08 | une invitation avec les groupes [Équipe serre] | elle est acceptée | le nouveau membre fait partie d'Équipe serre | I |
| MBR-01 | un membre qui a des contributions et un ticket ouvert qui lui est assigné directement | il quitte le jardin | `left_at` est renseigné, ses contributions restent avec « (ancien membre) », son assignation est retirée et les admins reçoivent une notification (par e-mail au lot 1, aussi in-app à partir du lot 3) | I |
| MBR-02 | l'owner | il tente de quitter le jardin | `FORBIDDEN`, avec le message « transfère d'abord la propriété » | I |
| MBR-03 | l'owner et un admin | l'owner transfère la propriété à l'admin | l'admin devient `owner`, l'ancien owner devient `admin`, et il n'y a toujours qu'un seul owner actif | I |
| MBR-04 | un admin | il tente de retirer un autre admin ou de changer son rôle | `FORBIDDEN` | I |
| MBR-05 | un ancien membre | il accepte une nouvelle invitation | une nouvelle adhésion est créée et l'ancienne reste dans l'historique | I |
| MBR-06 | un utilisateur membre de trois jardins avec des rôles différents | il ouvre `/app/jardins` | les trois jardins sont listés avec son rôle dans chacun | E |
| GRP-01 | un admin | il crée le groupe « Équipe serre » et y ajoute deux membres | le groupe est listé avec ses membres dans `/membres` | E |
| GRP-02 | un groupe | on tente d'y ajouter un utilisateur qui n'est pas membre actif du jardin | `VALIDATION` | I |
| GRP-03 | un groupe assigné à deux tickets ouverts | on archive le groupe | les assignations sont retirées et les créateurs des tickets sont notifiés | I |

#### Autorisation

| ID | Étant donné | Quand | Alors | Test |
|---|---|---|---|---|
| AUTHZ-01 ★ | un utilisateur non membre du jardin J | il ouvre `/app/jardins/J` ou `/app/jardins/J/cultures` | la page 403 s'affiche sans le nom ni aucune donnée de J | E |
| AUTHZ-02 | un utilisateur non membre de J | il appelle directement chaque Server Action en passant `gardenId = J` | chaque action renvoie `FORBIDDEN` et aucune ligne n'est modifiée (un test par action, généré à partir du registre des actions) | I |
| AUTHZ-03 | un membre de J1 et de J2 | il appelle `updateCulture({ gardenId: J1, cultureId: <culture de J2> })` | `NOT_FOUND`, et la culture de J2 n'est pas modifiée | I |
| AUTHZ-04 | la matrice §5.2 | on exécute chaque permission pour chaque rôle | le résultat correspond exactement à la matrice (test paramétré, une ligne par case) | U |
| AUTHZ-05 | une zone restreinte au groupe G en `contribute` | un `member` hors de G tente d'y créer une culture | `FORBIDDEN` ; il peut lire et commenter | I |
| AUTHZ-06 | une zone restreinte au groupe G en `contribute`, avec une sous-zone sans restriction propre | un membre de G crée une culture dans la sous-zone | succès (restriction héritée et satisfaite) | I |
| AUTHZ-07 | un observateur | il tente de terminer un ticket, de créer une entrée de journal ou de voter dans le jardin | `FORBIDDEN` pour chaque action ; l'UI ne propose pas ces actions | I |
| AUTHZ-09 | un `moderator` plateforme non membre de J | il tente de lire une culture de J | `FORBIDDEN` | I |
| AUTHZ-10 | un jardin `collective` avec `plan_edit_min_role = admin` | un `member` tente de créer une zone | `FORBIDDEN` ; un admin réussit | I |

### 12.2 Lot 2 — Cultures

Les critères ZON-09, ZON-10 et AUTHZ-08, rédigés avec le lot 1, dépendent des cultures et des photos : ils sont testés au lot 2. Les parties « tickets » de CUL-07 (tickets ouverts annulés) et de ZON-10 (ticket créé sur un composteur) sont vérifiées au lot 3, avec JRN-05, déplacé en 12.3.

| ID | Étant donné | Quand | Alors | Test |
|---|---|---|---|---|
| ZON-09 | une zone qui a une culture `active` | on demande son archivage | une confirmation propose de terminer la culture ; sans confirmation, rien ne change | E |
| ZON-10 | une zone de type composteur | on tente d'y créer une culture | `VALIDATION` ; un ticket peut en revanche y être créé | I |
| AUTHZ-08 | une photo d'un jardin privé | un non-membre ouvre `/api/files/<id>` | 404 | I |
| PLT-01 | le référentiel seedé | on cherche « tomatte » ou « cœur de boeuf » | la tomate et la variété Cœur de bœuf apparaissent en tête | I |
| PLT-02 | un utilisateur vérifié | il propose la variété « Tomate de Marmande locale » | elle est `pending`, utilisable dans son jardin avec la mention « en attente », absente du référentiel public et visible dans `/admin/varietes` | E |
| PLT-03 | une variété `pending` utilisée dans 2 cultures | un modérateur la fusionne avec une variété existante | les 2 cultures pointent vers la cible et la variété est `merged` | I |
| PLT-04 | une variété `rejected` | un utilisateur d'un autre jardin cherche dans le référentiel | elle est introuvable | I |
| PLT-05 | les associations tomate ↔ basilic (favorable) | on lit les associations du basilic | la tomate est listée (symétrie) | U |
| SEA-01 | un jardin à `season_start_month = 7` | on crée une culture semée le 10/08/2026 | elle est rattachée à la saison 2026 (01/07/2026 – 30/06/2027) | U |
| SEA-02 | une saison `closed` | on tente de modifier une étape d'une de ses cultures | `FORBIDDEN` ; saisir le bilan reste possible | I |
| CUL-01 | une planche | un membre crée une culture Tomate Cœur de bœuf en `tray_sowing` avec un semis prévu le 15/03 | la culture est `planned`, les étapes pertinentes sont créées (semis, levée, repiquage, plantation, floraison, fructification, récolte, fin) et `culture.created` est émis | I |
| CUL-02 | une culture `planned` | on renseigne la date réelle de semis | la culture passe `active` et `culture.stage_recorded` est émis | I |
| CUL-03 | une étape | on saisit une date réelle à J+2 | `VALIDATION` (date future) | I |
| CUL-04 | une levée réelle antérieure au semis réel | on l'enregistre | l'enregistrement réussit, avec un avertissement d'incohérence | I |
| CUL-05 | une culture en `bought_plants` | on la crée | il n'y a pas d'étapes de semis ni de levée ; la première étape est la plantation | U |
| CUL-06 | une culture de 12 plants sans surface, espèce espacée de 50 × 70 cm | on lit sa surface | 4,2 m², source « espacement » | U |
| CUL-07 | une culture ayant tickets, journal et récoltes | son auteur la supprime | elle est masquée, ses tickets ouverts sont `cancelled`, et un admin peut la restaurer dans les 30 jours | I |
| CUL-08 | une culture semée en pépinière (zone Plaque A) | on renseigne le repiquage vers la Planche 3 | la culture change de zone, une entrée `intervention` trace le déplacement, et l'occupation de la Planche 3 commence au repiquage | I |
| CUL-09 | un ail planté le 05/11/2025 et récolté le 10/07/2026 | on consulte l'historique de la zone pour la saison 2026 | l'ail apparaît (recouvrement), rattaché à la saison 2025 | I |
| CUL-10 | une culture avec `seed_source = own_saved` | on choisit une culture d'origine d'une autre espèce, ou sans récolte `seed_saving` | `VALIDATION` | I |
| JRN-01 | une culture | un membre ajoute une observation texte et 2 photos depuis la saisie rapide | l'entrée apparaît dans le journal et les photos téléversées ont au plus 1600 px, sans EXIF | E |
| JRN-02 | une photo JPEG contenant des coordonnées GPS en EXIF | elle passe par la compression client | le fichier envoyé ne contient plus d'EXIF | U |
| JRN-03 | un fichier `.exe` renommé en `.jpg` | on le téléverse | il est refusé (contrôle des octets d'en-tête) | I |
| JRN-04 | une entrée `pest` sans problème du catalogue | on la soumet | `VALIDATION` | I |
| JRN-06 | une récolte de 12 `unit` de courgette (300 g par unité au référentiel) | on l'enregistre | `quantity_kg = 3,6` | U |
| JRN-07 | une récolte de 3 `bunch` d'une espèce sans poids unitaire | on l'enregistre | `quantity_kg = null` ; elle est comptée dans les récoltes mais pas dans le rendement au m² | U |
| JRN-08 | la saisie rapide d'une récolte depuis la fiche culture | l'utilisateur ouvre la saisie | au plus 2 taps et 3 champs obligatoires (quantité, unité, date pré-remplie) | E |
| ROT-01 | une planche portant des tomates en 2025 | on y planifie des aubergines en 2026 | avertissement « Solanacées cultivées ici en 2025… retour conseillé à partir de 2029 » ; la création reste possible | I |
| ROT-02 | des tomates en 2025 sur la parcelle parente (et non sur la planche) | on planifie des pommes de terre sur la planche en 2026 | avertissement (ancêtre) | I |
| ROT-03 | des tomates en 2022 sur la planche | on y planifie des tomates en 2026 (délai de 4 ans) | aucun avertissement | U |
| ROT-04 | l'avertissement ROT-01 | l'utilisateur confirme quand même | `rotation_override = true` est enregistré sur la culture | I |
| ROT-05 | une planche voisine (bord partagé) avec des haricots actifs | on planifie des oignons | avertissement d'association défavorable | I |
| ROT-06 | 5 saisons d'historique | on ouvre `/saisons` | la frise par zone affiche les familles et met en évidence les retours trop précoces | E |

### 12.3 Lot 3 — Ticketing

| ID | Étant donné | Quand | Alors | Test |
|---|---|---|---|---|
| JRN-05 | une culture avec un ticket « Arroser » échu, rattaché à sa zone parente | on touche « Arroser » sur la culture | une entrée `watering` est créée et le ticket est terminé | I |
| TCK-01 ★ | un jardin collectif avec le groupe « Équipe serre » (2 membres) | un admin crée un ticket `task` sur la zone Serre et l'assigne au groupe | le ticket apparaît dans « mes tâches » des 2 membres, un e-mail d'assignation est reçu par chacun dans Mailpit, et le ticket est listé avec le niveau « zone » | E |
| TCK-02 | un ticket | on tente de le rattacher à la fois à une zone et à une culture | `VALIDATION`, et la contrainte `CHECK` le refuse aussi en base | I |
| TCK-03 | un ticket rattaché à une culture | on filtre la liste par la zone parente « avec sous-zones » | le ticket apparaît | I |
| TCK-04 | un ticket assigné à un groupe | un membre du groupe le termine | il est `done` pour tous et `completed_by` est ce membre | I |
| TCK-05 | un membre ajouté au groupe après l'assignation | il ouvre « mes tâches du jour » | les tickets ouverts du groupe y figurent | I |
| TCK-06 | un ticket `done` | on le rouvre | `todo`, `completed_at` est vide, `first_completed_at` est conservé, et un `ticket_event` est créé | I |
| TCK-07 | un ticket `todo` | on tente de le passer en `skipped` à la main | `VALIDATION` | U |
| TCK-08 | des tickets en retard, du jour et à venir, assignés directement ou via un groupe | on ouvre « mes tâches du jour » | seuls les tickets échus aujourd'hui ou avant, et visibles, apparaissent, triés retard puis priorité puis échéance, et groupés par jardin | E |
| TCK-09 | la vue tickets | on passe en kanban, qu'on filtre par groupe et qu'on recharge la page | la vue et les filtres sont conservés (URL) | E |
| TCK-10 | le kanban | on glisse un ticket de `todo` vers `done` | la transition est enregistrée ; si elle est interdite, la carte revient à sa place avec un message | E |
| TCK-11 | le calendrier mensuel | une série a des occurrences au-delà de l'horizon de 14 jours | des occurrences virtuelles s'affichent (non cliquables pour modification) | I |
| TCK-12 | une checklist de 3 éléments | un membre coche 2 éléments | la progression « 2/3 » s'affiche dans la liste | I |
| TCK-13 | un commentaire contenant `@marie` (membre) et `@inconnu` | on le publie | Marie reçoit une notification `mentioned`, et `@inconnu` reste du texte | I |
| TCK-14 | une culture avec un repiquage prévu dans 3 jours | la culture est créée | un ticket « Repiquer : … » existe, `due_on` = date prévue, il est visible aujourd'hui et assigné au créateur | I |
| TCK-15 | le ticket de TCK-14 | la date prévue est décalée de 5 jours | l'échéance et `visible_from` suivent | I |
| TCK-16 | le ticket de TCK-14 | on le termine | l'UI propose de renseigner la date réelle de repiquage à aujourd'hui ; si l'utilisateur accepte, l'étape est enregistrée | E |
| TCK-17 | un ticket d'étape ouvert | on renseigne directement la date réelle de l'étape | le ticket est terminé automatiquement | I |
| TCK-18 | un ticket avec `visible_from` dans 10 jours | on ouvre la liste par défaut | il est absent ; il est présent avec le filtre « à venir » et dans le calendrier | I |
| TCK-19 | deux photos téléversées par un membre | il crée un ticket ponctuel avec ces photos | elles sont rattachées au ticket et affichées sur sa fiche ; une photo déjà rattachée, téléversée par quelqu'un d'autre, ou jointe à une série est refusée (`VALIDATION`) | I |
| RCR-01 | la série `FREQ=DAILY;INTERVAL=2;BYMONTH=7` qui démarre le 01/07 | le job s'exécute le 01/07 | les occurrences 01, 03, 05, 07, 09, 11, 13 et 15/07 existent, et aucune en juin ni en août | U |
| RCR-02 | le job exécuté deux fois | on compte les occurrences | aucune occurrence n'est en double (unicité `(series_id, occurrence_on)`) | I |
| RCR-03 | une série avec `skip_missed`, dont l'occurrence du 03/07 n'est pas terminée | l'occurrence du 05/07 devient échue | l'occurrence du 03/07 passe `skipped`, sans notification `overdue` | I |
| RCR-04 | une série | on modifie le titre pour « cette occurrence et les suivantes » | les occurrences futures non terminées prennent le nouveau titre ; les passées et les terminées ne changent pas | I |
| RCR-05 | une série | on modifie « cette occurrence seulement » | le ticket est détaché (`series_id` conservé en historique, plus régénéré) | I |
| RCR-06 | une règle RRULE hors du sous-ensemble autorisé (`FREQ=HOURLY`) | on la soumet | `VALIDATION` | U |
| NTF-01 | un ticket échu demain, assigné à Paul (e-mail `due_soon` activé) | le job passe à 8 h, heure du jardin | Paul reçoit un e-mail, une seule fois | I |
| NTF-02 | Paul a désactivé l'e-mail `assigned` | on lui assigne un ticket | notification in-app seulement, aucun e-mail | I |
| NTF-03 | Paul s'assigne lui-même un ticket | — | aucune notification | I |
| NTF-04 | un e-mail de notification | on ouvre le lien de désinscription sans être connecté, puis on confirme | l'ouverture seule ne change rien ; après confirmation, la préférence de ce type est désactivée et un message le confirme ; un jeton altéré est refusé | E |
| NTF-05 | un succès obtenu | — | une notification in-app est créée, aucun e-mail n'est envoyé, quelles que soient les préférences | I |
| NTF-06 | 4 commentaires sur le même ticket en 5 minutes | les notifications `commented` sont émises | une seule notification groupée est créée | I |
| NTF-07 | le centre de notifications | on clique sur « tout marquer comme lu » | le compteur passe à 0 | E |

### 12.4 Lot 4 — Guides et tips

| ID | Étant donné | Quand | Alors | Test |
|---|---|---|---|---|
| GUI-01 | un utilisateur | il rédige un guide sur la tomate en Markdown et le publie en `public` | la version 1 est créée, le guide est visible sur `/guides-publics/<slug>` sans compte, et le HTML est assaini (un `<script>` dans le Markdown n'est pas exécuté) | E |
| GUI-02 | un guide publié en v1 | l'auteur modifie le brouillon puis publie | la v2 est créée, la v1 est inchangée, et la comparaison v1/v2 affiche le diff | I |
| GUI-03 | une `guide_version` | on tente un `UPDATE` en base | le trigger le refuse | I |
| GUI-04 | un guide `private` au jardin J | un non-membre de J l'ouvre par son ID | 404 | I |
| GUI-05 | un guide `unlisted` | on fait une recherche ou on liste les guides publics | il est absent ; il reste accessible par son lien | I |
| GUI-06 | un guide public d'Alice | Bob le forke | Bob a un brouillon copié de la version courante, le fork affiche « adapté de … (v n) », et le compteur de forks de l'original augmente quand Bob publie | E |
| GUI-07 | un guide privé au jardin J | un membre de J le forke | le fork est forcément privé à J | I |
| GUI-08 | un guide avec un calendrier type (ancre : semis ; repiquage à +45 j ; tâche « tuteurer » à 7 j après plantation) | on l'applique à une culture avec un semis prévu le 01/03 | les dates prévues sont calculées, les tickets de guide sont créés avec les bonnes échéances, et `applied_guide_version_id` est enregistré | E |
| GUI-09 | une culture dont la plantation prévue est déjà renseignée | on applique un guide | l'UI demande s'il faut écraser cette date ; les dates réelles ne sont jamais modifiées | I |
| GUI-10 | une culture à laquelle la v1 a été appliquée | on applique la v2 | les tickets de guide non terminés de la v1 sont annulés et ceux de la v2 sont créés | I |
| TIP-01 | un utilisateur dans son jardin | il publie un tip de 120 caractères avec 2 tags | le tip a le geohash4 et le Köppen du jardin et apparaît dans le fil | E |
| TIP-02 | un tip de 501 caractères ou sans tag | on le soumet | `VALIDATION` | U |
| TIP-03 | un tip d'Alice | Alice tente de voter pour lui | `FORBIDDEN` | I |
| TIP-04 | un tip | Bob vote « utile », puis « pas utile » | un seul vote est compté, de valeur −1 | I |
| TIP-05 | des tips de contextes variés | on ouvre le fil depuis un jardin Cfb | à score de Wilson égal, les tips au contexte proche sont classés devant | U |
| MOD-01 | un tip | 3 utilisateurs distincts le signalent | il est masqué, l'auteur est notifié, et le signalement apparaît dans `/admin/signalements` | I |
| MOD-02 | un tip masqué | un modérateur rejette les signalements (`dismissed`) | le tip est réaffiché | I |
| MOD-03 | un utilisateur `user` | il ouvre `/admin` | 403 | E |

### 12.5 Lot 5 — Bilans et recommandations

| ID | Étant donné | Quand | Alors | Test |
|---|---|---|---|---|
| RES-01 ★ | une culture terminée avec 3 récoltes (4,2 kg en tout), sur 3 m² | l'utilisateur ouvre le bilan, garde le total pré-rempli, met 4 étoiles en qualité, 80 % de réussite, coche « mildiou », note 4 et « je recommencerais : oui » | le bilan est enregistré avec une complétude de 100 % et un rendement de 1,4 kg/m², et `result.submitted` est émis | E |
| RES-02 | des entrées de journal `disease` (mildiou) | on ouvre le bilan | « mildiou » est pré-coché | I |
| RES-03 | un bilan sans taux de réussite ni note | on calcule la complétude | 60 % | U |
| RES-04 | une culture sans surface connue | on enregistre le bilan | `yield_kg_m2 = null`, avec une invitation à renseigner la surface | U |
| RES-05 | un deuxième bilan pour la même culture et la même saison | on le soumet | c'est une mise à jour (`result.updated`), pas un doublon | I |
| PRV-01 | un jardin sans partage | son owner termine des bilans | `shared_result_fact` ne contient aucune ligne de ce jardin après rafraîchissement | I |
| PRV-02 | un owner | il active le partage après avoir lu le texte de consentement | un `consent share_results` est créé avec sa version, et les bilans éligibles apparaissent dans la vue après rafraîchissement | I |
| PRV-03 | un admin (non owner) | il tente d'activer le partage | `FORBIDDEN` | I |
| PRV-04 | le partage actif | l'owner le révoque | après rafraîchissement, aucune ligne du jardin ne subsiste dans la vue | I |
| PRV-05 | la vue `shared_result_fact` | on inspecte ses colonnes | aucune colonne `user_id`, `garden_id`, `lat`, `lng`, nom ni texte libre (test de schéma) | I |
| PRV-06 | des résultats communautaires sur une espèce provenant de 4 jardins | on ouvre la fiche espèce | aucun agrégat n'est affiché (k < 5) | I |
| RCO-01 | deux contextes identiques, puis Cfb contre Dfb, puis plein air contre hydroponie | on calcule la distance | 0 ; une valeur conforme aux poids §7.2 ; exclusion (filtre dur) | U |
| RCO-02 | 3 faits d'un même jardin et 1 fait de 4 autres jardins | on calcule le score | au plus 3 faits par jardin ; n = 5 jardins ; confiance `low` | U |
| RCO-03 | 20 jardins similaires, réussite moyenne 78 %, rendement médian de 2,1 kg/m² | on calcule le score | le lissage bayésien est appliqué (k = 5), la confiance est `high`, et l'explication contient `gardensCount = 20`, `meanSuccessPct = 78`, `medianYieldKgM2 = 2,1` | U |
| RCO-04 ★ | le seed (contexte Cfb, plein air, suffisamment de faits) | un utilisateur ouvre `/recommandations` pour la Planche 1 au printemps | au moins une variété est proposée avec un texte du type « N jardins à contexte proche, réussite moyenne X %, rendement médian Y kg/m² » et un indice de confiance visible | E |
| RCO-05 | une espèce avec 3 jardins similaires seulement | on demande une recommandation | `confidence = cold_start`, bandeau « Pas encore assez de résultats… (3 sur les 5 nécessaires) », suggestion fondée sur le référentiel ou un guide | I |
| RCO-06 | des faits de semis à des jours variés, avec leurs poids | on calcule la fenêtre ajustée | P20, médiane et P80 pondérés exacts ; décalage affiché par rapport à la référence | U |
| RCO-07 | des faits de l'hémisphère sud | on calcule la fenêtre pour un jardin de l'hémisphère nord | ils sont exclus (latitude opposée, distance de latitude = 1) | U |
| RCO-08 | une zone avec un conflit de rotation pour la tomate | on demande des recommandations | la tomate a l'avertissement `rotation` et son score est multiplié par 0,7 | U |
| RCO-09 | les bilans du jardin courant | on calcule la recommandation | ils sont absents du score communautaire et présents dans `ownHistory` | U |
| RCO-10 | l'interface `RecommendationEngine` | une implémentation factice est injectée | l'UI `/recommandations` fonctionne sans modification (test de contrat) | I |

### 12.6 Lot 6 — Progression

| ID | Étant donné | Quand | Alors | Test |
|---|---|---|---|---|
| XP-01 | chaque ligne du barème §8.2 | on applique `score()` à l'événement correspondant | le montant, le code et les compétences sont conformes (test paramétré, une ligne par code) | U |
| XP-02 ★ | une culture active | l'utilisateur saisit une récolte de 2 kg | la réponse affiche « +8 XP », le compteur d'XP du profil et `/app/profil/xp` montrent la ligne `harvest.recorded` | E |
| XP-03 | 10 récoltes déjà saisies aujourd'hui (fuseau de l'utilisateur) | il saisit la 11e | une ligne à `amount = 0`, `reason = cap_reached` est ajoutée et le total ne change pas | U |
| XP-04 | un plafond atteint à 23 h 50, heure locale | une récolte est saisie à 0 h 05 le lendemain | elle rapporte à nouveau 8 XP (nouveau jour local) | U |
| XP-05 | une entrée de journal avec photo ayant rapporté 5 + 3 XP | on la supprime | deux lignes `reversal` (−5 et −3) sont ajoutées et le total revient à son niveau antérieur | U |
| XP-06 | l'entrée de XP-05 restaurée | — | aucun nouveau gain (clé d'idempotence consommée) | U |
| XP-07 | un ticket terminé (+5) | il est rouvert puis refermé, éventuellement par une autre personne | aucun nouveau gain, ni pour l'une ni pour l'autre | U |
| XP-08 | 16 occurrences récurrentes terminées dans la journée | on calcule l'XP | 15 rapportent 5 XP, la 16e est `cap_reached` | U |
| XP-09 | un tip d'Alice | Bob (compte de plus de 7 jours, e-mail vérifié, sans jardin commun) vote « utile » | Alice gagne 2 XP ; si Bob retire son vote, un `reversal` de −2 est ajouté | U |
| XP-10 | un tip d'Alice | 8 membres de son jardin votent « utile » | le score affiché compte 8 votes, mais l'XP n'en compte que 5 (10 XP) | U |
| XP-11 | un bilan à 60 % (+15) | il est complété à 100 % plus tard | +25 (complément jusqu'à 40) et jamais plus de 40 par culture et par saison ; +10 si la culture a au moins 3 observations à des jours différents | U |
| XP-12 | une observation antidatée de 10 jours | on calcule le plafond | l'observation compte dans le plafond du jour de saisie | U |
| XP-13 | 35 événements générateurs d'XP en 10 minutes | on calcule l'XP | à partir du 31e, `amount = 0` jusqu'à la fin de la fenêtre, et un signalement apparaît dans `/admin/xp` | U |
| XP-14 | un historique d'événements des lots 1 à 5 sans XP | on exécute `xp:recompute` | le journal est reconstruit, le rapport d'écarts est produit, et un second recalcul donne un écart nul (idempotence) | I |
| XP-15 | le journal d'XP | on tente un `UPDATE` ou un `DELETE` en base | le trigger le refuse | I |
| XP-16 | un utilisateur | il crée un jardin, une zone, un ticket, commente ou change son avatar | aucun gain d'XP | U |
| LVL-01 | les totaux 0, 99, 100, 299, 300, 4 500 | on calcule le niveau | 1, 1, 2, 2, 3, 10 | U |
| LVL-02 | un utilisateur de niveau 5 dont un recalcul réduit l'XP à un niveau 4 | on lit son niveau affiché | 5 (maximum historique) | U |
| LVL-03 | une récolte de tomate en serre | on calcule les compétences | `vegetable` et `greenhouse` augmentent chacune de 8 ; le total augmente de 8, pas de 16 | U |
| ACH-01 | aucune récolte | l'utilisateur saisit sa première récolte | le succès `first_harvest` est obtenu, avec une notification in-app | I |
| ACH-02 | une culture `own_saved` dont la culture d'origine a une récolte `seed_saving` | on renseigne sa levée réelle | `seed_saver` est obtenu | I |
| ACH-03 | une zone avec 3 saisons consécutives de cultures annuelles, dont une avec `rotation_override` | on évalue `rotation_3_years` | non obtenu ; il est obtenu avec 3 saisons sans override | U |
| ACH-04 | un succès obtenu | la culture qui l'a déclenché est supprimée | le succès est conservé | I |
| ACH-05 | la page `/app/profil/succes` | on l'ouvre | les succès obtenus sont datés ; les verrouillés affichent leur condition et leur avancement (« 7 / 10 ») | E |
| QST-01 | 5 tickets du jour assignés à l'utilisateur, dont 2 en retard | les quêtes quotidiennes sont générées | 3 quêtes, en commençant par les 2 en retard | U |
| QST-02 | une quête quotidienne liée à un ticket | le ticket est terminé depuis la vue classique | la quête est `done` et rapporte +5 XP | I |
| QST-03 | une quête non terminée | sa période se termine | elle passe `expired` et n'apparaît nulle part comme échec | I |
| QST-04 | un jardin de l'hémisphère sud en mars | les quêtes saisonnières sont générées | les modèles d'automne s'appliquent | U |
| QST-05 | aucun ticket ni aucune étape à venir | les quêtes sont générées | aucune quête quotidienne ni hebdomadaire (pas de quête artificielle) | U |
| COL-01 | un jardin collectif | on ouvre le tableau des contributions | il est trié par ordre alphabétique, sans rang | E |
| COL-02 | un admin active le classement | un membre a choisi de s'en exclure | l'onglet « Classement » apparaît, sans ce membre | I |
| COL-03 | un objectif « 30 tickets terminés en juin » pour Équipe serre | les membres du groupe terminent 12 tickets | la progression affiche 12 / 30 | I |

### 12.7 Lot 7 — Vue jardin gamifiée

| ID | Étant donné | Quand | Alors | Test |
|---|---|---|---|---|
| MAP-01 | une page jardin | on la charge en vue classique | aucun bundle PixiJS n'est téléchargé (vérifié dans les requêtes réseau) | E |
| MAP-02 | le jardin familial du seed | on ouvre la vue jardin | chaque zone avec géométrie et chaque culture active a un bouton DOM `data-testid` correspondant dans la couche accessible | E |
| MAP-03 | une culture en vue jardin | on touche son bouton `culture-<id>` | la feuille de la culture s'ouvre avec son étape, ses états et les actions rapides | E |
| MAP-04 | une culture avec un ticket d'arrosage en retard | on charge l'instantané | `data-state` contient `thirsty` | I |
| MAP-05 | une culture avec un semis réel le 01/04, une levée prévue le 10/04 et une plantation prévue le 15/05, au 20/04 | on calcule `visualPhase` | `sprout`, progression ≈ 0,29 (10 jours sur 35) | U |
| MAP-06 | une culture dont la levée prévue est dépassée de 8 jours sans date réelle | on calcule `visualPhase` | `sprout` (bascule d'une seule phase), drapeau `needsConfirmation` | U |
| MAP-07 | une `sprite_key` de variété absente du manifeste | on résout la frame | la clé de l'espèce est utilisée, puis la famille, puis `unknown_plant` ; aucune exception | U |
| MAP-08 | aucune interaction et aucune animation active | 5 secondes s'écoulent | aucun rendu n'est déclenché (compteur de rendus constant) | I (test du moteur avec un renderer factice) |
| MAP-09 | `prefers-reduced-motion: reduce` ou l'option « animations réduites » | on ouvre la vue | le ticker reste arrêté, sans animation ambiante, et les transitions de scène sont instantanées | E |
| MAP-10 | une zone serre `has_interior` | on touche « Entrer » | la scène intérieure s'affiche avec ses tables et ses bacs, et le fil d'Ariane permet de revenir | E |
| MAP-11 | l'heure du jardin est 23 h en juin à 50° N | on calcule le filtre ambiant | « nuit » ; à 13 h, « jour » | U |
| MAP-12 | un utilisateur | il bascule en vue classique, puis se reconnecte | la vue classique s'ouvre par défaut (préférence enregistrée) | E |
| PLN-01 ★ | l'éditeur de plan d'un jardin dont l'utilisateur a `plan:edit` | on choisit l'outil zone, puis on glisse de la tuile (2, 2) à la tuile (5, 4) dans « Potager », avec le type planche | après l'enregistrement, une zone `planche` existe en base avec le parent Potager, une géométrie de 200 × 150 cm (échelle de 50 cm) et une surface de 3 m², et elle apparaît dans `/zones` | E |
| PLN-02 | le formulaire « Ajouter une zone par dimensions » | on soumet les mêmes valeurs que PLN-01 | le résultat est identique | E |
| PLN-03 | deux clients sur la même scène, avec `plan_version = 7` | le client A enregistre, puis le client B enregistre avec `baseVersion = 7` | B reçoit `CONFLICT`, recharge, rejoue ses commandes et signale les éventuels conflits | I |
| PLN-04 | un lot de 3 commandes dont la 3e viole RG-ZON-05 | on l'applique | aucune commande n'est appliquée (tout-ou-rien) | I |
| PLN-05 | l'éditeur | on dessine, annule, puis rétablit | le store reflète chaque étape et le canvas est redessiné | U (store) |
| PLN-06 | un `member` dans un jardin `collective` (édition réservée aux admins) | il ouvre `/plan` | les outils de zone et de terrain sont désactivés, avec une explication ; l'appel direct à l'action renvoie `FORBIDDEN` | E |
| PLN-07 | une échelle qui passe de 50 à 25 cm par tuile | on consulte une zone | ses dimensions réelles ne changent pas ; elle occupe deux fois plus de tuiles par côté | U |
| PLN-08 | la gomme sur une zone ayant un historique | on confirme | la zone est archivée, pas supprimée | I |

### 12.8 Lot 8 — Décoration, avatar, collectif

| ID | Étant donné | Quand | Alors | Test |
|---|---|---|---|---|
| DEC-01 | un objet débloqué | on le place sur la grille | un `decor_placement` est créé, sans effet sur les cultures ni les zones | I |
| DEC-02 | un objet verrouillé (niveau 5 requis), pour un utilisateur de niveau 3 | on envoie une commande `placeDecor` forgée | `LOCKED_ITEM` | I |
| DEC-03 | un hôtel à insectes (★) placé | l'utilisateur choisit « déclarer comme pratique » | une `practice_declaration biodiversity_insect_hotel` liée au placement est créée ; retirer l'objet propose de retirer la pratique | I |
| AVT-01 ★ | l'éditeur d'avatar | l'utilisateur change de coiffure et de couleur de cheveux, puis enregistre | la configuration est enregistrée, le `config_hash` change, et la vignette mise à jour s'affiche dans `/app/jardins/<id>/membres` | E |
| AVT-02 ★ | un élément de couvre-chef verrouillé (succès « Semencier » non obtenu) | l'utilisateur envoie une configuration forgée qui l'équipe | `LOCKED_ITEM`, la configuration précédente est inchangée, et l'UI affiche « Succès Semencier » sur la vignette verrouillée | E |
| AVT-03 | une palette non autorisée pour un élément | on enregistre | `VALIDATION` | I |
| AVT-04 | un calque obligatoire (`body`) mis à `null` | on enregistre | `VALIDATION` | U |
| AVT-05 | un calque en niveaux de gris et une palette de 4 couleurs | on applique la recoloration | chaque niveau de gris réservé est remplacé par la bonne couleur, et les pixels transparents restent transparents | U |
| AVT-06 | le bouton « Aléatoire » | on le presse 50 fois | aucun élément verrouillé n'est jamais choisi | U |
| AVT-07 | des modifications non enregistrées | on presse « Annuler » | la dernière configuration enregistrée est rétablie | E |
| AVT-08 | le catalogue | on liste les options | aucune option n'est filtrée par genre et au moins 12 teintes de peau sont proposées | I |
| AVT-09 | un nouvel utilisateur | son compte est créé | un avatar par défaut déterministe, composé d'éléments débloqués, lui est attribué | U |
| COL-04 | un jardin collectif avec des membres actifs dans les dernières 24 h | on ouvre la vue jardin | leurs avatars apparaissent près de la zone de leur dernière action | E |

### 12.9 Transverse

| ID | Étant donné | Quand | Alors | Test |
|---|---|---|---|---|
| A11Y-01 | les pages principales de la vue classique (tableau de bord, zones, cultures, culture, tickets, ticket, bilan, membres, recommandations) | on lance l'analyse axe-core | aucune violation « serious » ni « critical » | E |
| A11Y-02 | un viewport de 360 px | on parcourt les mêmes pages | aucun défilement horizontal, et les cibles principales font au moins 48 px | E |
| A11Y-03 | la vue jardin | on navigue au clavier | chaque entité interactive est atteignable, son focus est visible, et Entrée ouvre sa feuille | E |
| I18N-01 | le code source | on lance le lint | aucune chaîne littérale affichée dans le JSX hors des fichiers de messages (règle de lint) | U |
| I18N-02 | les fichiers de messages | on compare fr et en | les clés sont identiques (test de parité ; les valeurs en peuvent rester à traduire) | U |
| PRV-07 | un utilisateur | il demande l'export de ses données | un e-mail avec un lien arrive dans Mailpit ; l'archive contient le profil, les contributions, le journal d'XP et les photos | E |
| PRV-08 | un utilisateur owner d'un jardin qui a d'autres membres | il demande la suppression de son compte sans transférer la propriété | la propriété est transférée à l'admin le plus ancien ; à J+30, ses contributions affichent « Jardinier·e supprimé·e » | I |
| PRV-09 | une suppression demandée | l'utilisateur clique sur le lien de rétablissement dans les 30 jours | le compte est rétabli à l'identique | I |
| ENV-01 | une variable d'environnement obligatoire manquante | on démarre l'app | elle s'arrête avec un message qui nomme la variable | U |

### 12.10 Lot 9 — Finitions (à détailler avant le lot)

| ID | Étant donné | Quand | Alors | Test |
|---|---|---|---|---|
| OFF-01 | une vue jardin chargée une fois | le réseau est coupé et la page rechargée | le plan et les sprites essentiels s'affichent depuis le cache | E |
| OFF-02 | hors-ligne | on saisit une observation et une récolte | elles sont mises en file (IndexedDB) et envoyées au retour du réseau, sans doublon grâce aux IDs client | E |
| STAT-01 | 3 saisons d'historique | on ouvre `/statistiques` | les rendements par espèce et par zone sont comparés d'une année à l'autre | E |

---

## 13. Stratégie de tests et traçabilité

### 13.1 Niveaux

| Niveau | Outil | Portée | Base de données |
|---|---|---|---|
| Unitaire | Vitest | Fonctions pures : permissions, distance et score de recommandation, barème et anti-abus d'XP, niveaux, phase visuelle, rotation, récurrence, geohash, soleil, recoloration, schémas Zod | aucune |
| Intégration | Vitest | Services et Server Actions (via leur handler), contraintes en base, jobs | `greenu_test`, une transaction annulée par test ; migrations appliquées une fois par exécution |
| E2E | Playwright (Chromium mobile Pixel 7 et desktop) | Parcours utilisateur, e-mails via l'API Mailpit, couche DOM de la vue jardin | `greenu_test` remise à zéro et seedée avant la suite ; `APP_NOW` figé |

### 13.2 Outils de test

- **Fabriques** typées (`tests/factories`) pour chaque entité. Pas de `as` dans les tests : les objets partiels passent par les fabriques.
- **Mailpit** : un helper `mailpit.waitFor({ to, subject })` interroge `GET /api/v1/search?query=to:<email>` jusqu'à 10 s, puis lit le message (`GET /api/v1/message/{ID}`) pour en extraire les liens. `DELETE /api/v1/messages` est appelé avant chaque test qui dépend d'un e-mail.
- **Authentification e2e** : `storageState` pré-généré pour chaque persona du seed (owner, admin, member, observer, non-membre).
- **Horloge** : `APP_NOW` côté serveur, `page.clock.setFixedTime` côté navigateur.
- **Vue jardin** : les tests e2e interagissent seulement via la couche DOM (`data-testid`) et, pour le dessin, via la conversion tuiles → pixels exposée sur `plan-grid`. Jamais par capture d'écran du canvas.

### 13.3 Traçabilité

- Tout test porte l'ID du critère dans son titre : `test('[PLN-01] dessin d'une zone crée la zone en base', …)`.
- `pnpm test:spec` extrait les IDs de la section 12 de `SPEC.md` et ceux des titres de tests (rapports JSON de Vitest et de Playwright). Il **échoue** si un critère du lot courant n'a aucun test, ou si un test référence un ID inconnu. Le lot courant est déclaré dans `spec.config.json`.
- Les règles RG-* n'ont pas besoin de test direct : elles sont couvertes à travers les critères qui les citent.

---

## 14. Données de seed

Seed **déterministe** (`pnpm db:seed`) :

- Les UUID sont dérivés d'un nom par UUID v5, avec un espace de noms fixe. Le seed est idempotent et les tests peuvent viser des IDs stables.
- Le générateur pseudo-aléatoire a une graine fixe (`mulberry32(42)`).
- Les dates sont calculées à partir de `SEED_REFERENCE_DATE`, qui vaut `APP_NOW` en test et la date du jour sinon. Le contenu est donc identique pour une même date de référence, et « aujourd'hui » a toujours des tâches.

Contenu :

| Élément | Détail |
|---|---|
| Comptes | `alice@greenu.test` (owner du jardin familial), `bruno@` (owner du jardin collectif), `chloe@` (admin collectif), `david@`, `emma@` (membres collectifs, dans Équipe serre), `farid@` (observateur), `gaelle@` (owner de la serre pro), `hugo@` (sans jardin, utilisé pour AUTHZ), `modo@` (modérateur), `admin@` (admin plateforme). Mot de passe commun documenté dans le README : `jardin-seed-2026`. |
| Référentiel | 11 familles, environ 40 espèces (les plus courantes au potager, aromatiques, petits fruits, quelques fleurs compagnes), environ 90 variétés dont 3 `pending` et 1 `rejected`, environ 60 associations, calendriers de référence pour les groupes Köppen C et D. |
| Jardin familial « Les Tilleuls » | Plein air, Cfb, 120 m d'altitude, limoneux. Zones : Potager → 4 planches → rangs ; Carrés (3 bacs) ; Petits fruits ; Composteur. 3 saisons d'historique (N−2, N−1, N), environ 45 cultures, journal riche, récoltes, bilans complets, et une rotation volontairement non respectée (pour ROT-01). |
| Jardin collectif « Jardin partagé du Canal » | `collective`, plein air et serre (zone Serre `has_interior` avec 2 tables et des bacs), 6 membres, groupes « Équipe serre » et « Famille Dupont », zone « Parcelle Dupont » restreinte à « Famille Dupont », 25 tickets (dont des séries récurrentes d'arrosage, des tickets d'étape et des tickets assignés à des groupes), objectifs collectifs. |
| Serre pro « Maraîchage des Combes » | `professional`, serre et tunnel, Cfb ou Dfb, cultures en volume sur 2 saisons. |
| Jardins « communauté » | 30 jardins synthétiques, chacun avec un owner synthétique, des contextes variés (Cfb, Csa, Dfb, altitudes de 0 à 1 200 m, sols et pratiques variés) et partage activé : environ 600 bilans répartis pour que certaines espèces dépassent `high` en confiance, d'autres restent `low`, et au moins une reste en démarrage à froid dans le contexte des Tilleuls. |
| Contenus | 6 guides (public, non listé, privé ; dont 1 fork et 1 guide avec calendrier type), 25 tips votés, 2 signalements ouverts. |
| Progression | Événements historiques rejoués par `xp:recompute` en fin de seed (à partir du lot 6), succès en conséquence. Catalogues d'avatar et de déco (avec des éléments verrouillés par niveau, succès et saison) ; les assets de substitution sont utilisés tant que les assets définitifs ne sont pas livrés (§9.2). |

---

## 15. Lots et définition de « terminé »

| Lot | Contenu | Critères | Pages (PAGES.md) |
|---|---|---|---|
| 1 Socle | Auth, invitations, jardins, zones, membres, rôles, groupes, autorisation, outbox d'événements, jobs, e-mails, i18n, structure du code, docker-compose, CI | AUTH, GRD, ZON, INV, MBR, GRP, AUTHZ, ENV, I18N, A11Y (pages du lot) | §1, §2 (sans l'avatar), §3 `/app/jardins*`, §4 `/zones*`, `/membres`, `/parametres`, §7 `/compte`, `/confidentialite` (partiel), §9 |
| 2 Cultures | Référentiel, cultures, étapes, journal, photos, récoltes, saisons, rotations, associations | PLT, SEA, CUL, JRN, ROT | §4 `/cultures*`, `/saisons`, saisie rapide, §5 `/app/plantes*`, §8 `/admin/varietes` |
| 3 Ticketing | Tickets, assignation, récurrence, vues, tickets d'étape, notifications | TCK, RCR, NTF | §4 `/tickets*`, §3 `/app` (tâches du jour), §6 `/app/notifications`, §7 `/notifications` |
| 4 Guides et tips | Guides, versions, fork, application, tips, votes, signalements, modération | GUI, TIP, MOD | §1 `/guides-publics`, §5 `/app/guides*`, `/app/tips`, §6 `/app/jardiniers/[pseudo]`, §8 |
| 5 Bilans et reco | Bilans, consentement, vue anonymisée, moteur V1 | RES, PRV, RCO | §4 `/bilan`, `/recommandations`, fiche espèce (agrégats), §7 `/confidentialite` |
| 6 Progression | Barème, journal d'XP, anti-abus, recalcul, niveaux, compétences, succès, quêtes, collectif (logique) | XP, LVL, ACH, QST, COL-01 à COL-03 | §6 `/app/profil*` (sauf l'avatar), §8 `/admin/xp` |
| 7 Vue jardin | Moteur PixiJS, instantané de scène, phase visuelle, états, couche accessible, éditeur de plan | MAP, PLN | §4 `/`, `/plan`, §7 `/affichage` |
| 8 Déco et avatar | Déco, déblocages, avatar, vignettes, avatars dans la vue, page de progression collective | DEC, AVT, COL-04 | §6 `/app/profil/avatar`, §2 étape avatar, §4 `/progression` |
| 9 Finitions | PWA et hors-ligne, statistiques pluriannuelles, polish | OFF, STAT (à compléter) | §4 `/statistiques`, page hors-ligne |

**Définition de « terminé » pour chaque lot** :

1. `pnpm typecheck` et `pnpm lint` (ESLint + Stylelint) sans erreur ni avertissement.
2. `pnpm test`, `pnpm test:e2e` et `pnpm test:spec` au vert pour les critères du lot et des lots précédents.
3. Migrations générées, relues et appliquées sur une base vide **et** sur la base du lot précédent avec seed. Aucune migration éditée après coup.
4. Seed à jour pour les fonctionnalités du lot.
5. SPEC.md à jour, avec les écarts consignés au §18.
6. Récap court : ce qui est fait, ce qui reste, décisions prises, dette identifiée.

---

## 16. Choix faits par défaut

À confirmer ou à corriger lors de la validation.

| # | Choix | Alternative écartée |
|---|---|---|
| D-01 | Better Auth pour l'identité et les sessions ; invitations, adhésions et groupes dans nos propres tables | Plugin `organization` de Better Auth (historique et permissions par zone moins maîtrisés) |
| D-02 | PostgreSQL 18 avec `uuidv7()` natif | PG 16 avec UUID générés côté application |
| D-03 | pg-boss pour les jobs, l'outbox et les e-mails (pas de Redis) | BullMQ + Redis ; cron externe |
| D-04 | PixiJS v8, rendu à la demande | Phaser (trop lourd pour ce besoin) |
| D-05 | Arcs exclusifs (FK nullables + `CHECK`) pour le polymorphisme | `(target_type, target_id)` sans intégrité référentielle |
| D-06 | Arbre de zones : liste d'adjacence + chemin matérialisé | `ltree` ; table de fermeture |
| D-07 | Géométrie en centimètres, rectangles alignés sur la grille en V1 | Polygones libres (§17 Q-03) |
| D-08 | Saison = année culturale par jardin, du 1er janvier par défaut | Saisons astronomiques |
| D-09 | Le consentement au partage des bilans est donné par l'owner au niveau du jardin | Consentement individuel de chaque auteur (§17 Q-10) |
| D-10 | k-anonymat à 5 jardins, identique au seuil de démarrage à froid | Seuils séparés |
| D-11 | Suppression d'un contenu = annulation de l'XP gagnée ; niveau affiché = maximum historique | XP « en attente » 24 h, ou pas d'annulation (§17 Q-14) |
| D-12 | Succès et quêtes définis en code (registre typé), pas en base | Moteur de règles en base, configurable |
| D-13 | Vignettes d'avatar composées côté client, en cache par `configHash` | Génération serveur (dépendance d'image, par exemple `sharp`) |
| D-14 | Les utilisateurs proposent des variétés, pas des espèces | Propositions d'espèces aussi (§17 Q-08) |
| D-15 | Un ID client accepté pour les entités créables hors-ligne (idempotence), toujours re-vérifié | IDs exclusivement générés par le serveur |
| D-16 | Pas de RLS PostgreSQL en V1 (scope applicatif + FK composites) | RLS (§17 Q-20) |
| D-17 | Fichiers servis par un Route Handler authentifié ; disque local en dev et S3 en prod | MinIO dans docker-compose dès le lot 1 |
| D-18 | Routes en français, sans préfixe de locale | `/fr/...` (§17 Q-19) |
| D-19 | Éditeur de guide : Markdown, `textarea` et aperçu | Éditeur structuré (TipTap, Lexical) plus lourd |
| D-20 | Tickets générés par les étapes et les guides créés tout de suite avec `visible_from`, plutôt que par un job différé | Table de tâches planifiées et job de matérialisation |
| D-21 | Licence des contenus publics (guides, tips) : CC BY-SA 4.0, mentionnée à la publication | Tous droits réservés, ou au choix de l'auteur (§17 Q-13) |
| D-22 | SCSS en CSS Modules + design tokens en propriétés CSS ; primitives Radix habillées maison | Tailwind + shadcn/ui (écarté par décision de l'équipe) |
| D-23 | Les Server Components lisent via les fonctions des services en leur passant `db()` ; ni schéma ni dépôt dans l'UI | Une couche « queries » supplémentaire qui masque l'exécuteur |
| D-24 | Localisation du jardin au lot 1 : géolocalisation du navigateur ou saisie latitude / longitude, sans carte ni géocodage | Carte interactive (Leaflet) et géocodage d'adresse (service externe) — §17 Q-24 |
| D-25 | Marque affichée : **GreenU** (les maquettes portent « Bouture », elles servent de référence de style) | Bouture |
| D-26 | Table SQL `garden_group` pour l'entité « groupe » (`group` est un mot réservé SQL) | Table `"group"` entre guillemets |

---

## 17. Questions ouvertes

Questions qui demandent ton arbitrage. Les choix provisoires sont en §16.

| # | Question | Impact | Proposition |
|---|---|---|---|
| Q-01 | Faut-il un lien magique (connexion sans mot de passe), utile au jardin avec des gants ? | Lot 1, UX | Oui, en option à côté du mot de passe |
| Q-02 | Connexion via Google ou Apple ? | Lot 1, RGPD | Non en V1 |
| Q-03 | Les zones en L ou en polygone libre sont-elles nécessaires en V1, ou les rectangles suffisent-ils (une zone en L = deux zones) ? | Lot 7, modèle de géométrie | Rectangles en V1 ; le schéma `GeometryV1` est versionné pour accepter `polygon` en V2 |
| Q-04 | Les cultures vivaces (fraisiers, framboisiers, fruitiers) : une seule culture qui couvre plusieurs saisons avec un bilan par saison (proposé), ou une culture par saison ? | Lots 2 et 5 | Une culture pluriannuelle, un bilan par saison |
| Q-05 | Une invitation peut-elle être acceptée par un compte dont l'e-mail diffère (le lien sert alors de jeton porteur) ? | Sécurité | Non (strict) |
| Q-06 | Plusieurs owners possibles (co-propriété d'un jardin familial) ? | Lot 1, matrice | Non ; un owner et des admins |
| Q-07 | Les observateurs peuvent-ils commenter les tickets (par exemple des élèves en jardin pédagogique) ? | Matrice | Non par défaut ; réglage par jardin en option |
| Q-08 | Les utilisateurs peuvent-ils proposer de nouvelles **espèces**, en plus des variétés ? | Lot 2, modération | Variétés seulement en V1 |
| Q-09 | Une culture vivace reste `active` entre les saisons : faut-il un état `dormant` explicite ? | Lots 2 et 7 | Non ; c'est dérivé (phase visuelle) |
| Q-10 | Consentement au partage des bilans : la décision de l'owner suffit-elle, ou faut-il aussi un opt-out individuel des membres pour leurs propres bilans ? | Lot 5, RGPD | Décision de l'owner + bandeau d'information ; opt-out individuel à ajouter si tu le souhaites (coût faible) |
| Q-11 | À la suppression d'un compte, que faire des guides publics : les supprimer (proposé) ou les garder sous forme anonyme par défaut ? | RGPD, contenu | Supprimés par défaut, conservation anonyme au choix de l'utilisateur |
| Q-12 | Hébergement cible (Vercel, VPS avec Docker, Scaleway, OVH…) ? Cela conditionne le stockage des fichiers, le worker pg-boss (processus permanent, incompatible avec du serverless pur) et l'envoi SMTP. | Lots 1 et 9, déploiement | VPS ou PaaS avec conteneurs (app + worker), stockage S3 européen |
| Q-13 | Quelle licence pour les guides et tips publics, condition du fork ? | Lot 4, juridique | CC BY-SA 4.0 |
| Q-14 | Anti-abus « création puis suppression » : la ligne `reversal` peut faire baisser le total d'XP (le niveau, lui, ne baisse jamais). Est-ce acceptable au regard du principe « pas de perte d'XP », ou préfères-tu une XP « en attente » 24 h avant confirmation ? | Lot 6 | `reversal` + niveau maximum historique |
| Q-15 | Le classement compétitif, quand un admin l'active : sur l'XP totale ou sur les contributions de la période ? | Lot 6 | Sur l'XP de la période en cours (mois) |
| Q-16 | Table de correspondance localisation → Köppen et zone de rusticité : faut-il embarquer un jeu de données ouvert (par exemple une grille Köppen-Geiger à 0,5°, environ 200 ko) pour proposer automatiquement les valeurs ? | Lot 1, qualité du contexte | Oui, une grille embarquée et une saisie manuelle possible |
| Q-17 | Le livrable des assets (session séparée) suivra-t-il le contrat du §9.2 (manifeste JSON, clés, phases génériques) ? Quel format de manifeste : un format maison, ou un format d'atlas existant (par exemple le JSON TexturePacker, lu nativement par PixiJS) ? | Lots 7 et 8 | Retenu au lot 7 : JSON au format TexturePacker ; la correspondance espèce / phase est déduite des noms de frames (`cultures/<clé>-<n>-<étape>.png`, SPRITES.md), sans `phases.json` |
| Q-18 | Faut-il des notifications push (PWA) au lot 9 ? | Lot 9 | À décider après le MVP |
| Q-19 | Prévoir un préfixe de locale dans les URL (`/fr/…`) dès maintenant, pour le SEO des guides publics multilingues ? | Lot 1, routes | Non ; locale en préférence et cookie ; préfixe seulement pour `/guides-publics` le jour où l'anglais arrive |
| Q-20 | Faut-il ajouter le RLS PostgreSQL en plus du scope applicatif (exigence de conformité éventuelle) ? | Architecture | Non en V1 |
| Q-21 | Unités : faut-il prévoir des unités impériales (lb, ft) ? | i18n | Non ; système métrique seulement en V1, conversion d'affichage possible plus tard |
| Q-22 | Les jardins pédagogiques ont-ils besoin de comptes élèves sans e-mail (gérés par l'enseignant) ? | Lot 1, auth, RGPD des mineurs | Hors V1 ; à confirmer, car cela change l'auth et le consentement (mineurs) |
| Q-23 | Faut-il garder la page d'accueil publique `/` avec un aperçu de la vue jardin dès le lot 1, alors que la vue n'arrive qu'au lot 7 ? | Lot 1 | Accueil simple au lot 1, aperçu animé au lot 7 |
| Q-24 | Localisation : faut-il une carte et un géocodage d'adresse (service externe comme Nominatim, ou base de communes embarquée) pour remplacer la saisie latitude / longitude ? | Onboarding, UX | Base de communes embarquée (sans appel externe) au lot 2 ou 9 |

---

## 18. Journal des modifications

| Version | Date | Changement |
|---|---|---|
| 0.1 | 2026-10-01 | Première rédaction, soumise à validation |
| 0.13 | 2026-10-02 | Alignement sur les maquettes (branche `design/maquettes`) : palette relevée sur les maquettes, police Inter, sprites HD (`out_hd`) et icônes pixel art de la barre d'onglets (`scripts/nav-icons.py`, provisoires). Décision : **thème clair par défaut**, le thème sombre n'est plus déclenché par `prefers-color-scheme` et ne s'applique que sur choix explicite (`data-theme="dark"`) ; le réglage du thème reste à exposer dans `/app/parametres/affichage`. |
| 0.12 | 2026-10-02 | Fin du lot 8 : tables `decor_item`, `decor_placement`, `avatar_item`, `palette`, `avatar_item_palette`, `user_avatar` ; catalogues définis en code et chargés avec le référentiel ; commandes `placeDecor`, `moveDecor`, `removeDecor` dans le lot tout ou rien de l'éditeur ; éditeur d'avatar, étape 1 de `/bienvenue`, vignettes `AvatarThumb` ; avatars dans la vue jardin ; page `/progression`. Décisions : sprites HD (`out_hd/`) pour l'avatar et toute l'app (§9.2) ; déclarer un objet ★ comme pratique exige `garden:update` et crée la déclaration au niveau du jardin (retirer l'objet propose de retirer la pratique, sinon elle reste, détachée) ; avatars affichés dans les jardins `collective`, `association` et `educational`, d'après le dernier événement de domaine rattaché à une zone ; « succès collectifs » de `/progression` = succès des membres actifs, sans rang ; conditions `skill` exprimées en niveau de compétence et `season_active` sur l'hémisphère nord, comme `all_seasons` ; le succès `seed_saver` s'appelle « Semencier » (§10.4). Écarts : les comptes antérieurs au lot reçoivent leur avatar par défaut à la lecture (pas de rétro-remplissage : il est dérivé de l'ID en code) ; les assets V1 n'ont ni calque `hair_back` ni yeux recolorables (calque `face_eyes` sans emplacement, aucune palette `eyes`) ni sourcils ; la palette d'objets ne gère pas encore les variantes de nuit (lanterne allumée). |
| 0.11 | 2026-10-02 | Fin du lot 7 : vue jardin PixiJS (instantané de scène, phase visuelle, états, couche accessible, scène intérieure, cycle jour / nuit par élévation solaire) et éditeur de plan (commandes tout ou rien, `CONFLICT` et rejeu, formulaire par dimensions), table `terrain_element`, page `/app/parametres/affichage`. Décisions : la vue par défaut d'un profil devient `garden`, et les profils existants sont repris (le choix n'existait pas avant) ; atlas au format TexturePacker, phases déduites des noms de frames de SPRITES.md (pas de `phases.json`, §17 Q-17), copié par `pnpm assets:sync` ; cultures réparties automatiquement dans leur zone (§9.5) ; saisie rapide ouverte sur place (§9.5) ; annuler / rétablir limité aux gestes non enregistrés (§9.7) ; événement `garden.plan_saved`. Écarts reportés : avatars dans la vue et commandes de déco (lot 8), terrain précalculé par blocs de 16 × 16 et culling (§9.1, rendu par élément en V1), animations ambiantes limitées à l'ondulation des plantes, thème de l'interface (suit l'appareil). MAP-08 est testé sans base (moteur et ordonnanceur factices) ; le refus de PLN-06 côté action est prouvé en intégration. |
| 0.10 | 2026-10-02 | Fin du lot 6 : colonnes `subject_id` et `culture_id` du journal d'XP, table `xp_flag`, `user_profile.leaderboard_opt_out` (§4.2.5) ; texte et avancement des quêtes (`title_key`, `title_params`, `target`, `progress`) ; recalcul par lignes de correction `#recompute`, sans recalcul ciblé par événement (RG-XP-08) ; succès évalués de façon synchrone (§8.5) ; contributions et classement dans l'onglet « Contributions » des membres (§8.7). Le seed vérifie l'éligibilité des votes (RG-XP-04) comme en production. |
| 0.9 | 2026-10-02 | Fin du lot 5 : complétude plafonnée sans revue des problèmes (RG-RES-03) ; démarrage à froid sous 5 jardins seulement, redistribution des poids inconnus et filtre de l'hémisphère opposé (§7.2, §7.3) ; contenu précisé de `shared_result_fact` (§11.3) ; transfert de propriété à la purge (§11.4). Écarts : cache des recommandations et pré-remplissage du taux de réussite reportés ; journal d'XP de l'export vide jusqu'au lot 6. |
| 0.8 | 2026-10-02 | Corrections de l'audit du lot 4 : instant de référence unique des e2e et horloge des jetons tiers (§3.7) ; plafonds horaires des contenus communautaires (§6.9). |
| 0.7 | 2026-10-02 | Fin du lot 4 : tâches de guide relatives à la date réelle de l'étape et réapplication (RG-GUI-05), guides non listés lisibles sans compte et guides illisibles en 404 (RG-GUI-03), rang du fil de tips (RG-TIP-03), pas d'auto-signalement (RG-MOD-01), notifications `content_hidden` et `moderation_decision` (RG-NTF-01), matrice des sols voisins (§7.2), événements de modération (§3.5). Écart : les tâches récurrentes de `GuideCalendarV1` sont reportées (§4.5). Le profil public n'affiche pas encore avatar ni niveau (lots 6 et 8). |
| 0.6 | 2026-10-02 | Corrections de l'audit du lot 3 : la désinscription par e-mail passe par une confirmation explicite (RG-NTF-04, NTF-04) ; pièces jointes des tickets ponctuels (RG-TCK-01, TCK-19) ; découpage des services volumineux (§3.2). |
| 0.5 | 2026-10-02 | Fin du lot 3 : tickets d'étape (titre traduisible, rattachés à la culture), occurrences détachées (RG-TCK-09), regroupement des notifications et type `group_archived_unassigned` (RG-NTF-03), menu « Déplacer vers » du kanban, page `/app/taches` et cloche de notifications, page publique `/desinscription/[token]`. Audit du lot 2 (76/100) corrigé : endpoints HTTP d'authentification restreints, en-têtes de sécurité (CSP à nonce), actions de lecture sans revalidation, listes bornées, CI et pre-commit. |
| 0.4 | 2026-10-01 | Fin du lot 2 : clôture manuelle des saisons (RG-SEA-02), confirmation explicite des alertes de rotation (RG-ROT-02), archivage d'une zone avec cultures en cours (RG-ZON-06), photos « en attente » et EXIF retiré côté serveur (RG-JRN-03), intervention `transplant`, scripts `db:reference` et `assets:sync`, dossier de build e2e séparé (`NEXT_DIST_DIR`). JRN-05 et les parties « tickets » de CUL-07 / ZON-10 passent au lot 3. |
| 0.3 | 2026-10-01 | Fin du lot 1 : ports et nom du projet Compose, `no-restricted-imports` au lieu d'`eslint-plugin-boundaries`, Stylelint limité aux couleurs, dépendances ajoutées (`concurrently`, `@axe-core/playwright`, `server-only`), table `garden_group`, ZON-09 / ZON-10 / AUTHZ-08 déplacés au lot 2, choix D-23 à D-26, question Q-24. |
| 0.2 | 2026-10-01 | Validation. Tailwind et shadcn/ui remplacés par SCSS (CSS Modules, tokens) et des primitives Radix habillées en SCSS (§3.1, §3.9, D-22). Ajout de Stylelint. Propositions du §17 retenues comme décisions provisoires. |
