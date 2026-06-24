# ROADMAP.md - REAL31 Intranet

Roadmap macro jusqu'à la mise en production du MVP, puis aperçu post-MVP.

> **Convention** : ce fichier est la mémoire institutionnelle inter-sessions / inter-machines (Mac/PC). À lire en premier en début de session, à mettre à jour à chaque fin d'incrément ou de session significative.

---

## 📍 État actuel - 2026-06-24

- **MES EMAILS - ingestion live derriere ports (2026-06-23/24)** : pipeline de tri (clean/prefilter/group/sender + analyse Mistral) **porte dans l'intranet** (domaine pur + port `AnalyseMailProvider`, adapter Mistral ou mock). Chaine bout-en-bout **ingestion -> cerveau -> cache triage (table `intranet_mes_emails_triage`) -> cockpit**, bouton "Synchroniser ma boite" (server action). Adapter d'ingestion **echantillon** (teste sans Graph) + **stub Graph delegue**, bascule `MAIL_SOURCE=graph`. **Bloque DSI** : permission `Mail.Read` (Delegated) + `offline_access` sur l'app `REAL31 Intranet` (cf. `docs/entra-app-registration.md` etape 2bis) + capter le token SSO dans Auth.js. tsc + lint + build OK. **Prochaine action** : executer `supabase/sql/intranet_mes_emails_triage.sql` puis tester "Synchroniser" sur l'echantillon ; transmettre la demande Mail.Read au DSI. (En cours : integration **Signitic** pour la signature des reponses.)

