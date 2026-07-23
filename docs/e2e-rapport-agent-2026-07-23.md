# Rapport E2E exhaustif — 2026-07-23 (2e passe, pilotée au navigateur)

Suite de `docs/e2e-rapport-2026-07-23.md` (1re passe). Périmètre corrigé par Sekou : SE999 =
environnement de test eStale de A à Z (écritures assumées), Crypto en lecture seule,
**facturation hors périmètre** (SE999 sans données de base), mail = stop avant envoi.
Config dev réelle : `ESTALE_ECRITURE=reel`, `MAIL_SOURCE=graph` (sans `MAIL_PILOTES`).

## Verdict

**Prêt.** Les gardes de sécurité tiennent toutes (2 rôles × 2 routes admin + anti-IDOR),
le cycle AG écrit en vrai dans eStale sur SE999 sans casse, l'API v1 est étanche de bout en
bout. **0 bloquant. 4 gênants** (dont 2 sur le composer ODJ, à corriger avant que les
gestionnaires composent de vrais ODJ) **et 6 conforts**.

## Sécurité — tout vert ✅

| Test | Rôle | Résultat |
|---|---|---|
| `/admin/feedback` tapé en dur | Rémi (gestionnaire) | **Refusé** → redirigé `/accueil` (garde serveur) |
| `/admin/cles-api` tapé en dur | Rémi | **Refusé** → redirigé `/accueil` |
| `/admin/feedback` tapé en dur | Elsa (comptable) | **Refusé** → redirigé |
| Fiche SE999 (copro d'un autre) | Rémi | **404** « pas dans ton portefeuille » (anti-IDOR, n'avoue pas l'existence) |
| API sans clé / mauvaise clé / clé révoquée | — | **401 / 401 / 401** |
| PII copropriétaires dans les réponses API | — | **0 occurrence** (scan sur 100 copros) |

## Parcours validés ✅

- **Comptable pur (Elsa)** : atterrit sur `/comptabilite` (27 AG), sidebar épurée, clic
  SE999 → `/compta/SE999__2026-09-07` : **checklist 9 postes** (coche OK persistée, 1/9),
  **note postée** (« Note ajoutée », badge Comptable EP). Accueil Elsa : états vides propres.
- **Cycle AG SE999 (écritures réelles)** : date AG **confirmée** (badge vert), date CS
  **confirmée** ; page **ODJ** : en-tête auto (jalons 28/07 + 07/08 calculés), comptes
  chiffrés (trop-perçu **calculé** 6 582 €), aperçu document en direct ; **Mode CS** :
  bibliothèque cabinet 109 résolutions, ajout d'une résolution **écrit réellement dans l'AG
  eStale** (vérifié), retrait aussi (« 0 ajout, 1 retrait ») — état net rendu identique.
- **Mail au CS** : écran de composition atteint (destinataires eStale = adresses TEST de
  SE999, objet/corps corrects) — **non envoyé** (GO humain requis).
- **Clés API** : création (clair montré une fois + copier), **compteur d'usage exact** (4
  appels → « 4 », dernier usage daté), **révocation 2 temps** → la clé coupe (401).
- **API v1** : copros (pagination cursor, 259), échéances, openapi.json — tous 200, JSON
  propre.
- **Balayage routes** (Sekou) : Calendrier AG/CS, Récap AG, Sinistre (wizard dégât des
  eaux), Facturation, Gestion courante, Coffre (`/coffre`) — toutes rendent, **zéro erreur
  console** sur l'ensemble de la session.
- 1re passe (même jour) : boucle feedback + fix focus, archivage réversible, `/nouveautes`
  étanche, 404 FR, cloisonnement listes (27 copros pour Rémi).

## Anomalies

### Gênant

1. **`/mes-emails` : titre de page « Mes événements »** — la sidebar dit « Mes e-mails »,
   le H1 dit « Mes événements » (reliquat de l'inversion historique). Déroutant pour les 40.
2. **Composer ODJ : pas de garde anti-doublon** — ajouter une résolution DÉJÀ présente dans
   l'AG passe sans avertissement → doublon réel dans le Meeting eStale (reproduit puis
   nettoyé). Piège pour un gestionnaire pressé. NB : le jeu SE999 contient déjà
   « Reconduction du Syndic » en double (#1 et #6), antérieur au test.
3. **Composer ODJ : affordance de retrait trompeuse** — le × barre la ligne avec un visuel
   type spinner qui laisse croire à une écriture immédiate ; en réalité RIEN ne part tant
   qu'on ne clique pas « Enregistrer dans l'AG Estale » (vérifié : après reload le doublon
   était toujours là). Risque réel : croire un retrait fait alors qu'il ne l'est pas.
4. **Écart de date intranet ↔ eStale sans avertissement** — le composer affiche « AG du
   07/09/2026 » (intranet) et, dans le panneau, « Assemblée Générale Ordinaire -
   2026-11-19 » (date du Meeting eStale) : deux dates contradictoires côte à côte, aucun
   warning. (Donnée de test désynchronisée, mais le cas arrivera en réel.)

### Confort

5. Badge **« J-1 »** en tête du stepper sans libellé (échéance de jalon ? de l'AG ? ambigu).
6. « Dernière AG tenue : **Non renseignée** » avec badge « **PV disponible** » juste
   dessous — combinaison incohérente.
7. **Gabarit du mail CS figé** : propose « dates à fixer… nous confirmerons le 30/07 »
   alors que les deux dates venaient d'être confirmées — le texte ne s'adapte pas à l'état.
8. **Comptable refusée sur `/admin/*` atterrit sur `/accueil` gestionnaire** (vide) au lieu
   de sa home `/comptabilite`.
9. Double badge « COMPTABLE » au dev-login (déjà connu, ROADMAP).
10. Sekou affiché « GESTIONNAIRE » au dev-login — le statut super-admin (env `SUPER_ADMINS`)
    n'est pas reflété dans le badge (déjà connu).

## À nettoyer / état laissé sur SE999

- Note compta `[TEST E2E]` dans le fil de `/compta/SE999__2026-09-07` (1 à traiter).
- Checklist compta SE999 : « Rapprochement bancaire » coché OK (1/9).
- Dates SE999 passées **Confirmée** : AG 07/09/2026, CS 05/08/2026.
- AG eStale SE999 : ajout PUIS retrait du « Compte rendu CS » → état net **inchangé**
  (6 résolutions, doublon Reconduction préexistant).
- Clé API « Test E2E » créée puis **révoquée** (inerte, garde la trace d'usage).
- Remontée feedback `[TEST E2E]` (1re passe) : **archivée** dans `/admin/feedback`.
- **Aucun mail envoyé, aucun brouillon Pennylane, aucune écriture hors SE999.**

## Non couvert (et pourquoi)

- **Envoi réel du mail CS** : GO humain requis (`MAIL_SOURCE=graph` vif). Pour le tester :
  `MAIL_PILOTES=sekou` + redémarrage, puis dérouler sur SE999.
- **Conclure l'AG** : geste métier sur AG non tenue — l'aurait faussement basculée.
- **Création de dossier sur SE999**, **responsive ~1024**, navigation arrière/avant
  systématique : coupés au budget de session.
- **Facturation/Pennylane/récap** : hors périmètre (décision Sekou, SE999 sans données).
- Vérif à l'écran par Sekou : la note compta d'Elsa doit remonter sur SON accueil
  (« Échanges comptables ») — posée à l'instant, à constater de visu.
