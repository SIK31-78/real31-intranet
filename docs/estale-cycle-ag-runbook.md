# Runbook — piloter une AG eStale de A à Z par l'API

> Établi 2026-07-22 sur la copro test SE999, AG démonstrateur `eb66061d-b942-40c6-bd48-f42e00e41227` (PV **validé** atteint). Script : `scripts/estale-cycle-complet.mjs`. Lié à [[project_estale_source_primaire]] et `docs/onespan-signature-electronique.md`.

## Verdict
La **tenue** d'une AG (présences → votes → clôture → **PV validé**) est **entièrement pilotable par l'API**. Le **seul chaînon UI-only** = la **préparation/validation initiale de la convocation** (celle qui bascule `invitation.canValidate` à `true` la 1re fois et génère AGENDA / INVITATION_ATTENDANCE_SHEET / MAJORITIES_LIST). Une fois cette étape franchie dans l'UI eStale, tout le reste est API.

## La séquence (toutes sous `updateMeeting(id){ … }`)
**Préparation**
1. `createMeeting(input:{condoID, accountingID, dkID, name, category:ORDINARY, participantsIDs})` → meetingID (crée 1 motion par défaut).
2. `update(input:{name, mode, start, dkID, participantsIDs})` — date.
3. `updateAddress(address:{label,street,housenumber,postcode,city,country})` — lieu (requis pour la convocation).
4. `createMotion(input:{type:"generic", title, body, majority:A24|A25|A25_1})` — résolution votable (`generic`=résolution, `group`=groupe).
5. **`invitation{ validate }`** — ⚠️ **UI-ONLY la 1re fois** : `canValidate=false` sur une AG créée par API (voir Blocage). Après passage UI, dé-valider/re-valider marche par API.

**Tenue** (l'ordre compte)
6. `update(input:{start:<date passée>})` → `isStarted=true`.
7. `createAttendancePresent(input:{ownerID})` par présent → `nbAttendances` monte.
8. `createAttendanceRepresented(input:{ownerID, internal:true, whitePower:false, representativeID})` par représenté.
9. `updateMotion(id){ open }` → `isVoteStarted=true`.
10. `updateMotion(id){ upsertVotes(input:[{ownerID, status:AGREED|AGAINST|ABSTAIN}, …]) }`.
11. `updateMotion(id){ close }` → `motion.status=ACCEPTED`.

**Clôture / PV**
12. `close` → `isClosed=true`, `isEnded=true` (exige `canClose=true` : invitation validée + présences + toutes motions votées & fermées). ⚠️ `transcript.setEnd` = no-op ; c'est `close` qui termine.
13. **`transcript{ validate }`** → **`transcript.validated=true`** + **génère automatiquement** le `TRANSCRIPT_ATTENDANCE_SHEET` (feuille de présence **remplie**) et le PV.
14. `transcript{ froze }` → gel, mais **ne se finalise pas sans les signatures du bureau** (voir UI-only).

## Blocage / UI-only (le « chaînon manquant »)
- **Préparation initiale de la convocation** : AUCUNE mutation API ne bascule `invitation.canValidate` à true ni ne génère les 3 docs de convocation. Testé : AG pristine (date future + adresse + conseil + annexes) reste `canValidate=false` ; une AG dont on fait `invitation.unvalidate` repasse `canValidate=true` (donc l'API *sait valider*, mais pas *préparer*). → **1 passage UI eStale requis par AG** (= « convocations pas parties »). Ensuite, 100 % API.
- **Constitution du bureau + gel** : `createSigning` (président/secrétaire/scrutateur) **refusé par l'API** dans nos tests ; `froze` accepté mais ne finalise pas sans signatures bureau. → UI eStale, ou piste signature électronique `createTranscriptDigitalSignature` (non couverte).
- **Uploader sa PROPRE feuille de présence** = **impasse** : `createFile(TRANSCRIPT_ATTENDANCE_SHEET | FORM | POWERS)` refusé dans tous les états — ces catégories sont **auto-générées** par eStale. La feuille remplie = le doc généré par `transcript.validate` + `attendanceSheetURL`. (Une catégorie libre comme `TRANSCRIPT` acceptait bien un upload au POC — donc rattacher un doc *non-réservé* reste possible, mais pas se substituer à la feuille officielle.)

## Conséquence pour le flux « AG signée électroniquement »
- **Convocation** : UI eStale (1×). **Tenue + PV validé** : API (ou UI). **PV signé** : OneSpan tablette → **`transcript.setBody`** (prouvé). **Feuille de présence signée par tous** : reste chez **OneSpan + coffre** (eStale génère la sienne, ne l'accepte pas en substitution). **Bureau/gel** : UI eStale ou `createTranscriptDigitalSignature`.
- Donc « conduire toute l'AG depuis l'intranet » = possible SAUF la préparation de convocation (UI) et le bureau/gel (UI/digital-sig) — à cadrer avant le build.

## AG de référence
`eb66061d` (SE999) : invitation validée (via UI à l'origine) + tenue jouée par API + **PV validé**. Conservée (non-supprimable une fois l'invitation validée) = notre bac à sable « AG conclue » pour tester la suite.
