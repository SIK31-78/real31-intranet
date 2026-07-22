# Registre des PV d'AG : papier → électronique — note de faisabilité

> Recherche (2026-07-22). **Rien codé.** Les points juridiques sont à faire **valider par un juriste / le patron** avant toute mise en œuvre.

## ⭐ CAP (recadrage Sekou 2026-07-22) — eStale-first, tout signer électroniquement

- **On construit pour eStale, on bricole pour Crypto.** Crypto/scan = transitoire (bascule eStale ~fin 2026). Le registre PV se conçoit **autour d'eStale**, PAS autour du scan Crypto (qui n'est qu'une rustine actuelle). ⇒ l'« Option C » adossée au scan Crypto n'est PAS la cible ; au mieux un dépannage court terme.
- **Objectif** : **tout signer électroniquement** via **tablette / pad de signature**, en AG.
- **Doute d'usage eStale à lever (Sekou)** : il semble que dans eStale **seul le bureau** (président/secrétaire/scrutateurs) signe **au stylet** (signature manuscrite sur tablette) ; **les copropriétaires présents** obligeraient à **imprimer la feuille de présence**, la faire signer papier, la scanner, puis faire signer le bureau électroniquement = **flux hybride papier+électronique, pas idéal**. → à **vérifier sur une AG test** (Sekou peut en créer une).
- **OneSpan Sign** = la brique pressentie pour tout régler (signer TOUS électroniquement, y compris les présents), déjà en prod App A — mais **implémentation brique par brique inconnue**, à cadrer.

## Verdict eStale (la question « récupérer depuis eStale ? »)

**Partiellement : le modèle existe, les données non.**
- Le schéma eStale (`docs/estale-schema.graphql`) expose un modèle de PV riche et **signable** : `Meeting.transcript` → `MeetingTranscript` (`bodyURL`, `signedBodyURL`, `attendanceSheetURL`, `validated`, **`froze`/`isFrozing`** = gel/inaltérabilité, `isDigitallySigned`, `signaturesDigital`), mutation `setBody(file)`, et **`createTranscriptDigitalSignature(persona, file)`** (signature par président/secrétaire/scrutateur).
- **MAIS** les 7 copros REAL31 ont **0 meeting dans eStale** (aucune AG tenue côté eStale) → **rien à récupérer aujourd'hui**.
- **Source réelle des PV aujourd'hui** = registre **papier** signé à la main + **scan PDF rangé dans Crypto/SharePoint** (cf. supervision : « Scan PV + évènement Crypto », « Registre PV (avec feuille de présence) »). L'intranet n'en tient que des **cases à cocher et des dates** (jalons `TENUE`/`NOTIF_PV`/`ARCHIVAGE`, aucun document stocké).
- Pour qu'eStale porte les PV, il faudrait **basculer la tenue des AG dans eStale** (créer les meetings + feuille de présence + transcript) — un **changement de process**, pas un simple branchement.

## Cadre légal (à valider juriste)

Dématérialisation **légale et prévue par les textes**, sous conditions :
- **Décret n°67-223 du 17 mars 1967, art. 17** : PV inscrits **à la suite** (chronologie) sur un registre ; signés **président + secrétaire + scrutateur(s)** en fin de séance ou **≤ 8 jours** ; feuille de présence **annexée**. Il prévoit : « le registre peut être tenu sous **forme électronique** dans les conditions de l'**art. 1366 du code civil** », PV et feuille de présence signés selon **art. 1367 al. 2 CC**.
- **Art. 1366 CC** : écrit électronique = même force probante **si** identification de l'émetteur **+ intégrité** garanties à l'établissement **et à la conservation**.
- **Art. 1367 al. 2 CC** + **décret 2017-1416** + **eIDAS (UE) 910/2014** : présomption de fiabilité de la signature électronique → en lecture stricte, niveau **qualifié**. **Point de débat doctrinal (à trancher juriste)** : signature **qualifiée** (lourd) vs **avancée** (si le juriste la valide). **C'est LA décision qui structure l'architecture.**

**Checklist légale dure** : chronologie · signature P/S/scrutateurs ≤ 8 j (niveau eIDAS à confirmer) · identification · intégrité/inaltérabilité · feuille de présence annexée · horodatage · conservation pérenne.