- **🚀 MISE EN PROD - SSO LIVE (2026-06-24)** : l'intranet est **en ligne sur `https://real31.app`** avec le **SSO Entra ID actif en prod** (le gate mot de passe partagé s'efface automatiquement dès que les 3 `AUTH_MICROSOFT_*` sont présentes). Déploiement via le **Vercel de la collègue** (remote `deploy` = `SIK31-78/real31-intranet`, cf. memory `project_deploy_vercel_collegue`). Franchi ce jour : **13 variables d'env Vercel** posées · **15 tables natives `intranet_*`** confirmées présentes sur la base patron (SQL de vérif) · **email matching** M365 ↔ `User.email` validé · **DNS apex** `real31.app` nettoyé (un seul A Vercel `216.198.79.1`, reliquat Gandi `217.70.184.38` retiré par le DSI) · `real31.app` rendu **canonique** côté Vercel (`www` -> 307 -> apex). **Piège résolu** : crash `auth()` `TypeError: Invalid URL, input:'real31.app'` = `AUTH_URL` posé **sans schéma** -> corrigé en **`https://real31.app`** + **redéploiement** (une var d'env ne s'applique qu'au déploiement suivant). Redirect URI Entra `https://real31.app/api/auth/callback/microsoft-entra-id` déjà déclarée par le DSI (anticipée samedi). **Restes** : (a) `www.real31.app` encore *Invalid* côté Vercel (CNAME pointe toujours sur Gandi `webredir.vip.gandi.net` -> à basculer sur `cname.vercel-dns.com`, **confort, non bloquant**) ; (b) **durcissement RLS** (`service_role` bypass RLS, cloisonnement appliqué en code) = **prochain chantier sécu de fond** ; (c) passkeys du coffre désormais **viables** sur ce domaine stable.
- **BACKLOG retours test Wilfrid (grandeur nature, 2026-06-24)** - vide-cerveau trié, regroupé en 4 chantiers. **Quick wins livrés ce jour** :
  - 🧭 **Navigation** : ✅ **A1** bouton recherche tactile sur mobile (icone, `md:hidden`) - le raccourci Ctrl+K seul n'etait pas atteignable a une main (la barre `hidden md:flex` cachait tout sur petit ecran).
  - 📋 **Supervision AG v2** (chantier, à cadrer) : ✅ **B1** (inc 2) paliers · ✅ **B2** (inc 3) probleme -> actions groupees par copro · ✅ **B3** (inc 3) dashboard "Problemes" remplace "Activite recente" · ✅ **B4 (inc 1/3, 2026-06-24)** : **colonne d'echeances reglementaires** dans la Supervision AG (decision Sekou : echeance affichee a cote de chaque etape, pas une phase). Mapping `ITEM_ECHEANCE` (conv.date->CONVOC, conv.rappel-pouvoirs->RELANCE_POUVOIRS, apag.scan-contrat->SCAN_CONTRAT, apag.notif-pv-date->NOTIF_PV), pastille J-x + date + severite (ok/soon/late) calculee par le moteur jalons existant. **Bloc Jalons retire de la fiche** (`bloc-jalons.tsx` supprime) ; la machinerie `intranet_jalons` + alarme dashboard reste INCHANGEE (fusion visuelle seulement). ✅ **inc 2/3 (2026-06-24) - paliers (B1)** : la Supervision AG est un parcours guide. Phase courante = premiere non terminee (ouverte) ; precedentes repliees (rouvrables) ; **suivantes verrouillees-grisees** (cadenas, contenu masque) avec **anti-blocage "Deverrouiller"** (etat de session). Phase **terminee** = tous items OK/N/A/dates ET aucun "probleme" (`phaseTerminee`, plus strict que la progression ; 5 tests). **Verifications comptables = phase epinglee en tete, hors-paliers, repliee** (badge "vue comptable"). ✅ **inc 3/3 (2026-06-24) - problemes (B2/B3)** : cocher "probleme" sur un item fait remonter le probleme dans un **panneau "Problemes"** (groupe par copro, lien vers la supervision) qui **remplace "Activite recente"** sur le dashboard ET coiffe la page **Actions**. Resolu en re-cochant OK (zero stockage a part : port `listerProblemes` -> requete `intranet_supervision_items` statut=probleme cloisonnee perimetre -> service `getProblemes` ; degrade proprement). `flux-activite.tsx` supprime. **=> SUPERVISION AG v2 COMPLETE (inc 1+2+3, B1-B4).**
  - 🗂️ **Dossiers** : ✅ **C4** types **"Questions diverses"** + **"Autres"** (catch-all, etapes vides) · ✅ **C2** vue **groupee par copropriete** (en-tete par copro quand tri = "par copropriete", + tri conserve) · 🔲 **C1** supprimer une note - **uniquement les siennes** (tracer l'auteur ; un assistant ne supprime pas celles du gestionnaire) · 🔲 **C3** actions des dossiers dans le **dashboard** · 🔲 **C5** **numero de resolution** dans le dossier -> rattacher dossier <-> resolution d'AG <-> AG · 🔲 **C7** etapes **pre-attribuees** gestionnaire/assistant · **C6** (detailler l'etape + loop) = **fait par Sekou lui-meme**.
  - 🔐 **Coffre / mdp** : 🔲 **D1** a la creation, **autoriser un mdp faible** (ex `12345678` doit passer) ET proposer un **mdp robuste genere**, enregistrable sur Chrome (ne pas avoir a chercher le mdp).
  - **A clarifier avant code** : B4 (forme de la fusion jalons/supervision) ; B2 (comment une action "probleme" se resout - re-cocher OK la fait disparaitre ?).
- **REFONTE COCKPIT (2026-06-22)** : la "ligne claire" = l'**état du cycle AG** comme colonne vertébrale (`a_planifier / en_preparation / convoquee / tenue`, domaine `etat-cycle-ag.ts` + tests ; "Convoquee" = jalon CONVOC coché, décision Sekou). Trois principes : état partout · une seule prochaine action · checklist en mode expert replié. Livré : **Dashboard cockpit** (pipeline des AG en héros, colonnes cliquables -> liste filtrée ; retire les 3 KPI + le parcours redondants ; "À faire maintenant" conservé) · **Toutes les copropriétés** = page de pilotage avec **bascule Liste / Pipeline** (kanban par état, filtres source/état/exercice, clic -> fiche) · **Supervision en accordéon** (seule la phase en cours ouverte). tsc + 72 tests + build OK. Reste possible : nettoyer le code mort (`parcours-ag.tsx`, `kpi-card.tsx`).
- **ONBOARDING "prise en main" (2026-06-22)** : réponse au "comment prendre en main sans être inondé" + dates de 1ère migration fausses. (1) **Fenêtre de prépa** : une AG datée au-delà de ~150j (placeholder 31/12 hérité) passe en état **"À venir"** (calme) -> débruite. (2) **Prise en main** : table native `intranet_copro_prise_en_main` (SQL dans `docs/supabase-setup.md`, **à lancer côté Supabase** ; feature inerte tant que la table n'existe pas). Chaque copro démarre "à prendre en main" et **ne déclenche aucune alarme** tant qu'elle n'est pas confirmée (exclue du pipeline/compteurs/à-faire). Bac "À prendre en main" sur la page copros + bannière dashboard. Cloisonné `managerId`. **ACTION SEKOU : lancer le SQL.**

- **MES EMAILS - cockpit branché sur le vrai triage + actions persistées (2026-06-22)** : l'écran "Mes emails" lit désormais le **triage réel** produit par assistant-ia (pipeline Mistral sur l'export PST), via l'**adapter-fichier** (`data/mes-emails-triage.json`, git-ignoré, PII) derrière le routeur. **Cloisonné par portefeuille** (un gestionnaire ne voit que ses copros - validé en vrai : S234/Canopea apparaît chez **Chrystelle Bouchaud** qui a repris le portefeuille, plus chez Sekou). Nettoyage des corps à la source (fins de ligne PST corrompues + transferts coupés au 1er message). **Actions du gestionnaire persistées** (table native `intranet_mes_emails_etat`, **ADR-026**) : valider/classer, étapes du plan cochées, brouillon édité, override de rattachement, lu - clé `(gestionnaire_id, email_id)`, chaîne port/adapter/service/server action, `coproAppartient` en garde, dégrade proprement si la table n'existe pas encore. tsc + lint + build OK. **Prochaine action** : exécuter `supabase/sql/intranet_mes_emails_etat.sql` dans le SQL editor Supabase, puis tester valider -> reload (persiste). Le triage reste en lecture seule (la proposition) ; "valider" deviendra une vraie action sortante quand M365/Graph sera branché.


- **Phase** : 5 écrans MVP + **ODJ** + **coffre-fort de mots de passe** (ADR-025) + **référentiel App A exploité hors eStale** (lot 1), **branchés sur la vraie data** (264 copros). **SSO Entra ID ACTIF en local (2026-06-20) PUIS EN PROD (2026-06-24)** : le sélecteur dev est remplacé par le vrai login Microsoft dès que les identifiants sont présents ; **live sur `https://real31.app`** (cf. bloc "MISE EN PROD" en tête). Reste : **durcissement RLS**.
- **SESSION 2026-06-20** :
  - ✅ **SSO Microsoft Entra ID branché et validé en local** : App Registration dédiée `REAL31 Intranet` (single tenant) créée avec le DSI ; `AUTH_MICROSOFT_ENTRA_ID_*` dans `.env.local` ; login -> session -> résolution du gestionnaire par email (`findByEmail`) -> cloisonnement OK (testé : connexion en tant que Sekou KOMA, son périmètre). Piège résolu : `invalid_client` car l'**ID de secret** (GUID) avait été collé au lieu de la **Valeur**. Doc `docs/entra-app-registration.md` à jour (domaine prod = **`real31.app`** racine, décision Sekou). **Pas encore en prod** : redirect URIs pointent sur `real31.app`, non live côté DNS -> Vercel reste en gate mot de passe partagé tant que le domaine n'est pas là.
  - ✅ **Dashboard - modèle d'alarme honnête** (`292f263`) : un jalon de prépa échu mais non marqué dans l'intranet n'est plus un faux "en retard" rouge (le travail se fait dans eStale, source primaire). Il devient **"à confirmer"** (neutre) + bouton **"Fait"** 1 clic (marque le jalon accompli, cloisonné). Le rouge ne sort que d'une donnée positive (jalon marqué, ou AG non planifiée au-delà du délai légal). KPI "En retard" -> "À confirmer". Diagnostic : les "14 convoc en retard" de Rémi BARD étaient 14 vraies AG du 30/06 dont les convocs sont gérées dans eStale (`intranet_jalons` quasi vide).
  - ✅ **Fiche copro - dernière AG / dernier CS éditables** (`ab50632`) : chaîne d'écriture des dates étendue (`quand: prochaine | derniere`, mappe `lastAGDate`/`lastCSDate`). Permet d'assainir les dates héritées d'App A.
  - ✅ **Dashboard - filtre du parcours AG par clôture d'exercice** (`20e1654`) : menu "Exercice clos le", regroupe les copros partageant la même échéance légale d'AG.
  - ⚠️ **Coffre - contrainte passkey/domaine** notée : `rpId = location.hostname` -> une passkey n'est valable que sur le domaine où elle a été créée, et les URLs de preview Vercel changent. Passkeys viables seulement sur `real31.app` (domaine stable). En attendant : mot de passe maître. Fix UX (bouton passkey conscient du domaine) reporté au domaine custom.
- **BACKLOG retours d'usage (test patron 2026-06-20)** - vide-cerveau trié depuis l'Inbox Obsidian :
  - 🧹 **Nettoyage / faux éléments** : ✅ accents jalons réglementaires · ✅ "Rappel Outlook" retiré (reformulé) · ✅ "PC AG Nomade" retiré · ✅ "Entreprises non retenues" retiré · ✅ "Dates CS+AG mises à jour" retiré (redondant) · ✅ accent "Retour à l'édition" ODJ · ✅ marque "Estale" partout (renommage `eStale` -> `Estale` dans tout `src` hors Mes emails ; décision Sekou : "Estale" pas "eStale") · 🔲 (optionnel) suppression anciens fichiers inutiles.
  - 📅 **Dates & cycle AG** (✅ lot fait 2026-06-20) : ✅ **RAZ des dates** (bouton "Effacer" sur `EditeurDate`) · ✅ conclure une AG -> bascule auto en "dernière AG" + efface la prochaine · ✅ **recalcul des jalons** propagé (revalide calendrier/dashboard/Actions au changement de date) · ✅ supervision : bouton "À vérifier" retiré (RAZ = recliquer le statut actif) · ✅ bouton "OK" retiré des champs date (fiche : sauvegarde auto ; supervision date : seul "Problème").
  - 🐞 **Bugs / logique** (2026-06-20, ✅ lot fait) : ✅ conclure exige un dossier complet (plus de conclusion d'une checklist vide) · ✅ bibliothèque /resolutions ne compte/affiche que les résolutions de tête (exclut les sous-résolutions de groupe) · ✅ supervision pré-remplit la date CS depuis la copro · ✅ listes = copros actives uniquement (inactives masquées).
  - 🔗 **Intégrations / navbar** : 🔲 liens vers nos apps dans la navbar · 🔲 contrat syndic -> `mandats.real31.app` · 🔲 sinistres -> `sinistres.real31.app` · 🔲 honoraires CS -> PowerApps · 🔲 récap AG -> Reality · 🔲 eStale : envoyer le rapport CS sur l'extranet (copros eStale only).
  - 🎨 **UI / polish SaaS** (audit multi-agents 2026-06-20, `docs/audit-ui-2026-06.md`) : ✅ demo-critiques (nav client-side, fausses affordances PV/CS, états vides Actions+calendrier, faux "+3 vs mai" retiré) + gains rapides (glyphe -> icône, tokens couleur, hover charte, accents palette, breadcrumbs) · 🔲 plus tard (cf. doc) : migration primitive Button + focus-visible, loading/skeletons, filtres KPI, feedback Toast d'erreur, code mort nav, doublon CTA supervision fiche.
  - 🎨 **UI / refontes restantes** : 🔲 refonte fiche Supervision AG · 🔲 vérif comptable remontée + repliée par défaut · 🔲 CR CS imprimable · 🔲 ODJ CS vs ODJ AG à distinguer · 🔲 clic n'importe où dans le dashboard -> fiche immeuble · 🔲 badge Crypto/Estale sur toutes les pages · 🔲 distinguer faisable-via-Estale vs Crypto.
  - 📣 **Système d'annonces (à développer)** : l'espace "Annonces" du dashboard est en place (placeholder "aucune annonce"). À construire : qui publie (direction / admin), portée (réseau / agence / service), persistance (table native), période d'affichage, accusé de lecture éventuel. Aujourd'hui : composant `annonces-panel.tsx`, données à brancher.
  - ❌ **Abandonné** : "Rajouter fiche reprise copropriété" (décision Sekou 2026-06-20 : on oublie).
- **MODULE DOSSIERS - brique 1 (2026-06-23)** : nouvel objet central. Un dossier = cas suivi rattaché à une copro, **typé** (travaux/sinistre/impayé/procédure/recouvrement), avec une **portée** (copro/copropriétaire/lot), un **statut**, des **étapes ÉDITABLES** (workflow NON figé - décision Sekou) et un **journal/timeline typée** (note/étape/statut/**email**/**appel** - prête à fusionner les emails rattachés puis les appels). Table native `intranet_dossiers` (SQL dans `docs/supabase-setup.md`, **à lancer** ; tolérant si absente). UI : `/dossiers` (liste + création) · `/dossiers/[id]` (fiche, étapes éditables, journal) · entrée sidebar "Dossiers" (Vue d'ensemble). Cloisonné managerId. **Vision** : brique 2 = créer un dossier depuis une résolution d'AG ; brique 3 = récap AG qui lit le PV (Estale structuré -> sans IA ; PV scanné Crypto -> OCR+IA) et **génère les dossiers de suivi**. IA = accélérateur ciblé (suggérer étapes, rédiger courriers), jamais dans le socle, toujours validée par l'humain. **ACTION SEKOU : lancer le SQL.**
- **CONSOLIDATION (2026-06-19)** : **tout est sur une seule branche `increment/02-supabase`** (= prod Vercel, un seul déploiement). Les branches `increment/03-coffre-mdp` et `increment/04-referentiel` ont été **mergées puis supprimées** (contenu intégralement dans 02). Poussé en prod (`4011a8d`).
- **AUDIT SaaS multi-agents (2026-06-19)** : audit 8 dimensions (sécurité, UI, UX, archi, a11y, perf, idées, code mort) + vérification adversariale + synthèse -> `docs/audit-saas-2026-06.md`. **Correctifs autonomes appliqués** (5 agents à périmètres disjoints) : **3 fuites de cloisonnement compta CORRIGÉES** (listerAgAPreparer/managerId, compta/[id] scopé, IDOR marquerNote), client Supabase singleton, getEtats borné, focus-visible + disabled + contrastes AA, rôles ARIA + labels + live regions. tsc 0, lint, 66 tests, build OK. **Restes audit** : durcissement auth, `service_role`->RLS, règle ESLint `boundaries` inopérante (à refixer), fausse recherche globale, mobile, + idées produit (alertes jalons, journal d'activité, dashboard cabinet).
- **Branche Git active** : `increment/02-supabase` (unique, = prod). `demo/mes-emails` traîne encore (autre worktree, contenu déjà dans 02).
- **Derniers incréments terminés** :
  - ✅ Increment 1 - Bootstrap (mergé via `increment/01-bootstrap`)
  - ✅ Migrations Supabase initiales (schéma complet sans RLS, commit 3d7f67c) - Increment 2 partiel, gelé sur le branchement cloud
  - ✅ Design system REAL31 (tokens Tailwind 4 @theme, primitives UI, app shell sidebar/topbar)
  - ✅ **Écran Dashboard** (mock, hexagonal complet : domain + port + adapter mock + service + page)
  - ✅ **Écran Calendrier AG/CS** (mock, 3 vues mois/semaine/liste, filtres types, agenda latéral)
  - ✅ **Écran Supervision AG** (mock, 5 sections × 34 items, Server Actions + `useOptimistic`, persistance module-level reset au restart `pnpm dev`, lien depuis chips AG du calendrier)
  - ✅ **Écran Fiche copro 360° light** (mock hexa, route `/copropriete/[code]` + liste `/copropriete`) : référentiel (port `CoproRepository`, source cible App A `public.Copropriete`) + blocs sourcés eStale mockés (port `CondoEstaleProvider` : Conseil Syndical, historique AG, conformité) + prochains événements (réutilise le calendrier). **Sans mini-map ni tantièmes** (décision 2026-06-09 -> ADR-013 déprécié). Onglets Contrats/Sinistres/Compta/Documents grisés (post-MVP). typecheck + lint + build OK.
  - ✅ **Écran Mes événements** (mock hexa, route `/mes-evenements`) : vue agrégée cross-copros - À traiter (actions + urgence), AG à venir (progression jalons X/5), copros sans AG planifiée. Patron provider d'écran (comme le Dashboard). Sélecteur « Mode supervision » omis (post-MVP, ADR-009). typecheck + lint + build OK. **-> 5 écrans MVP terminés.**
  - ✅ **1er branchement réel - référentiel copros sur Supabase** (2026-06-09, lecture seule, **Option C**, flag `COPRO_SOURCE=supabase`) : `SupabaseCoproRepository` lit `public.Copropriete`/`User` de la base `lgrsnrclufsulglbwcqi` (clone App A) -> liste `/copropriete` + fiches sur les **264 vraies copros**. Reste mock : événements, jalons, CS/historique détaillé/conformité (eStale, J4) + dashboard/calendrier/supervision/mes-événements. ⚠️ **Cloisonnement gestionnaire non appliqué** (service_role, RLS off sur `public`) -> à reconstruire au branchement Entra ID.
  - ✅ **Jalons réglementaires AG (ADR-006) - calcul** : `lib/domain/jalons-ag/` (couche légale décret 67-223 : convocation 21 jours francs ; défauts cabinet J-45 ODJ/devis, J-2 pouvoirs ; jours fériés FR fixes + mobiles ; calculateur = max légal/cabinet, jours francs avec recul au jour ouvré). **23 tests vitest** (ADR-019 tranché : runner = **vitest**). Câblé dans les **pastilles J-x du calendrier** (calculées, plus codées en dur).
  - ✅ **Jalons réglementaires AG - état (table `intranet_jalons`)** (2026-06-11) : table créée dans `public` de la base patron (RLS on, accès service_role), port `JalonRepository` + adapter Supabase (lit/écrit) + mock + service. **Fiche copro** : bloc "Jalons de la prochaine AG" avec **marquage interactif** (à faire / accompli / alerte) persisté. **1er écrit natif de l'intranet dans la base patron.**
  - ✅ **Tous les écrans branchés sur la vraie data (2026-06-11)** : Dashboard (compteurs/attention/activité dérivés), Calendrier (événements dérivés des dates AG/CS), Mes événements (AG à venir + X/5 jalons, copros sans AG), Fiche/Liste copros, et **Supervision AG** (checklist 34 items + visa, état dans `intranet_supervision_items`, id composite `CODE__DATE`). Bascule `COPRO_SOURCE=supabase`, pages en rendu dynamique, today réel ; le mock reste le fallback. **2 tables natives en écriture** : `intranet_jalons`, `intranet_supervision_items`.
  - ✅ **Cloisonnement gestionnaire (2026-06-11)** : session dev par cookie + page `/dev-login` (14 vrais gestionnaires dérivés de `Copropriete.managerId`/`User`), avatar topbar pour switcher. Toutes les requêtes copro filtrées par `managerId` (`CoproRepository.list/findByCode`, lecture supervision incluse) -> chaque gestionnaire ne voit que ses ~20-30 copros ; accès hors scope = 404. **Écritures aussi cloisonnées** (les actions jalons/supervision vérifient l'appartenance avant d'écrire, et signent avec les vraies initiales du gestionnaire). Enforced **en code** (pas RLS, car `public` est Prisma/service_role). Entra ID remplacera juste le sélecteur ; reste idéalement une RLS/vues en défense-en-profondeur.
  - ✅ **Préparation prod côté code (2026-06-11)** : **gate d'accès par mot de passe** (`proxy.ts` Basic Auth, `SITE_PASSWORD` défaut `real31`) - l'app expose la vraie data, donc plus exposable sans mot de passe tant qu'Entra ID n'est pas là ; **`app/error.tsx`** (frontière d'erreur, évite l'écran blanc si Supabase indispo). RGPD/mentions écartées pour l'instant (décision Sekou). Bloquants prod restants = **infra** (cf. prochaine action).
  - ✅ **Polish dashboard (2026-06-11)** : suppression des liens morts (bouton « Préparer une AG », cartes KPI, lignes « à traiter », « voir tout ») -> tout est cliquable et routé.
  - ✅ **Édition des dates de prochaine AG / CS (2026-06-11)** : sur la fiche, planifier / replanifier une AG ou un CS **non tenu** (sélecteur inline). Écrit `nextAGDate`/`nextCSDate` dans `public."Copropriete"` (source partagée App A, + `updatedAt`), scopé `managerId`, `null` = déplanifier ; se reflète partout (calendrier, dashboard, mes événements). Dérogation assumée à ADR-002 -> **ADR-023**.
  - ✅ **Refonte supervision + jalons sur le vrai process REAL31 (2026-06-11)** : checklist alignée sur la **fiche 450 « Couverture AG »** (5 phases : Avant CS · Après CS · Convocation · Documents pour l'AG · Après AG) + Vérifications comptables conservée ; 3 **champs date** (CS prépa, convoc, notif PV), le « CS préparatoire le » alimente le prochain CS (calendrier). **Jalons en cycle complet (9)** : + relance pouvoirs J-8, + post-AG scan contrat J+2 / notification PV J+30 (max 1 mois) / archivage J+180 (6 mois). 33 tests vitest. Contrainte de types de `intranet_jalons` étendue (SQL exécuté). La section « ODJ » est devenue un **module à part entière** (cf. ci-dessous, 2026-06-12).
  - ✅ **ODJ : vue imprimable + aperçu live + corrections métier (2026-06-12)** : route `/odj/[id]/imprimer` (PDF via le navigateur, rendu document partagé `DocumentOdj`) ; **aperçu live repliable** (panneau droit sticky 560px) dans l'édition ; corrections du document validées par Sekou : présents en **2 lignes** (syndic / CS), **bouton Visio oui/non**, **montants formatés** (4 500,00 EUR), **trop-perçu / dépassement calculé** (budget - dépenses, libellé adaptatif sans doublon), **ALUR retiré d'office** (restaurable), **renouvellement CS pré-rempli** (tous les membres, on retire), **contrat syndic** = prix actuel + % d'augmentation -> proposition calculée, dates limite/mise sous pli éditables (saisie prime sur le jalon).
  - ✅ **Module ODJ - document de préparation d'AG (2026-06-12)** : page `/odj/[id]` (CODE ou CODE__DATE, accès depuis la fiche), construite depuis le **vrai modèle REAL31** (« Modèle ODJ.dotx » + exemple 31 Foch fournis par Sekou). **Squelette auto** : en-tête pré-rempli (adresse, dates AG/CS avec **alerte si CS non planifié**, présents = gestionnaire + assistant + **membres CS depuis eStale**, **mise sous pli = J-30** [règle cabinet « 1 mois avant l'AG, pas tributaire de La Poste » -> le jalon CONVOC passe à J-30 partout, légal 21 j francs = plancher], **date limite ajout points = J-40**) ; ~10 **points légaux pré-écrits** (fonds travaux ALUR, LRE, renouvellement CS, PPT/DPE avec échéance selon nb de lots, IRVE, local vélo, AG hybride/AG Connect, loi Le Meur, qualité de l'eau), conditionnels marqués. **Édition persistée** (table `intranet_odj_champs`) : saisie inline qui prime sur l'auto (vider = retour auto), points retirables/restaurables, report sans-date -> daté en fixant la date d'AG. **Chaque champ porte sa SOURCE** (estale / supabase / jalon / manuel) : les chiffres comptables se rempliront au **branchement eStale (source primaire)**, pas de saisie définitive. 38 tests.
  - ✅ **LIEN ESTALE <-> INTRANET BRANCHÉ EN RÉEL (2026-06-12, Phase B ADR-022, J4 anticipé)** : c'est le **socle de lecture** de la plateforme. Détails :
    - **E1 client** `lib/adapters/estale/client.ts` : auth par **cookie de session** via un **compte de service unique** (login `POST https://api.estale.app/api/login` `{email,password}` -> cookie `estale`), `estaleGql()` sur `POST /graphql/intranet`, **re-login automatique sur 401/403** (refresh paresseux ADR-005), timeout 30 s, prêt pour la bascule `ESTALE_API_KEY` (Phase C) sans toucher les adapters. Endpoints **vérifiés en réel** (scripts `estale-discover.mjs` / `estale-health.mjs`, aucun secret loggé). Identifiants dans `.env.local` (cf. `.env.local.example`).
    - **Modèle d'accès (structurant)** : l'API eStale n'est **jamais** appelée par les 43 collaborateurs ; **un seul compte de service** côté serveur lit eStale, et le **cloisonnement reste appliqué côté intranet** (`managerId` Supabase). Les users se connectent à l'intranet (dev-login -> Entra ID), pas à eStale.
    - **E2 mapping** : pas de query liste cross-copros (ADR-022) -> on itère `me.collaborator.condos(archived:false)` et on rapproche par **référence normalisée** (`S0299` <-> `S299`) ; **les références font foi** (décision Sekou 2026-06-12), `externalIdEstale` non utilisé. Cache module 10 min.
    - **E3 `EstaleCondoProvider`** (`lib/adapters/estale/`) : `condo(id){ council, meetings }` -> **Conseil Syndical** (président en tête, échéance de mandat) + **historique des AG** (ORDINARY=AG sinon AGE, `pvDispo = transcript.validated`). Branché via le routeur quand `COPRO_SOURCE=supabase` **et** identifiants eStale présents ; sinon mock. **Vérifié en réel** : fiche **S299** + ODJ S299 affichent les 3 vrais membres du CS (présents CS + renouvellement CS pré-remplis).
    - **E4 - ODJ rempli depuis eStale (2026-06-12)** : c'est LE gros gain du module ODJ. Doc de référence : `docs/estale/apprentissage-estale.md` (auth, pièges, mapping complet, plan comptable copro). Branché :
      - **En-tête** : présents CS (`council`, format "NOM Prénom", inversions corrigées), AG visio (`meetingVideo`), PPT/DPE **auto selon l'âge** (`constructionDate` : PPT >15 ans, DPE <2013).
      - **Gestion** : contrats gaz/élec (`contracts`, `ENERGY_GAS/ELECTRICITY`), procédures (`litigation.count`).
      - **Vérification des comptes** : budget prévisionnel (`budgetOrdinary.amount`), **dépenses courantes** (compte `6`), **trop-perçu/dépassement calculé**, **consommation eau** (compte `601`, volume lu dans le libellé d'écriture, prix/m³), **fonds travaux** (compte `105`), **travaux votés** (`702Txx` appelé + `671Txx` dépensé, reliés par chantier), **copropriétaires débiteurs** (`owners.balance`, signalés si > 5% du budget).
      - Pièges capitalisés : `accountByNomenclature` capricieux (-> liste des comptes), noms inversés, `Daterange` = tableau, `litigation.items` vide. Requêtes compta isolées en try/catch. Vérifié de bout en bout sur **SE999** (compta de test alimentée).
      - Reste eStale : **vs N-1** (eau, budget) et **débiteurs fin d'exercice** (besoin d'un exercice précédent), **fonds placés** (502, plus tard), contrat de syndic. Champ "anciens propriétaires" retiré (inutile).
    - **Décision d'architecture (patron, 2026-06-12)** : **le référentiel = Supabase canonique (SUPERSET)**, pas eStale. Chaque copro est **dupliquée dans Supabase** (y compris celles gagnées sur eStale) car les **outils internes y ajoutent des champs propres** -> Supabase a PLUS de data qu'eStale. La duplication est faite par **les outils internes** (pas à la main). eStale = **enrichissement** (donnée transactionnelle qu'il possède) par référence. -> on **ne construit PAS** de référentiel-liste depuis eStale. Copro test **SE999** créée manuellement dans `Copropriete` (gestionnaire = Sekou, qui est un User en base).
- **Bloqueurs / en attente** :
  - 🔄 **Base Supabase cible (nouvelle base patron `lgrsnrclufsulglbwcqi`)** : clone du modèle + données de l'App A (Prisma `public`, `Copropriete` 264 / `User` 51, RLS off, pas de schéma `real31_intranet`). **Option C branchée en lecture seule le 2026-06-09** (`COPRO_SOURCE=supabase`, `.env.local` local) : on lit `public.Copropriete`/`User` comme référentiel. Restent ouverts : (a) **confirmer la gouvernance avec le patron** (référentiel partagé assumé ? convergence App A dès le MVP ?) ; (b) **stockage des données natives** : décision 2026-06-09 = **abandon du schéma `real31_intranet`**, tables natives créées directement dans `public`. **3 tables natives créées** (OK Sekou ; RLS on, service_role) : `intranet_jalons` + `intranet_supervision_items` (2026-06-11) + `intranet_odj_champs` (2026-06-12). Reste à **border le drift Prisma** avec le patron : **base partagée = deploy-only, jamais de `migrate reset`/`db push --accept-data-loss`** (sinon nos tables `intranet_*` sont droppées). Consigne détaillée rédigée pour le Claude Code du patron, prête à transmettre. ; (c) **cloisonnement gestionnaire** à reconstruire (RLS/vues) au branchement Entra ID. Cf. memory `project_supabase_mutualisation.md`.
  - ✅ **Dashboard - parcours AG guidé (2026-06-16)** : le dashboard ne montre plus seulement l'urgence, il **raconte l'ordre des opérations**. Nouvelle section « Préparer une AG, étape par étape » : une frise **Dates -> ODJ -> Convoc -> Tenue -> PV** par copro en cycle, étape courante surlignée, **bouton de la prochaine action** (Fixer / ODJ / Supervision) en bout de ligne + échéance (J-xx, « à dater », « en retard »). Calcul d'étape sur du réel : date d'AG fixée (Dates) + jalons accomplis `ODJ_CS`/`CONVOC`/`TENUE`/`NOTIF_PV`. Apparaissent : AG à venir (<=150 j) ou récente non close (>=-90 j), **et** copros sans date dont l'AG est due (~12 mois). Pensé pour qu'un junior comprenne par où commencer. **Consolidé (2026-06-16)** : l'étape Dates exige désormais **CS + AG** (CS à venir planifié, ou CS de prep tenu < 150 j avant l'AG) ; l'échéance « AG due » est **ancrée sur le délai légal** (clôture de l'exercice `accountingEndDate` + 6 mois d'approbation des comptes), avec repli « dernière AG + 12 mois » si l'exercice est inconnu - fini le seuil heuristique. **Porté sur la fiche copro (2026-06-16)** : carte « Où en est cette AG » (même frise + prochaine action) en tête de fiche ; logique extraite dans un module domaine partagé `lib/domain/parcours-ag.ts` (frise mutualisée `components/parcours/frise-etapes.tsx`), réutilisée par le dashboard ET la fiche.
- 🔄 **ODJ / résolutions = motion bank eStale (décision 2026-06-17, ADR-024)** : exploration de l'API eStale -> la **bibliothèque de résolutions existe déjà** (motion bank, 3 niveaux : cabinet / gestionnaire / copro). Le **cabinet REAL31 a 109 résolutions** prêtes (majorité pré-réglée A24/A25/A25_1/..., 95 par défaut), lisibles via le compte de service (`scripts/estale-motion-bank.mjs`). Décision : **on ne reconstruit RIEN** ; l'intranet **orchestre** (lit la bank, compose l'ODJ en mode CS, pousse les motions dans le `Meeting` eStale via `createMotionsFromBank`/`createMotion`, circuit de validation interne, puis convocation `invitation` dans eStale). **Pas de table `intranet_odj_resolutions`** (idée abandonnée). Le **mode CS en direct** (choix Sekou) se construit par-dessus. **1ère brique livrée (2026-06-17)** : écran **lecture seule** `/resolutions` (nav « Résolutions ») - port `bibliotheque-resolutions` + adapter eStale (`establishment.motionsBank`) + mock + vue (recherche mot-clé, filtre par majorité, badges standard/article). Testé sur la vraie bank (109 résos, 95 standard). Dégrade proprement si eStale down. **Mode CS - composition livrée (2026-06-17)** : route `/odj/[id]/composer` (bouton « Mode CS » sur l'ODJ) - 2 colonnes : picker bibliothèque (recherche/filtre, 109 résos) + **ODJ en construction** (ajout, ordre haut/bas, retrait, **résolution libre** avec majorité). **Brouillon client uniquement** (pas encore de persistance ni d'écriture eStale). **Décisions Sekou (2026-06-17)** : (A) **le brouillon vit dans eStale** (Meeting + motions pré-convocation, zéro stockage intranet) ; (B) **l'intranet CRÉE l'AG** de bout en bout. Séquence d'écriture eStale : `createMeeting(condoID, accountingID, dkID, name, category, participantsIDs)` -> `updateMeeting().update(MeetingUpdateInput)` (date) -> `createMotionsFromBank(itemIDs)` + `createMotion()` -> `orderMotions()` -> (plus tard) `invitation` (convocation). Tout est `isDeletable` (réversible). **1er WRITE réel VALIDÉ (2026-06-17)** : `createMeeting` fonctionne (scripts `estale-list-condos`/`estale-ag-pieces` lecture + `estale-creer-ag-test`/`estale-supprimer-ag` write gardés `--go`). **Découverte clé : créer une AG `ORDINARY` auto-injecte le socle standard (11 motions)** = le « template de base » est natif eStale -> le **mode CS sert à AJOUTER** les résolutions spécifiques par-dessus. **Piège copro test** : la copro test eStale = **`SE999` « 31 rue de l'Estale - test »** (PAS `S0299` « 64 Rue de l'Aigle », une VRAIE copro - une AG y avait été créée par erreur puis **supprimée**). SE999 a **déjà** une AG ORDINARY (30/06/2026, 11 motions) -> au wiring, décider créer-vs-réutiliser. **Confirmé (2026-06-17)** : **eStale produit la convocation officielle** (`invitation` -> ODJ + rappel majorités + projet de résolutions avec texte légal complet + clé de répartition ; réf `docs/Convoc de base.pdf`, 16 résos standard REAL31). L'intranet = **prépa + orchestration** ; sa « version imprimable » ODJ = aide de prépa, PAS l'officiel. La bank eStale contient déjà l'essentiel des standards REAL31 (délégation CS, consultation CS, mise en concurrence, dématérialisation, quitus, budget...) -> le picker du mode CS donne accès à tout. **Décision Sekou (2026-06-17) - mode CS = éditeur ODJ complet** : le socle par défaut se règle **dans eStale** (résolutions types cabinet, action de Sekou - l'intranet en hérite) ET le **mode CS édite l'ODJ complet de l'AG** (charge les motions réelles socle + ajouts ; retirer / réordonner / ajouter ; API `createMotion`/`createMotionsFromBank`/`deleteMotion`/`orderMotions`/`updateMotion`). **Build par paliers** : (1) ✅ **lecture livrée (2026-06-17)** = le mode CS charge et affiche l'AG eStale réelle (`AssembleeEstaleProvider` : port + adapter + mock + service `get-assemblee` ; section « Déjà dans l'AG eStale », lecture seule) - validé sur SE999 (AG « Assemblée Générale Ordinaire » + motions) ; (2a) ✅ **écriture - AJOUT livré (2026-06-17)** : bouton « Enregistrer » -> ajoute les résolutions composées dans l'AG eStale (Server Action `enregistrerProjetAction` -> service -> `AssembleeEstaleProvider.ajouterAuMeeting`). **Découverte : `createMotionsFromBank` refuse les ids de bank ÉTABLISSEMENT** (il faudrait copier au niveau copro d'abord) -> on utilise **`createMotion`** en re-récupérant le contenu complet de la bank (titre/corps/majorité/préambule) = fidélité. `type` motion = `generic` (résolution) ou `group`. Validé sur SE999 (11->13 puis nettoyage). ; (2b) ✅ **retrait + réconciliation livré (2026-06-17)** : on peut **retirer** les motions existantes (bouton X sur « Déjà dans l'AG », barré + annulable) ; « Enregistrer » **réconcilie** l'AG eStale (supprime les retirées via `deleteMotion` + ajoute les nouvelles) -> **contrôle total** (choix Sekou : ses 16 exacts, à la main). Gestion des AG **clôturées** (lecture seule). **Affichage groupes** ✅ (motions `type:group` en gras + sous-résolutions `parent` indentées) + **bannière clôturée/absente** ✅ (boutons d'ajout désactivés). ; (3) ✅ **createMeeting depuis l'UI livré (2026-06-17)** : bouton « Créer une nouvelle AG » dans la bannière -> `creerAssemblee` (résout condo/exercice/clé défaut/participant + `createMeeting` ORDINARY, socle auto) + confirm + refresh. Cas reconvocation (comptes refusés). ; (2c) ✅ **réordonnancement livré (2026-06-17)** : flèches monter/descendre sur les motions de tête dans « Déjà dans l'AG » (les sous-résolutions suivent leur groupe) ; « Enregistrer » applique l'ordre via `orderMotions` (rangs hiérarchiques top `"1","2"..` + enfants `"N.j"`, set complet exigé par eStale). Bouton « Enregistrer » cliquable même sans modif (message « AG déjà à jour »). ; **groups à l'AJOUT** ✅ (2026-06-17) : le picker affiche les **8 groupes** de la bank avec leurs sous-résolutions imbriquées (« Ajouter le groupe » ajoute le groupe + ses enfants) ; à l'écriture, les sous-résolutions sont créées (à plat, votables - l'en-tête de groupe est ignoré). **Découverte** : `createMotion(parentID)` sert aux sous-motions de VOTE, pas au nesting d'affichage ; le nesting eStale est **basé sur le rang** via `orderMotions` (set complet exigé). ; **nesting complet livré (2026-06-17)** : la réconciliation d'ordre est désormais **serveur** (`appliquerOdj(coproCode, meetingId, supprimer, bankIds, libres, ordreTopExistant)`) - relit l'AG, place l'existant (ordre voulu) + les nouvelles, et assigne les rangs hiérarchiques de TOUT l'ODJ via `orderMotions`. Les groupes ajoutés (en-tête + sous-résos) se **nestent** (validé : ENEDIS -> rang 10 + 10.1..10.6 sous le groupe). `createMotion(parentID)` = sous-motions de VOTE only ; le nesting d'affichage = par rang. ; **Socle REAL31** 🔲 (bouton « Appliquer mon socle » = ses 16, à définir depuis `Convoc de base.pdf`). Renforce ADR-005 (writes au nom du compte connecté). **Dev en parallèle** : scope « Mes emails » développé sur branche `demo/mes-emails` (autre agent Claude Code, worktree `real31-intranet`) ; **audité puis intégré dans `increment/02-supabase` le 2026-06-18** (cf. entrée « Mes emails » ci-dessous).
- 🔄 **Pôle compta - aller-retour gestionnaire/comptable (2026-06-18)** : régler le pb « après le CS on oublie de répondre aux notes de la comptable -> comptes faux à la convocation ». Par copro+AG : **fil de notes** (comptable pose questions/remarques, gestionnaire répond, chaque note marquable « traitée ») + flags **« comptes vérifiés »** (comptable) et **« envoyer au CS avant la réunion »** (gestionnaire). **Vue comptable dédiée** `/compta` (nav « Pôle compta ») : file des AG à préparer (date posée) + statut + notes ouvertes ; détail `/compta/[copro__date]` = `ComptaPanel` (role comptable). **Côté gestionnaire** : panneau « Préparation comptable » sur la fiche copro (role gestionnaire, répond aux notes). Archi : domaine `compta.ts` + port `compta-repository` + adapter Supabase (notes = **nouvelle table `intranet_compta_notes`**, flags = `intranet_odj_champs`) + mock + service `get-compta` + Server Actions. Dégrade proprement si la table n'existe pas encore. **À ACTIVER** : lancer le `CREATE TABLE intranet_compta_notes` (SQL fourni) dans Supabase (4e table native, RLS on, service_role). **Notif comptable** = in-app pour l'instant (l'AG remonte dans sa file dès la date posée) ; **mail auto via Graph = plus tard** (dépend de l'app Azure, comme le SSO).
- 🔄 **Mes emails - tri IA des mails syndic, mock (intégré 2026-06-18, post-MVP)** : onglet `/mes-emails` (nav « Mes emails ») = **cockpit 2 volets** (boîte triée à gauche, mail + analyse + réponse + flow d'actions à droite). Multi-copros, statut lu/non-lu et Nouveau/Répondu/Classé, dossiers Reçus/Traités/Tous, rattachement éditable, pièces jointes. **But** : transformer une boîte de centaines de mails en worklist actionnable. Archi hexagonale : domaine `mes-emails.ts` + port `MesEmailsProvider` + adapter **mock anonymisé (zéro PII)** + service via le routeur ; l'enrichissement **contexte copro réutilise le port existant `CondoEstaleProvider`** (CS, AG, comptes...) avec dégradation propre. **100% mock / état client** (pas d'analyse réelle, pas de mail live, interactions reset au reload) -> zéro écriture infra. **Branchement réel plus tard** derrière un port `AnalyseMailProvider` (swap d'adapter : mock -> API -> IA locale, UI inchangée). Développé en parallèle (branche `demo/mes-emails`, autre agent), **audité** (typecheck/lint/build OK, isolation hexagonale conforme, eStale réutilisé, pas de PII) puis **squashé** dans increment en 1 commit (le commit parasite `f637843 mode-cs`, déjà présent via `a54e885`, volontairement écarté). Détail : `docs/mes-emails.md`.
- 🔄 **SSO Microsoft Entra ID - code prêt (2026-06-16, J1b anticipé)** : **Auth.js v5** (ADR-017) branché - provider Microsoft Entra ID (`src/auth.ts`), route `/api/auth/[...nextauth]`, login -> email -> gestionnaire (`User.findByEmail`) -> cloisonnement `managerId` inchangé. **Fallback dev-login** tant que les identifiants sont absents (rien ne casse). Le gate mot de passe se désactive quand le SSO est actif. Vars **alignées sur le projet App A du patron** (`AUTH_MICROSOFT_ENTRA_ID_ID/SECRET/ISSUER` + `AUTH_SECRET` + `AUTH_URL`, même tenant). **Bloqueur** : le patron crée une **App Registration dédiée `REAL31 Intranet`** (option B retenue pour la robustesse, pas de mutualisation avec l'App A) et fournit client ID + secret + tenant (instructions « Étape 1 SSO » en tête de `docs/entra-app-registration.md`). Ensuite : poser les vars + tester le login réel.
- 🔄 **Gestionnaire de mots de passe maison - zero-knowledge (décidé 2026-06-18, ADR-025, branche `increment/03-coffre-mdp`)** : coffre-fort pour le réseau (4 agences, 4 services, ~40 collaborateurs), 3 niveaux (réseau / service **transversal** / perso ; agence **latent**). **Build maison** mais sur **briques OSS auditées** (Web Crypto + SimpleWebAuthn/PRF + noble/hash-wasm, modèle Bitwarden/Padloc) - pas de crypto from-scratch, pas de coût par siège, pas de Docker (serverless). **Déverrouillage passkey/Windows Hello** (PRF) en primaire, master password en repli, recovery code + escrow admin. **SSO Entra = authn, jamais la clé.** Modèle générique `vault.scope` médié par `pm_membership` (RLS uniforme, défense en profondeur ; le vrai rempart = la crypto). **5 phases** (chacune validée) : (1) socle crypto + identité + pont MSAL->JWT ; (2) coffre perso end-to-end ; (3) coffres partagés (octroi par client admin) ; (4) import Excel (parse navigateur, jamais en clair au serveur) ; (5) coffre très sensible step-up + rotation/révocation + audit. **v1 = phases 1-4.** **Livré (2026-06-18)** : ADR-025 + schéma SQL (8 tables `intranet_pm_*`, jsonb pour les artefacts crypto, RLS, seed des 4 services). **Phase 1 ✅** : coeur crypto Web Crypto (ECDH P-256 + AES-GCM + ECIES + PBKDF2/HKDF) + 9 tests ; domaine/ports/adapters (mock + Supabase service_role) + test d'intégration bout en bout. **Phase 2 ✅** : écran `/coffre` (enrôlement mot de passe maître, coffre perso, ajout/lecture de secrets), **persistance Supabase OK** (vérifiée par Sekou). **Passkey/Windows Hello (PRF) ✅** : WebAuthn natif, déverrouillage par empreinte, **validé sur le poste de Sekou** (PRF supporté). **Phase 3 ✅** : coffres partagés réseau/service (octroi par client admin, enrobage vers la clé publique des membres), gestion des membres (annuaire, octroyer/retirer), badge de scope. **Phase 4 ✅** : import **CSV** (parsing 100% navigateur, chaque ligne chiffrée côté client avant envoi ; mapping calé sur le modèle REAL31 Entité/Immeuble/Entreprise/Identifiant/Mot de passe/Autre info ; dédup ; 9 tests). Export Excel->CSV côté user ; .xlsx natif possible plus tard. **Édition / suppression + audit ✅ (livré 2026-06-19)** : CRUD complet sur les secrets (éditer = re-chiffrement client, supprimer avec confirmation, scopé au coffre) + **journal d'audit** table native `intranet_pm_audit` (create/update/delete/import, **métadonnées seulement, jamais le contenu** ; écriture best-effort ; vue Historique par coffre). **Reste** : phase 5 restante (coffre très sensible step-up + rotation/révocation de clé au départ d'un membre), durcissement RLS (pont d'identité Auth.js->JWT Supabase ; aujourd'hui service_role + contrôle en code — confirmé par l'audit sécurité demandé par le patron le 2026-06-18). **Gouvernance des rôles ✅ (livré 2026-06-19, demande Sekou 2026-06-18)** : **admin global** (colonne `is_admin` sur `pm_user`, distinct du rôle par coffre). Seuls les admins **créent des coffres partagés** et **gèrent les membres** (contrôle serveur + UI masquée pour les non-admins). **Vue Administration** (admins) : promouvoir / rétrograder. **Bootstrap** : le 1er collaborateur enrôlé devient admin auto ; garde-fou anti-blocage (pas d'auto-rétrogradation). Pour un compte déjà enrôlé (Sekou) : `UPDATE intranet_pm_user SET is_admin=true WHERE azure_oid='<son id>'`. **Journal d'audit ✅ (livré 2026-06-19, demande Sekou 2026-06-18)** : table `intranet_pm_audit`, actions create/update/delete/import tracées (métadonnées only, jamais le contenu), vue Historique par coffre ; consultation pourra être ajoutée plus tard. **Prochaine action** : exécuter dans Supabase le `CREATE TABLE intranet_pm_audit` ET l'`ALTER TABLE intranet_pm_user ADD is_admin` (+ `UPDATE ... is_admin=true` pour Sekou), puis tester édition/suppression/historique + Administration. **Reste sur le coffre** : durcissement RLS (pont d'identité Auth.js->JWT, souligné par l'audit sécurité du patron) + rotation de clé au départ d'un membre. **Finitions UX ✅ (2026-06-19)** : recherche texte multi-termes + **multifiltrage** (copropriété + entreprise) ; correction d'**encodage CSV** (UTF-8/Windows-1252 -> fini les accents cassés `�` sur les nouveaux imports ; les entrées importées AVANT le correctif restent cassées en base -> supprimer + ré-importer) ; placeholders `-` traités comme vides (import + affichage). **Guide collaborateur ✅** : `docs/guide-collaborateur.md` (mode d'emploi end-user : coffre-fort + passkey ; extensible aux autres modules). **À VENIR / parké (non demandé pour l'instant, 2026-06-19)** : (a) **durcissement RLS** = pont d'identité Auth.js->JWT Supabase pour activer `auth.uid()` (aujourd'hui service_role + contrôle en code ; souligné par l'audit sécurité du patron 2026-06-18) ; (b) **rotation de clé au départ d'un membre** (le retrait coupe l'accès futur mais ne re-chiffre pas la clé du coffre) ; (c) **clé de secours / recovery code** (oubli du mot de passe maître ; l'UI le mentionne déjà comme "à venir") ; (d) **coffre très sensible** (tier step-up, colonne `sensitivity` déjà prévue) ; (e) optionnels : import **.xlsx natif** (lib maintenue), **bouton "vider le coffre"** (ménage de masse). **v1 livrée ; en plus : passkey, édition/suppression, audit, partage, gouvernance des rôles, recherche/filtres, guide. STOP demandé par Sekou le 2026-06-19 (pause sur le coffre).**
- **Prochaine action concrète** : **gestionnaire de mots de passe (ADR-025) EN PAUSE** depuis le 2026-06-19 (branche `increment/03-coffre-mdp`, ~23 commits, tout poussé) = v1 complète + passkey + édition/suppression + audit + partage + gouvernance des rôles + recherche/filtres + guide collaborateur. **Reprise possible** sur l'un des items parkés (cf. entrée ci-dessus : durcissement RLS, rotation de clé, recovery code, coffre très sensible). **Branche non encore mergée** dans `increment/02-supabase` (à décider : merge ou garder séparée). Le mode CS ODJ/résolutions est livré (cf. ci-dessus). En parallèle, **SSO** = le patron crée l'**App Registration dédiée `REAL31 Intranet`** (option B) et nous transmet client ID + secret + tenant -> on pose les vars (noms Auth.js) et on **teste le login réel**. Pistes restantes : section **gestion courante** (narratif manuel), reste eStale (vs N-1, fonds placés), **compte de service eStale dédié** (prod, ADR-005). (Expo) infra : `db pull` patron (3 tables) + Vercel. **Backlog** : MYTHEC (facturation dépassement) ; **gestion des dossiers sinistres sur l'intranet** (eStale n'a pas de module sinistre - décision Sekou 2026-06-16) ; **générateur d'étiquettes BAL** (boîtes aux lettres, quick win sans DSI).

---

**Hypothèses de chiffrage** :
- 1 développeur, à plein temps ou quasi
- Mocks d'abord, branchements progressifs
- Validation manager continue (tests utilisateur informels chaque semaine)

**Légende** :
- 🔲 À faire
- 🔄 En cours
- ✅ Fait
- ⏸️ En attente (dépendance externe)
- ⚠️ Risque / blocage actif

---

## Périmètre MVP - rappel

- **Profils** : 4-7 **gestionnaires réels** du cabinet, cloisonnés strict (chacun voit ses copros uniquement). Cf. ADR-009.
- **Surcouche de coordination** au cœur (cf. ADR-008), mais le périmètre produit s'élargit désormais vers une plateforme unique à 8 modules (cf. ADR-021 et la section "Vision produit élargie" plus bas). Le MVP, lui, reste strict.
- **Modules MVP** : Planification CS/AG + Fiche copro 360° light + alertes basiques.
- **5 écrans** (cf. mockup) : Dashboard, Calendrier, Mes événements, Fiche prépa AG, Fiche copro 360°.
- **Hors MVP explicite** : tout le reste. Génération PDF, contrats, registre des mandats (app A), divers syndic, compta. Aucune anticipation de ces modules dans le code tant que les 5 écrans ne sont pas livrés.

---

## J0 - Préparation (en parallèle de J1a/J1b, ~1-2 semaines)

Phase **sans code applicatif**. On déverrouille les dépendances externes et on prépare les artefacts d'entrée.

- 🔄 **App Registration Entra ID** (cf. `docs/entra-app-registration.md`, note « Étape 1 SSO » en tête) : **code SSO prêt** (Auth.js v5, mêmes noms de vars que l'App A du patron), il manque que le **patron crée une app dédiée `REAL31 Intranet`** (option B) et nous donne client ID + secret + tenant. Mail/SharePoint = étapes ultérieures.
- 🔲 Dépôt des artefacts par le user :
  - ✅ `real31-mockup.html` (référence UX, à la racine - pas dans `docs/`)
  - 🔲 `docs/estale-schema.json` (introspection GraphQL via `npx get-graphql-schema`)
  - 🔲 `docs/sharepoint-exports/` (exports bruts CSV/JSON des listes)
- 🔲 Production de :
  - 🔲 `docs/sharepoint-inventory.md` - inventaire structuré des listes SharePoint, mapping vers types domaine, signalement des champs ambigus
  - 🔲 Vérification que le schéma eStale couvre bien les besoins MVP
- 🔲 Création des comptes Vercel, Supabase (org EU), accès partagés

**Critère de sortie de J0** : on a la matière pour brancher SharePoint en J3 sans surprise majeure.

---

## J1a - Fondations techniques (sans dépendance DSI, semaines 1-2)

Squelette technique + auth **mock** pour pouvoir avancer pendant que la demande Entra ID circule. La séparation J1a / J1b est explicite pour ne pas être bloqué.

**Plan détaillé en 5 incréments** (cf. message de séquencement). Validation à chaque incrément avant de passer au suivant.

### Increment 1 - Bootstrap projet ✅ (mergé via `increment/01-bootstrap`)
- ✅ Repo Git initialisé
- ✅ `pnpm create next-app` - Next.js 16, TypeScript strict, App Router, ESLint, Tailwind (Node 22 LTS pin via fnm)
- ✅ Règle ESLint d'**isolation des adapters** (cf. ADR-001) - boundaries plugin
- ✅ Scripts package.json (`dev`, `build`, `lint`, `typecheck`)
- ✅ Scaffold `lib/` (domain, ports, adapters, services, jobs, audit, auth)
- ✅ README projet + page d'accueil J1a brandée
- ✅ Deploy Vercel : page vide propre
- **Validation** : ✅ `pnpm lint && pnpm typecheck && pnpm build` passe

### Increment 2 - Supabase + schéma initial 🔄 (branche `increment/02-supabase`)
- ✅ Supabase CLI installé + scaffold du projet local (commit 20302fa)
- ⏸️ Projet Supabase EU créé - **gelé en attendant décision mutualisation patron**
- 🔲 Variables d'env Vercel + `.env.local` documentées
- ✅ Migrations Supabase initiales (commit 3d7f67c, RLS désactivée comme prévu) :
  - ✅ `users`, `gestionnaires_mapping` (porté par `users.gestionnaire_initials` - cf. ADR-010)
  - ✅ `copros` (avec `source` discriminateur, `gestionnaire_initials`, lat/lng - cf. ADR-003, ADR-013)
  - ✅ `evenements`, `jalons`, `item_odj`, `presence_pre_ag`, `membres_cs`
  - ✅ `cabinet_settings`
  - ✅ `audit_log`, `activity_log` (cf. ADR-007)
  - ✅ `job_runs` (cf. ADR-004)
- 🔲 Client Supabase typé (codegen depuis le schéma)
- ✅ RLS **pas encore activée** (volontairement - increment 5)
- **Validation** : 🔲 tables visibles dans Supabase dashboard cloud + insert/select depuis le code (bloqué par mutualisation)

### Increment 3 - Mock auth + session
- 🔲 Provider d'auth dev : page `/dev-login` (réservée `NODE_ENV !== 'production'`) avec liste des gestionnaires fictifs (FS, KN, OR, SC + 1-2 autres)
- 🔲 Cookie de session signé (encapsulé pour swap futur vers Entra ID)
- 🔲 Middleware Next.js qui injecte la session dans le contexte des Server Actions et Route Handlers
- 🔲 Header UI avec nom/avatar + bouton déconnexion
- 🔲 Garde de route : tout `/app/**` redirige vers `/dev-login` si pas de session
- **Validation** : login en dev, nom dans header, déco fonctionne, route protégée respecte la garde

### Increment 4 - Audit middleware + activity_log + withAudit helper
- 🔲 Helper `withAudit({ action }, fn, { activity? })` (cf. ADR-007)
- 🔲 Capture du contexte utilisateur (ip, user-agent, user_id)
- 🔲 Écriture transactionnelle dans `audit_log` (+ `activity_log` si applicable)
- 🔲 Une route de test (Server Action) qui appelle `withAudit` pour valider de bout en bout
- 🔲 Page admin minimale `/admin/audit` (table append-only, recherche basique)
- **Validation** : action déclenche entrée `audit_log` ET `activity_log` quand applicable, visible sur `/admin/audit`

### Increment 5 - RLS sur copros + MockCoproAdapter + page de test
- 🔲 Activer RLS sur `copros`, `evenements`, `jalons`, `activity_log` (cf. ADR-011)
- 🔲 Policy MVP : "gestionnaire voit ses copros via `gestionnaire_initials`"
- 🔲 `MockCoproAdapter` retournant 15 copros fictives réparties sur les 4-6 gestionnaires
- 🔲 Seed `users` + `copros` avec des données mock cohérentes
- 🔲 Page test `/dev/copros` qui liste les copros visibles selon le user connecté
- 🔲 Tests : login FS -> 4 copros visibles. Login KN -> 3 autres. Aucune fuite.
- **Validation** : la RLS bloque effectivement les accès hors scope (vérifier en SQL direct aussi)

**Critère de sortie de J1a** : 5 incréments validés. La fondation tient. On peut commencer à construire les 5 écrans du mockup avec données mock, en attendant que J1b débranche le mock auth.

---

## J1b - Branchement Entra ID (déclenché par livraison DSI)

⏸️ **Dépendance bloquante** : retour App Registration du DSI.

- 🔲 Récupération des credentials (client ID -> `AUTH_MICROSOFT_ENTRA_ID_ID`, secret -> `AUTH_MICROSOFT_ENTRA_ID_SECRET`, tenant -> `AUTH_MICROSOFT_ENTRA_ID_ISSUER`)
- 🔲 Décision ADR-017 : Auth.js v5 vs implémentation custom
- 🔲 Remplacement du mock auth par le vrai provider Entra ID
- 🔲 Page `/admin/users` pour mapper les vraies initiales aux vrais emails
- 🔲 Test SSO bout en bout : connexion d'un vrai compte M365 -> session OK -> copros filtrées
- 🔲 Suppression définitive de `/dev-login` en prod (env-guard)
- **Validation** : un vrai gestionnaire REAL31 peut se connecter avec son compte M365 et voir ses copros

---

## J2 - MVP fonctionnel avec MockProvider (semaines 3-4)

Construction des 5 écrans avec données mock. Si J2 fonctionne, le reste est du branchement.

- 🔲 Types domaine complets (cf. liste exhaustive dans ADR-001)
- 🔲 Ports : `CoproRepository`, `EvenementRepository`, `JalonRepository`, `ItemODJRepository`, `ActivityLogRepository`
- 🔲 `MockCoproAdapter`, `MockEvenementAdapter`, etc. avec données réalistes (10-15 copros, événements répartis sur 3 mois, jalons à différents états)
- ✅ Lib `lib/domain/jalons-ag/` (cf. ADR-006) - **calcul fait** (2026-06-09), câblé dans les pastilles du calendrier ; état des jalons en base à venir :
  - ✅ `legal/` : constantes immuables (décret 67-223, convocation 21 jours francs) + tests
  - ✅ `cabinet/` : defaults REAL31 (J-45 / J-2) ; table `cabinet_settings` (surcharge) à brancher plus tard
  - ✅ Calculator + jours fériés FR, 23 tests vitest (ADR-019 = vitest)
- 🔄 5 écrans Next.js fidèles au mockup :
  - ✅ Dashboard (compteurs actionnables, attention, flux activité) - hexa mock complet
  - ✅ Calendrier AG/CS (3 vues mois/semaine/liste, filtres, agenda latéral) - hexa mock complet
  - ✅ Supervision AG (5 sections × 34 items, Server Actions + `useOptimistic`, visa final) - renomme "Fiche prépa AG" du périmètre initial, scope élargi vers une vraie checklist de supervision
  - ✅ Mes événements (à traiter, AG à venir, copros sans AG) - mock hexa, route `/mes-evenements`
  - ✅ Fiche copro 360° light (vue d'ensemble, événements, historique AG) - **mini-map Leaflet et tantièmes retirés** (ADR-013 déprécié) ; CS/historique AG/conformité = blocs sourcés eStale, mockés en attendant J4
- 🔲 Découpage Server / Client Components documenté dans `docs/component-strategy.md`
- 🔲 Tests E2E (Playwright) sur le parcours golden

**Livrable démontrable** : "un gestionnaire peut naviguer dans toute l'app avec des données fictives, voir ses jalons, marquer des actions comme accomplies."

---

## J3 - Branchement SharePoint (semaines 5-6)

Remplacement progressif du `MockCoproAdapter` par le vrai sur les copros source SharePoint.

⏸️ **Dépendance** : J1b livré + sites SharePoint allowlistés par DSI.

- 🔲 Client Graph API robuste (`lib/adapters/sharepoint/graph-client.ts`) :
  - Auth client_credentials
  - Retry + backoff exponentiel + jitter
  - Respect throttling (`Retry-After`)
  - Pagination (> 10k items)
- 🔲 `SharePointCoproAdapter`, `SharePointEvenementAdapter` (lecture seule)
- 🔲 Mappers SharePoint -> Domain documentés (cf. `docs/sharepoint-inventory.md`)
- 🔲 Tables miroir Supabase (`mirror_copros`, `mirror_evenements`...)
- 🔲 Job `sync-sharepoint-nightly` (Vercel Cron, 3h du matin)
- 🔲 **Géocodage Nominatim** intégré au sync (cf. ADR-013)
- 🔲 Page admin `/admin/jobs` avec runs récents
- 🔲 Alerting : pas de sync depuis 36h -> mail manager
- 🔲 Bouton "rafraîchir cette copro" -> sync ciblé

**Livrable démontrable** : "les gestionnaires voient leurs vraies copros REAL31, à jour de la veille, avec mini-map fonctionnelle."

---

## J4 - Branchement eStale (semaines 7-8)

Mêmes pages, mais pour les 4 copros pilotes eStale.

- 🔲 Setup compte de service eStale (cf. ADR-005)
- 🔲 Client GraphQL eStale (`lib/adapters/estale/graphql-client.ts`) :
  - Auth session cookie + relogin paresseux sur 401
  - Rate limit interne à 50 req/s (vérifié par introspection du schéma, cf. ADR-002/ADR-022)
- 🔲 Codegen GraphQL (graphql-codegen) basé sur `docs/estale-schema.json`
- 🔲 `EstaleCoproAdapter`, `EstaleEvenementAdapter`
- 🔲 Routeur d'adapters (`lib/adapters/router.ts`) lisant `copros.source`
- 🔲 Job `refresh-estale-stale-entries` (Vercel Cron horaire)
- 🔲 Tests de bascule : marquer une copro `source = 'estale'`, vérifier que le job SharePoint l'ignore
- 🔲 Page admin "bascule source"
- 🔲 Badge `Source : Crypto/eStale` + bouton "Ouvrir dans eStale" (cf. ADR-003, ADR-012)

**Livrable démontrable** : "les 4 copros eStale apparaissent à côté des 164 SharePoint, indistinctement pour l'UI."

**Critère de sortie de J4** : aucune fuite SharePoint/eStale dans les Server Components. L'ESLint d'isolation tourne sans erreur.

---

## J5 - Alertes, mails, automatisations, audit complet (semaines 9-11)

Passage de "consultatif" à "proactif".

- 🔲 Introduction d'**Inngest** (cf. ADR-004)
- 🔲 Microsoft Graph `Mail.Send` configuré (Application Access Policy sur boîte service)
- 🔲 Alertes mail :
  - Jalons AG en retard (ambre + rouge)
  - Copros sans AG planifiée depuis > 11 mois
  - Synthèse hebdo manager (lundi 8h)
- 🔲 Templates mail (probable `react-email`)
- 🔲 **Réservation de salle d'agence depuis l'intranet** (demande Sekou 2026-06-12) : pour une AG/un CS tenu en agence, sélectionner la date puis **réserver la salle directement sur Outlook** (calendriers de salles, via Graph `Calendars`), avec **vérification de disponibilité**. Alimenterait le champ « Lieu » de l'ODJ (aujourd'hui : copropriété ou agence, saisie manuelle).
- 🔲 Audit log enrichi : couverture lectures sensibles (niveau b - ADR-007)
- 🔲 Tests E2E enrichis : trigger d'alerte -> mail dans boîte de test

**Livrable démontrable** : "le manager reçoit la synthèse hebdo lundi matin, plus alertes ambre/rouge."

---

## J6 - Pré-prod, RGPD, go-live (semaine 12)

Stabilisation, paperasse, lancement.

- 🔲 Tests utilisateur intensifs avec les gestionnaires (≥ 3 sessions guidées)
- 🔲 Documentation utilisateur (Notion ou markdown dans `docs/user-guide/`)
- 🔲 Documentation admin (variables d'env, runbooks)
- 🔲 Page "Mentions légales" + "Politique RGPD" (avec exercice des droits)
- 🔲 Politique de purge `audit_log` (cron au-delà de la durée de conservation)
- 🔲 Sentry intégré (erreurs serveur + client)
- 🔲 Vercel Analytics activé
- 🔲 Domaine custom (`intranet.real31.fr` ou équivalent)
- 🔲 Sauvegardes Supabase vérifiées (PITR activé)
- 🔲 Runbook incident dans `docs/runbook.md`

### Passage en prod Vercel - SSO (checklist, aucune modif de code)

✅ **1er déploiement Vercel fait (2026-06-18)** : branche `increment/02-supabase` en production + `demo/mes-emails` en preview ; env vars Supabase + eStale + `SITE_PASSWORD` (gate) + `AUTH_SECRET` posées. **SSO OFF** (gate seul) -> déploiement **test perso / interne** (mot de passe gardé par Sekou), pas encore ouvert aux gestionnaires car le mode CS **écrit dans le vrai eStale** + pas de vraie auth. Reste pour ouvrir aux gestionnaires : SSO (ci-dessous) + cloisonnement.

Le code est prêt (`src/auth.ts` a `trustHost: true` -> Auth.js déduit l'URL depuis le host, rien à recompiler entre local et prod). Au déploiement, c'est uniquement de la **config d'environnement** :

- 🔲 **Ajouter la Redirect URI de prod dans l'App Registration Entra** : `https://<domaine-prod>/api/auth/callback/microsoft-entra-id` (Entra exige chaque URL explicitement, pas de wildcard). Déjà listée dans `docs/entra-app-registration.md` section 3 -> à faire déclarer **dès la création de l'app** par le patron pour éviter un 2e aller-retour.
- 🔲 **Variables d'env Vercel** (scope *Production*) : `AUTH_MICROSOFT_ENTRA_ID_ID/SECRET/ISSUER` (identiques au local), `AUTH_SECRET`, et `AUTH_URL=https://<domaine-prod>` (au lieu de `http://localhost:3000`).
- ⚠️ **Preview deployments** : les URLs Vercel de preview (`*-git-*.vercel.app`) changent à chaque push et **ne peuvent pas** être déclarées dans Entra -> le SSO **ne marche pas** sur les previews. Prévoir un **domaine stable** : prod (`intranet.real31.fr`) + **staging permanent** (`intranet-staging.real31.fr`) déclarés une fois. Sur les previews on reste sur dev-login (l'app y retombe automatiquement si les vars `AUTH_*` ne sont pas définies sur ce scope).

| Élément | Change au déploiement ? |
|---|---|
| Code (`src/auth.ts`, callbacks) | non (`trustHost: true`) |
| Client ID / secret / issuer | non (même app, même tenant) |
| `AUTH_URL` | oui (localhost -> domaine prod) |
| Redirect URI dans Entra | à ajouter (le doc le prévoit déjà) |

**Livrable démontrable** : "go-live MVP, les gestionnaires utilisent l'intranet quotidiennement."

---

## Vision produit élargie et phasage

> Section **informative** (cible décidée le 2026-05-27, cf. ADR-021). Rien des modules
> post-MVP ne doit être anticipé dans le code tant que le MVP n'est pas livré. Le
> périmètre de dev actif reste les 5 écrans (J0 à J6 ci-dessus).

L'intranet REAL31 devient la **porte d'entrée unique** du cabinet, à terme 8 modules.
Phasage en 4 temps.

### 1. MVP (strict, en cours)

Les 5 premiers écrans du mockup, rien de plus. Exécution détaillée : J0 à J6 ci-dessus.

1. Dashboard
2. Calendrier AG/CS
3. Mes événements (version simple, sans gestion des mails)
4. Fiche prépa AG
5. Fiche copro 360°

Aucun module 6/7/8 ni feature post-MVP dans ce périmètre.

### 2. Post-MVP vague 1 (à intégrer juste après le MVP)

- **Module 7 - Contrats** (syndic-cabinet + fournisseurs) **si** le patron valide de le
  développer dans l'intranet plutôt qu'en standalone (décision en attente, cf. ADR-021).
  Inclut le registre des contrats fournisseurs et les alertes d'échéance J-90/60/30.
- **Extension des rôles et scopes** : `assistant`, `comptable`, `directeur`, `dirigeant`
  (cf. ADR-009). Pas de nouveaux écrans, juste ajout de policies RLS et page admin
  enrichie (`reports_to_user_id`).
- Alertes et synthèses enrichies (suite de J5).

### 3. Post-MVP vague 2 (plus lointain)

- **Module 8 - Registre des mandats** : absorption de l'app A (RegistreMandats, en prod).
  Port des intégrations OneSpan, Azure Document Intelligence et scan-email sous forme
  d'**adapters** hexagonaux (cf. ADR-021, ADR-001).
- **Module 6 - Divers syndic** : numérisation des Excel quotidiens (badges Intratone,
  archives physiques, etc.).
- **Génération de documents PDF** : convocations AG (LRAR + voie électronique), ODJ
  formaté, note immeuble, courriers types (rouvrir ADR-012).
- **Intelligence** : détection d'anomalies (soldes négatifs, contrats orphelins), vues
  matérialisées Supabase pour les agrégations lourdes.
- **Migration finale eStale** : quand 100 % des copros sont sur eStale, décommissionner
  `SharePointCoproAdapter`, traiter le sort des données historiques (ADR-018), retirer
  les tables `mirror_*`.
- **Serveur MCP** : exposition de l'API métier (prérequis déjà posé par les ports d'ADR-001).

### 4. Vision long terme - les 8 modules

L'intranet comme porte d'entrée unique du cabinet :

1. Dashboard
2. Calendrier AG/CS
3. Mes événements (peut-être gestion des mails plus tard)
4. Fiche prépa AG
5. Fiche copro 360°
6. Divers syndic (badges, archives, Excel quotidiens)
7. Contrats (syndic-cabinet + fournisseurs)
8. Registre des mandats (app A absorbée)

### Stratégie de transition (cf. ADR-021)

- Coexistence assumée de l'app A et de l'intranet pendant **~5 à 7 mois**. Pas de big bang.
- L'app A reste en prod et sert l'équipe pendant toute la transition.
- L'archi hexagonale de l'intranet reste **l'autorité de qualité**.
- Prisma (hérité de A) **cohabite** avec supabase-js le temps de la transition : dette
  technique assumée et bornée, à résorber selon ADR-015.

---

## Migration des automatisations MYTHEC (PowerApps) - backlog

Solution Power Platform `MYTHEC_REAL31_Automation` exportée le 2026-06-11 (cf. `docs/powerapps/`, binaires `.zip`/`.msapp` gitignorés). Architecture MYTHEC : données en **listes SharePoint** (Coproprietes, SuiviContratsCopro, Tarifs, Produits, Facturation, Historique Récap AG / Création Contrat, Paramètres...), logique en **6 flux Power Automate**, 1 **canvas app** (UI), facturation via **Pennylane** (API REST), source **Crypto** (sync Crypto -> SharePoint). À **auditer puis réimplémenter** dans l'intranet (pas de conversion automatique possible).

Les 6 automatisations à reprendre :
- 🔲 **Facturation dépassement AG** (`REALFacturationPennylane`) : Récap AG N-1 x taux horaire -> brouillon de facture Pennylane. **Candidat n°1** (logique pure + appel API, ni doc-gen ni mail).
- 🔲 **Facturation gestion courante** (`REALFacturationGestionCourante`) : honoraires de gestion courante sur les copros actives -> Pennylane.
- 🔲 **Facturation syndic + sinistre** (`REALFacturationSyndic`) : honoraires syndic + frais sinistre (expertise, mesures conservatoires, déplacement, suivi assureur) -> Pennylane.
- 🔲 **Génération du contrat de syndic / mandat** (`REALGenerationducontratdesyndic`) : depuis un modèle Excel (~70 actions). Dépend de la **génération de documents** (ADR-012, post-MVP).
- 🔲 **Notification comptable** (`REALNotifComptable`) : dépend de l'**envoi de mail** (Graph / Entra ID, bloqué DSI).
- 🔲 **Synchro Crypto -> SharePoint** (`REALSynchroCrypto-SharePoint`) : à étudier comme référence pour notre propre extraction Crypto.

**Dépendances transverses** : accès **API Pennylane** (token aujourd'hui dans la liste SharePoint « Paramètres »), données de référence **Tarifs / Produits**, et décision sur la **source de données** (listes SharePoint vs notre Supabase). Le **récap AG** alimente la facturation dépassement ; le **mandat** est lié à la génération de contrat.

---

## Idées / outils internes - backlog

- 🔲 **Générateur d'étiquettes BAL (boîtes aux lettres)** : produire des étiquettes prêtes à imprimer/coller pour les boîtes aux lettres d'une copropriété (nom des copropriétaires/occupants par lot). À cadrer : source des noms (eStale `owners` / lots, ou saisie), format de planche (Avery type L7160/L7163, A4 X colonnes), gestion des locataires vs propriétaires, sortie PDF imprimable (réutilise le socle d'impression de l'ODJ). Outil autonome, sans dépendance DSI - bon candidat « quick win » côté gestionnaires.

---

## Risques et mitigations (vivant)

| Risque | Statut | Mitigation |
|---|---|---|
| ⚠️ Lenteur DSI sur Entra ID | Actif J0 | J1a parallèle (mock auth), J1b déblocable rapidement après livraison |
| Migration eStale retardée | Surveillé | ADR-005 prévoit la transition |
| Mauvais calcul jalon AG | Surveillé | Tests exhaustifs ADR-006, revue juridique avant prod |
| Session eStale instable | Accepté | Refresh paresseux, attente API key |
| Sync SharePoint cassé | Surveillé | Watermarks + alerting J3 |
| Scope creep | À discipline | ADR-008 (périmètre coordination), refus poli systématique |
| Qualité géocodage Nominatim | Surveillé | Critère 5 % erreur -> migration BAN/MapBox (ADR-013) |
| Frustration boutons PDF grisés | Faible | Tooltip explicite + promesse vague 2 |

---

## Décisions ouvertes / questions en attente

Cf. `DECISIONS.md` -> "Décisions futures à formaliser" (ADR-014 à 020) :
- UI library (à figer pendant J1a/J2 selon le mockup et le confort)
- ORM Supabase (à figer pendant J1a - increment 2)
- Validation runtime (J1a - increment 2)
- Auth library (J1b)
- Sort des données SharePoint post-migration
- Stratégie tests
- Observabilité

Chaque décision = ADR au moment où elle est tranchée.
