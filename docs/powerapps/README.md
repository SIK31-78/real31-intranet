# Migration des automatisations PowerApps -> intranet

Objectif : sortir la **logique** des apps Power Platform de REAL31 (facturation
depassement AG/CS, creation de contrat de syndic, recap AG, mandat...) pour la
**reimplementer dans l'intranet**, apres audit.

> [!important]
> PowerApps **n'exporte pas de code executable**. On exporte les **artefacts**
> (formules Power Fx, definitions de flux en JSON) pour les **lire et auditer**,
> puis on reecrit la logique a la main dans l'app Next.js. Pas de conversion auto.

## 1. Identifier ce qu'on a

Pour chaque automatisation, noter :
- son **type** : canvas app (formules Power Fx) ou flux Power Automate (declencheur + actions) ou les deux ;
- ce qu'elle **produit** : un calcul, un document Word/PDF, un mail, une ligne en base... ;
- d'ou viennent ses **donnees** (Dataverse ? Crypto ? Excel/SharePoint ? saisie ?).

## 2. Exporter les artefacts

**Option simple (tout d'un coup) - recommandee :**
1. `make.powerapps.com` -> **Solutions** -> *Nouvelle solution* (ex. `REAL31Auto`).
2. Ajouter les apps **et** les flux concernes (Ajouter existant).
3. **Exporter** -> *Non geree* -> telecharger le `.zip`.

**Option par element :**
- Canvas app : `make.powerapps.com` -> *Applications* -> `...` -> **Exporter le package** (`.zip`) ou telecharger le `.msapp`.
- Flux : `make.powerautomate.com` -> *Mes flux* -> le flux -> **Exporter** -> *Package (.zip)*.

## 3. Rendre lisible (Power Platform CLI)

Le `.zip`/`.msapp` est une archive ; pour des sources lisibles :
- Installer le CLI `pac` (VS Code extension *Power Platform Tools*, ou
  `dotnet tool install --global Microsoft.PowerApps.CLI.Tool`).
- Canvas : `pac canvas unpack --msapp App.msapp --sources ./out-app`
  -> formules Power Fx en `.fx.yaml` (la vraie logique).
- Solution : `pac solution unpack --zipfile REAL31Auto.zip --folder ./out-sol`
  -> les flux sont dans `Workflows/*.json` (declencheur + actions + expressions).

## 4. Deposer ici

Mettre les `.zip` / dossiers depaquetes dans `docs/powerapps/`.

> [!warning]
> **Aucun secret / chaine de connexion** dans le repo : avant de committer,
> retirer les valeurs de connexions, cles d'API, jetons. On audite la LOGIQUE,
> pas les credentials.

## 5. Audit (cote intranet)

Pour chaque automatisation, on produit : donnees d'entree -> regles de calcul ->
sortie (doc / mail / enregistrement), puis un plan de reimplementation priorise.

**Dependances a anticiper** (elles conditionnent la faisabilite immediate) :
- **Generation de documents** (contrat, mandat, recap = Word/PDF) -> cf. ADR-012
  (PDF repousse post-MVP) : a rouvrir si on reprend ces apps.
- **Envoi de mails** -> Microsoft Graph (bloque tant qu'Entra ID DSI n'est pas la).
- La **logique pure** (ex. calcul de facturation depassement AG/CS) est, elle,
  directement reimplementable sans dependance externe.