## Briques maison réutilisables

- **OneSpan Sign** : **déjà en PROD dans l'App A** (RegistreMandats — module `lib/onespan`, cron). Dans l'intranet c'est juste un lien externe (sidebar), non intégré. **Port en adapter déjà prévu post-MVP** (fusion). → brique de signature électronique **disponible dans la maison**. (≠ **Signitic** = signature d'e-mail, sans rapport.)
- **Tables natives** (`intranet_jalons`/`intranet_supervision_items`/`intranet_odj_champs`, RLS off + service_role) : un `intranet_registre_pv` suivrait le même pattern.
- **Écriture eStale d'AG déjà branchée** : `estale-assemblee-provider.ts` sait `createMeeting` + pousser l'ODJ (idempotent) — la moitié du chemin « tenir l'AG dans eStale » existe, mais il ne touche pas au `transcript`.
- **Manque partout** : une brique de **stockage de fichier** (aucune côté intranet — pas de Supabase Storage utilisé). Choix : Supabase Storage / SharePoint (Graph) / Drive eStale.

## Options d'architecture

- **A — eStale coffre** : gérer le `transcript` dans eStale (createMeeting → setBody → froze → signature par persona), l'intranet agrège les meetings en registre. *+* réutilise le natif ; *−* suppose de **basculer toute la conduite d'AG dans eStale** (0 meeting aujourd'hui) + inconnues sur ce que fait vraiment `froze` et le niveau eIDAS de la signature eStale (→ **support eStale**).
- **B — intranet coffre + OneSpan** : table `intranet_registre_pv` (copro, date, n° chrono, empreinte SHA, horodatage, signataires, URL) + stockage PDF + signature **OneSpan** (porté de l'App A). *+* maîtrisé, indépendant d'eStale, brique déjà en prod maison ; *−* storage à créer, niveau eIDAS OneSpan à cadrer.
- **C — hybride v1 (index/GED + empreinte)** : registre = **index** (n° séquentiel = chronologie, empreinte du PDF = intégrité, horodatage, feuille de présence liée) ; le PDF reste scanné/signé à la main. *+* effort faible, valeur immédiate, zéro risque juridique nouveau ; *−* **PAS un registre électronique au sens de l'art. 17** (reste adossé au papier signé) — à n'assumer que pour le **confort/GED**.

## Décisions à trancher AVANT de coder

1. **Objectif réel** : vrai **registre électronique à valeur légale** (signature électronique) **ou** **dématérialisation-confort/GED** ? (départage A/B de C — décision patron)
2. **Lieu de tenue des AG** : bascule dans eStale (→ A) ou hors eStale + intranet/OneSpan coffre (→ B) ?
3. **Signature + niveau eIDAS** : OneSpan vs eStale natif ; **qualifié** vs **avancé** (juriste)
4. **Conservation du PDF** : Supabase Storage / SharePoint / Drive eStale
5. **Périmètre v1** : nouvelles AG seulement, ou reprise de l'historique papier ?

## Validations externes nécessaires

- **Juriste / patron** : niveau de signature exigé ; validité d'un registre dans un outil tiers ; conservation ; sort du registre papier historique.
- **Support eStale** : ce que fait `froze` (valeur probante ?) ; `createTranscriptDigitalSignature` = upload d'un PV signé ou vraie signature eIDAS, à quel niveau ? registre exportable ?
- **Stratégique** : le fait que REAL31 ne tienne **aucune AG dans eStale** est-il assumé ou un manque ? (conditionne l'Option A)

**Fichiers clés** : `docs/estale-schema.graphql` (Meeting l.8227, MeetingTranscript l.9192, TranscriptDigitalSignature l.11807, Drive l.3821) ; `src/lib/adapters/estale/estale-assemblee-provider.ts` ; `src/lib/domain/supervision-ag-template.ts` ; `src/lib/domain/jalons-ag/types.ts` ; `docs/estale/apprentissage-estale.md` ; OneSpan App A (`DECISIONS.md`, `docs/fusion-analyse-app-a-app-b.md`).
