# OneSpan Sign — signature électronique brique par brique

> Recherche 2026-07-22 (code App A réel + schéma eStale + doc OneSpan web). **Rien codé.** Objectif : faire signer TOUT LE MONDE en AG sur tablette/pad (bureau + copropriétaires présents), supprimer le flux papier. Voir aussi `docs/registre-pv-faisabilite.md`.

## Verdict
✅ **OneSpan couvre le besoin** : cérémonie **in-person** (plusieurs signataires sur UN seul appareil, sans e-mail), capture manuscrite au stylet (`subtype: CAPTURE`), preuve eIDAS. **Mais** : l'App A n'a codé que la *moitié aval* (récolte de PDF déjà signés) — la **création de package + la cérémonie in-person sont à construire**. Et eStale ne signe que le **bureau** → les **présents sont le vrai apport** d'OneSpan.

## ⚠️ Piège de nommage
`src/lib/ports/signature-provider.ts` EXISTE déjà = **Signitic** (signature d'e-mail), rien à voir. Le nouveau port = **`SignatureElectroniqueProvider`** (`signature-electronique-provider.ts`).

## 1. App A (RegistreMandats) — ce qui est réutilisable
Code réel : `C:\Users\SekouKOMA\Projects\RegistreMandats-main\...\lib\onespan\` (`auth.ts`, `client.ts`, `packages.ts`, `documents.ts`) + cron `process-onespan-packages`.
- **Usage App A = RÉCOLTE seulement** : un cron liste `GET /api/packages?query=COMPLETED`, matche `nom du package → n° de mandat`, `downloadDocumentPdf`, dépose SharePoint, idempotence via table. **Aucune création de package, aucun signataire, aucune cérémonie** (vérifié : le seul POST est le token OAuth). La signature se fait ailleurs (portail/e-mail), App A aspire le résultat.
- **Briques portables telles quelles** : **Auth** OAuth2 `client_credentials` → Bearer (cache token, retry 401) ; **client HTTP** `onespanFetch`/`onespanFetchBinary` (contrôle magic `%PDF`) ; **download PDF**.
- **Env DÉJÀ en prod** : `ONESPAN_TOKEN_URL=https://apps.esignlive.eu/oauth2/token`, `ONESPAN_API_BASE_URL=https://apps.esignlive.eu/api`, `ONESPAN_CLIENT_ID/SECRET`. → **host EU `apps.esignlive.eu` = acquis** (data-residency UE).

## 2. OneSpan API — le cycle complet
- **Auth** : OAuth2 client_credentials (token ~5 min). Hosts : EU `apps.esignlive.eu`, sandbox `sandbox.esignlive.com`.
- **Package** : `POST /api/packages` en `multipart/form-data` (part `payload` JSON + PDF). JSON : `name`, `type:PACKAGE`, `status:DRAFT|SENT`, `roles[]` (fonction + signer email/nom, ou aucun en in-person), `documents[].approvals[].fields[]` `type:SIGNATURE`. **`subtype`** : `FULLNAME` (nom stylisé) vs **`CAPTURE`** (tracé manuscrit stylet) → **`CAPTURE` pour la tablette**. Ordre via `role.index` (même index = parallèle).
- **⭐ IN-PERSON** (le point AG) : confirmé supporté. Un **flag in-person au niveau package** + la cérémonie lancée via le **token du SENDER** (pas un lien signataire) : on ouvre l'URL sur la tablette, l'hôte passe l'appareil de main en main, l'UI enchaîne les rôles. ⚠️ **Zones grises à lever sur le Swagger live/sandbox** : casse exacte du flag in-person, endpoint des authentication tokens, mécanique « signataire suivant ».
- **Récupérer** : `GET /api/packages/{id}/documents/{docId}/pdf` (déjà maîtrisé App A) ; `evidence/summary` = certificat/piste d'audit.
- **Webhooks** : *Callback Event Notifications* (enregistré au portail Admin, désactivés par défaut) → événement **`PACKAGE_COMPLETE`**. Répondre **2xx < 20s**, traitement async. Filet : poller `COMPLETED` comme App A.
- **eIDAS** : SES (clic/nom) / AES (auth + OTP) / **QES** (certificat qualifié d'un **TSP listé**, ex. Swisscom — OneSpan n'est PAS QTSP lui-même ; QES = paramétrage compte/connecteur, **pas un flag package**).

## 3. eStale — où OneSpan complète (VÉRIFIÉ sur AG conclue réelle SE999 `bfad0358`, 2026-07-22)
- **eStale ne fait signer que le BUREAU** (`MeetingPersona` = `CHAIRMAN/SECRETARY/SCRUTINEER`), par **upload d'image** (l'UI dessine la signature à la souris → pousse l'image). 3 emplacements : `createSigning` (émargement bureau sur la feuille), `createTranscriptDigitalSignature(persona, file)` (signature bureau du PV), `transcript.setBody(file)` (PV signé global → `signedBodyURL` + `isHandSigned`). **Pas de cérémonie, pas de preuve eIDAS.**
- **Les PRÉSENTS : slot FANTÔME.** `createAttendancePresent(ownerID, file)` → `MeetingOwner.signing` → `isSigned` EXISTE dans le modèle, mais **l'UI ne l'utilise pas** et il est **vide même sur une AG réellement conclue** (les 3 présents de l'AG test : `isSigned=false`, `signing` vide). ⚠️ Correction d'une erreur antérieure : ce `file` n'est **ni** un pouvoir (les pouvoirs = `whitePower` + `createAttendanceRepresented`, sans `file`) **ni** une signature utilisée. **eStale ne capture RIEN pour les présents.**
- **Ce qu'est une AG « signée » dans eStale (constaté)** : l'AG conclue a `signedBodyURL` rempli + `isHandSigned=true` MAIS `signaturesDigital` vide et bureau non posé → elle a été signée par **UN SEUL PV uploadé globalement (`setBody`)** = le **scan papier remonté en bloc**. C'est le flux actuel à remplacer.
- **Où remonter la feuille de présence signée par TOUS** (via OneSpan) : **pas de slot dédié**. Solution = **`meeting.createFile(fileCategory: TRANSCRIPT_ATTENDANCE_SHEET, file)`** (pièce jointe catégorisée, relisible via `meeting.documents`, supprimable via `deleteFile`). eStale ne la tracera que comme *pièce*, pas comme preuve → **preuve = coffre + OneSpan**, `createFile` en doublon de rattachement.
- **Donc** : OneSpan = moteur de cérémonie in-person (bureau + présents) + preuve eIDAS ; réinjection eStale = `setBody`(PV signé, comme le scan) + `createFile`(feuille signée) + option `createTranscriptDigitalSignature`(bureau). **eStale reste la source, la réinjection = simple (c'est déjà leur pattern setBody).**

## 4. Plan d'intégration hexagonal (intranet)
- **Port** `SignatureElectroniqueProvider` : `creerDossierSignature(docs, signataires[], {inPerson})` → packageId ; `lancerCeremonieInPerson(packageId)` → `{url, token}` ; `recupererPdfSigne` ; `recupererPreuve` ; `statut` + handler webhook `PACKAGE_COMPLETE`.
- **Adapters** : `adapters/onespan/*` (porter auth+client d'App A, ajouter création package + fields `CAPTURE` + in-person) + `adapters/mock/*` (tests 100% offline, convention repo).
- **Flux AG** : récupérer PV+feuille (eStale) → `POST /packages` (bureau+présents, `CAPTURE`, in-person, SENT) → cérémonie via token sender sur tablette → webhook `PACKAGE_COMPLETE` (filet: polling) → `GET pdf` + `evidence` → stockage → **réinjection eStale** (`setBody`/`createTranscriptDigitalSignature`) + registre PV.
- **Stockage** (eStale-first) : réinjection **eStale Drive** primaire (⚠️ upload multipart GraphQL `Upload` **jamais fait dans l'intranet** → à défricher) + **Supabase Storage** pour preuve/audit horodatée. **Éviter SharePoint** (transitoire).

## 5. Incréments (le plus petit d'abord)
- **Inc 0 (SANS CODE) — LE geste qui lève le doute** : AG test eStale + POC manuel sur **sandbox OneSpan** sur une **vraie tablette** — créer un package in-person, signer au stylet, télécharger PDF+preuve. À faire AVANT toute ligne de code (lève les zones grises).
- **Inc 1** : port + mock + adapter OneSpan « création package (feuille de présence, bureau seul) + download », écran read-only.
- **Inc 2** : cérémonie in-person réelle (token sender) + champs `CAPTURE`.
- **Inc 3** : webhook completion + evidence + stockage.
- **Inc 4** : réinjection eStale (`signedBody`/transcript) + registre PV.
- **Inc 5** : extension aux **présents** (rôles dynamiques par owner).

## Checklist « AG test » eStale (lever le doute)
1. L'UI eStale ne propose la signature que pour le **bureau** ? (chercher un écran de signature *des présents* — le schéma dit qu'il n'existe pas).
2. Signature bureau = **upload d'image** ou pad in-app ?
3. Feuille de présence : signable dans eStale ou PDF à imprimer ? comment `isSigned` passe à `true` ?
4. Uploader un PV signé externe : `setBody(file)` / `createTranscriptDigitalSignature(file)` → apparaît en `signedBodyURL` ? (valide la réinjection).
5. `froze` : que verrouille-t-il, à quel moment ?
6. `orderTranscriptDigitalSignature` : ordre bureau (si le juriste l'exige).
7. `createAttendancePresent(file)` : à quoi sert ce `file` (pouvoir ? justificatif ? signature ?).

## Décisions à trancher
1. **Stockage** : eStale Drive (primaire) + Supabase Storage (preuve) vs SharePoint. *(Préf : eStale + Supabase.)*
2. **Niveau eIDAS** : SES / AES / QES pour PV+feuille de présence de copro — **décision juriste**, elle fixe la config OneSpan.
3. **Périmètre v1** : bureau seul d'abord (Inc 1-4) vs tout le monde d'emblée. *(Préf : bureau puis présents en Inc 5.)*
4. **Place d'eStale** : source du PV signé (réinjection) ou intranet = registre maître ?

## À confirmer (support / juriste)
- **OneSpan** (Swagger live/sandbox) : flag in-person exact, authentication tokens, passage de main, endpoint evidence.
- **eStale** : upload `Upload` multipart (jamais fait) ; comportement réel `isSigned`/`froze`/`setBody`.
- **Juriste** : SES vs AES vs QES pour un PV/feuille de présence de copropriété.
