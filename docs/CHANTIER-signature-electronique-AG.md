# CHANTIER — Signature électronique en AG + Registre des PV (dossier de reprise)

> **État : EXPLORÉ & PROUVÉ end-to-end, mis en PAUSE (2026-07-22). À reprendre dans quelques mois — RIEN NE DOIT ÊTRE PERDU.**
> Ce document est le **point d'entrée unique** du chantier. Détails dans les 3 docs liés :
> `docs/registre-pv-faisabilite.md` (juridique + options archi) · `docs/onespan-signature-electronique.md` (OneSpan brique par brique) · `docs/estale-cycle-ag-runbook.md` (cycle de vie AG par l'API).

---

## 0. Objectif & décisions actées

- **Objectif métier** : passer le registre des PV d'AG du **papier à l'électronique**, et **faire signer TOUT LE MONDE en AG sur tablette/pad** (bureau + copropriétaires présents), pour supprimer le flux « imprimer → signer → scanner ».
- **Cap impératif** : *on construit pour eStale, on bricole pour Crypto* (Crypto = transitoire, bascule eStale ~fin 2026).
- **Décisions Sekou (2026-07-22)** :
  - **Niveau de signature = SIMPLE (SES)** — sa décision métier, assumée (« oublie sandbox + juriste »). *À re-confirmer par un juriste si un jour on vise une valeur probante renforcée (AES/QES) — le choix conditionne la config OneSpan.*
  - **Tenant OneSpan = PROD « Real 31 »** (pas de sandbox à ce stade — cf. §5 recommandation).

## 1. Verdict global : la chaîne est PROUVÉE

Chaque maillon a été validé **sur du réel** (pas de la doc) :

```
Convocation (préparer + envoyer)        →  UI eStale        (1× par AG — SEUL point non-API)
Tenue : présences, votes, PV validé     →  API eStale (runbook §4) ou UI
PV signé par le bureau sur tablette     →  OneSpan in-person → transcript.setBody(eStale)   ✅ signedBodyURL rempli
Feuille de présence signée par tous     →  OneSpan + coffre  (eStale génère la sienne, refuse l'upload)
Constitution bureau / gel du PV         →  UI eStale ou createTranscriptDigitalSignature (non testé)
```

**Test E2E réussi** : AG test SE999 → bureau signé sur tablette (OneSpan) → PDF signé (318 Ko) récupéré → `setBody` dans eStale → `signedBodyURL` **REMPLI** + `isHandSigned=true`. *(fait sur un template de feuille vierge ; le vrai cycle métier — convocation UI → tenue → PV validé — a été exploré à part, cf. §4.)*

## 2. Juridique (à re-valider juriste avant prod réelle)

- **Décret n°67-223 du 17 mars 1967, art. 17** : registre chronologique, PV signés président+secrétaire+scrutateur(s) ≤ 8 j, feuille de présence annexée. Prévoit la **forme électronique** (renvoi **CC art. 1366** intégrité/identification/conservation + **1367 al.2** signature électronique → décret 2017-1416 → **eIDAS**).
- Niveau eIDAS : **SES** (retenu par Sekou) / AES / QES (QES = via un TSP listé, config compte). **Point à faire trancher par un juriste** avant valeur probante réelle.

## 3. eStale — ce qu'on a appris (faits)

- **eStale ne fait signer QUE le bureau** (`MeetingPersona` = CHAIRMAN/SECRETARY/SCRUTINEER), par **upload d'image** (`createSigning`, `createTranscriptDigitalSignature`). **Les présents ne sont PAS signables** : slot `owner.signing` **fantôme** (existe, jamais rempli, vide même sur AG conclue). → **la signature des présents = le vrai apport OneSpan**.
- **Une AG « signée » dans eStale** = **UN PV uploadé** (`transcript.setBody(file)` → `signedBodyURL` + `isHandSigned`). C'est le pattern « scan remonté en bloc » actuel. **`setBody` n'a AUCUNE garde d'état** (accepte tout, tout le temps → à discipliner côté notre code).
- **Upload de fichier dans eStale** (jamais fait avant) = **PROUVÉ** : mutation nichée `updateMeeting(id).createFile(fileCategory, file:Upload)` / `deleteFile`, en **multipart graphql-multipart-request** (parts `operations`/`map`/`0`, cookie seul, pas de content-type). Retourne le Meeting entier → fileID par diff de `documents`.
- **`bodyURL` / `attendanceSheetURL` = `String!` générés À LA VOLÉE** : toujours remplis, même sans convocations envoyées → ce sont des **templates** tant que l'AG n'est pas tenue. (⚠️ piège : un `attendanceSheetURL` rempli ne prouve PAS qu'une vraie feuille existe.)
- **Uploader NOTRE feuille de présence = IMPASSE** : `createFile(TRANSCRIPT_ATTENDANCE_SHEET | FORM | POWERS)` refusé partout (catégories auto-générées). La feuille remplie = celle que `transcript.validate` génère. *(Une catégorie libre type `TRANSCRIPT` accepte un upload — donc rattacher un doc non-réservé reste possible.)*
- **Cycle de vie AG pilotable par API** (runbook complet dans `docs/estale-cycle-ag-runbook.md`) **SAUF la préparation/validation INITIALE de la convocation** (`invitation.canValidate` ne passe pas à true par API — pas de mutation `prepare/generate`) → **1 passage UI eStale par AG**. Bureau/gel aussi UI-only.

## 4. Runbook « tenir une AG par l'API » (résumé — détail dans le doc dédié)

Sous `updateMeeting(id){…}` : `createMeeting` → `update(start)` → `updateAddress` → `createMotion(type:generic, majority:A24/A25…)` → **`invitation.validate` (UI-only 1×)** → `update(start passé)` → `createAttendancePresent/Represented` → `updateMotion.open` → `updateMotion.upsertVotes([{ownerID,status:AGREED/AGAINST/ABSTAIN}])` → `updateMotion.close` → `close` → **`transcript.validate` → `validated=true`** (génère la feuille remplie) → `transcript.froze` (ne finalise pas sans bureau).

## 5. OneSpan — ce qu'on a appris (faits)

- **OAuth** : `POST https://apps.esignlive.eu/oauth2/token`, creds en **header `Authorization: Basic base64(client_id:client_secret)`** + body `grant_type=client_credentials` (creds en body → 401). API base `https://apps.esignlive.eu/api`, Bearer.
- **Package in-person** : `POST /api/packages` multipart (payload JSON + PDF). Flag = **`settings.ceremony.inPerson:true`**. Champs `type:"SIGNATURE" subtype:"CAPTURE"` (stylet). E-mail signataire obligatoire au format même si aucun mail ne part.
- **Cérémonie « passage de main »** : ouvrir le **`signingUrl` du rôle SENDER** (type SENDER, auto-créé index 0), PAS celui d'un signataire → enchaîne les signataires sur le même appareil. **Validé visuellement sur tablette par Sekou** (« ça fonctionne de bout en bout »).
- **Récupération** : `GET /documents/{docId}/pdf` (PDF signé) + `GET /evidence/summary` (preuve eIDAS, PDF). **`DELETE /api/packages/{id}`** pour nettoyer.
- **App A (RegistreMandats)** a déjà OneSpan en prod (récolte seule) : **auth + client + download réutilisables** (`C:\Users\SekouKOMA\Projects\RegistreMandats-main\…\lib\onespan\`).
- ⚠️ **Piège nommage** : `src/lib/ports/signature-provider.ts` existant = **Signitic** (signature d'e-mail), rien à voir. Nouveau port = **`SignatureElectroniqueProvider`**.
- ⚠️ **Pas de sandbox** : les creds `.env.local` n'ouvrent QUE la prod « Real 31 ». **Reco reprise : obtenir un sandbox OneSpan** (community.onespan.com) avant de dev, pour ne pas créer de transactions en prod.

## 6. Plan de reprise (dans quelques mois)

1. **Préalables** : (a) sandbox OneSpan ; (b) éventuel go juriste si on dépasse SES ; (c) décider où vit le **registre PV** (table native `intranet_registre_pv` + coffre pour la preuve).
2. **Build par incréments** (cf. `docs/onespan-signature-electronique.md §5`) : port `SignatureElectroniqueProvider` + **mock** (tests offline) + adapter OneSpan (auth/create/in-person/download) → branchement flux AG (déclencher cérémonie + `setBody`) → écran **registre des PV** (collection chronologique) → preuve dans le coffre.
3. **Frontières à respecter** : convocation = UI eStale (1×) ; feuille signée par tous = OneSpan+coffre (hors eStale) ; bureau/gel = UI ou signature numérique eStale (à tester).

## 7. Inventaire des artefacts (pour reprendre vite)

- **Docs** : ce dossier + `registre-pv-faisabilite.md` + `onespan-signature-electronique.md` + `estale-cycle-ag-runbook.md`.
- **Scripts** (`scripts/`, jetables, non tous commités) : `estale-explore-meeting.mjs` (lecture d'un meeting), `estale-cycle-complet.mjs` (piloter une AG A→Z), `estale-upload-poc.mjs` (upload createFile), `estale-e2e-signature.mjs` (setbody/createfile/download), `onespan-probe.mjs` (sonde host/compte), `onespan-ceremonie.mjs` (url/delete d'un package), `e2e-temps2.mjs` (download signé + setBody).
- **Env `.env.local`** : `ONESPAN_ID_CLIENT` (client id), `ONESPAN_API_KEY` (⚠️ contient le **SECRET** OAuth), `ESTALE_BASE_URL/EMAIL/PASSWORD`.
- **IDs de test** : copro **SE999** `f3f6eec5-112a-433f-801c-3cbdc1195bfa` ; owners Lopes `51191a60…` (0002), Koma `47732af6…` (0001), Niel `0cc84e13…` (0005) ; **AG de référence PV validé `eb66061d-b942-40c6-bd48-f42e00e41227`** (bac à sable « AG conclue »).

## 8. Zones grises / à re-tester à la reprise

- **`createTranscriptDigitalSignature`** (signature numérique native du bureau dans eStale) : non testé — alternative/complément à `setBody` pour poser les signatures bureau.
- **`froze`** ne se finalise pas sans signatures bureau : à quoi ressemble une AG *gelée* complète ?
- Format exact des `Upload` (contentType/taille) par mutation.
- Rattacher la feuille signée OneSpan sous une catégorie **libre** eStale (vs réservées) — possible ?
- Sandbox OneSpan : obtenir des creds isolés.
