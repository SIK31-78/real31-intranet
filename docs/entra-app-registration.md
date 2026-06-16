# Demande d'App Registration Entra ID - REAL31 Intranet

Document à transmettre **tel quel** au DSI. Toutes les informations nécessaires pour créer l'App Registration et configurer les permissions sont ici.

**Contact projet** : <à compléter par toi>  
**Demandeur** : <à compléter>  
**Date de la demande** : <à compléter>  
**Délai souhaité** : avant le démarrage de la phase J3 du projet (probable T+5 semaines)

---

## ⭐ Étape 1 (maintenant) : SSO seul

Pour la première mise en service, **seule l'authentification (SSO) est nécessaire**. Le SharePoint (`Sites.Selected`) et l'envoi de mail (`Mail.Send`) viendront **plus tard** - on ne s'en sert pas encore (les données viennent de Supabase).

> [!note] Même tenant, même techno que l'App A (registre-mandats)
> L'intranet et l'App A du patron partagent le **même tenant Microsoft 365** et la **même librairie** (Auth.js v5). Les variables d'env portent donc les **mêmes noms** : `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET`, `AUTH_MICROSOFT_ENTRA_ID_ISSUER`, `AUTH_SECRET`, `AUTH_URL`.
>
> **Deux options pour l'App Registration :**
> - **(a) Réutiliser celle de l'App A** (la plus rapide) : le patron ajoute notre Redirect URI `http://localhost:3000/api/auth/callback/microsoft-entra-id` à l'app existante et nous donne le **client secret**. On reprend alors le même `AUTH_MICROSOFT_ENTRA_ID_ID` et le même `AUTH_MICROSOFT_ENTRA_ID_ISSUER` que l'App A.
> - **(b) Créer une App Registration dédiée `REAL31 Intranet`** (plus propre à terme : secrets/URIs/permissions indépendants) : suivre les sections 2-3-4-5 ci-dessous.

Pour l'option (b), suivre **uniquement** :

- **Section 2** : créer l'App Registration (single tenant).
- **Section 3** : déclarer les Redirect URIs + cocher **ID tokens**.
- **Section 4**, mais **une seule permission** : `User.Read` (Delegated) - inutile d'ajouter `Sites.Selected` et `Mail.Send` pour l'instant.
- **Section 5** : créer un client secret.

**À nous transmettre** (canal chiffré, pas par email pour le secret) :
- `AUTH_MICROSOFT_ENTRA_ID_ID` = *Application (client) ID*
- `AUTH_MICROSOFT_ENTRA_ID_SECRET` = la valeur du client secret
- le *Directory (tenant) ID*, pour construire `AUTH_MICROSOFT_ENTRA_ID_ISSUER` = `https://login.microsoftonline.com/<TENANT_ID>/v2.0`

C'est tout pour le SSO. (`AUTH_SECRET` et `AUTH_URL`, on les met de notre côté - ce ne sont pas des valeurs Azure.)

Le reste du document (SharePoint, mail, Application Access Policy) reste valable pour les étapes suivantes.

---

## 1. Vue d'ensemble du besoin

Une application web interne (intranet REAL31) hébergée sur Vercel doit :

1. **Authentifier les collaborateurs** via le SSO Microsoft 365 (Entra ID) existant.
2. **Lire des listes SharePoint** spécifiques (référentiel copropriétés, contrats, événements) hébergées sur notre tenant M365.
3. **Envoyer des emails** depuis une adresse @real31.fr (alertes, synthèses, notifications).

Nous avons besoin d'**une seule App Registration Entra ID** couvrant ces trois usages, avec une politique de moindre privilège (`Sites.Selected` plutôt que `Sites.Read.All`, Application Access Policy sur la boîte mail dédiée).

---

## 2. Création de l'App Registration

### Paramètres généraux

| Champ | Valeur recommandée |
|---|---|
| **Nom** | `REAL31 Intranet` |
| **Supported account types** | Accounts in this organizational directory only (Single tenant) |
| **Redirect URI (type)** | Web |
| **Redirect URIs initiales** | Voir section 3 ci-dessous |

### Identifiants à récupérer après création

Le DSI doit nous transmettre **de manière sécurisée** (Bitwarden, 1Password, ou canal chiffré équivalent - **pas par email**) :

| Variable | Origine | Notes |
|---|---|---|
| *Directory (tenant) ID* (-> `AUTH_MICROSOFT_ENTRA_ID_ISSUER`) | Onglet *Overview* -> *Directory (tenant) ID* | GUID public, peu sensible |
| `AUTH_MICROSOFT_ENTRA_ID_ID` | Onglet *Overview* -> *Application (client) ID* | GUID public, peu sensible |
| `AUTH_MICROSOFT_ENTRA_ID_SECRET` | Onglet *Certificates & secrets* -> *Client secrets* -> *New client secret* | **Très sensible**, à transmettre via canal chiffré |

---

## 3. Redirect URIs

Le SSO Microsoft renvoie l'utilisateur sur une URL spécifique après login. Entra ID exige que **chaque URL soit explicitement déclarée** (pas de wildcard supporté).

À déclarer dans la section *Authentication -> Redirect URIs* (Platform : Web) :

```
http://localhost:3000/api/auth/callback/microsoft-entra-id
https://intranet.real31.fr/api/auth/callback/microsoft-entra-id
https://intranet-staging.real31.fr/api/auth/callback/microsoft-entra-id
```

**Notes** :
- L'URL `localhost:3000` est nécessaire pour le développement local. Microsoft autorise `http://localhost` sans HTTPS.
- L'URL `intranet.real31.fr` est l'URL de production (le sous-domaine définitif est à confirmer avec le DSI).
- L'URL `intranet-staging.real31.fr` est un environnement de staging permanent (pour les tests). Le projet n'utilisera **pas** les URLs de preview Vercel dynamiques (`*.vercel.app`) côté auth, car elles changent à chaque déploiement.

Si le sous-domaine `intranet.real31.fr` n'est pas encore créé côté DNS, indiquer une URL temporaire à corriger plus tard.

### Cases à cocher (section *Authentication*)
- ✅ **ID tokens** (utilisé pour le SSO)
- ❌ Access tokens (utilisé uniquement pour les flux implicites, non utilisés ici)

---

## 4. API Permissions

Trois permissions Microsoft Graph nécessaires. Deux sont de type **Application** (le serveur agit pour son propre compte, pas pour un utilisateur connecté), une est **Delegated** (au nom de l'utilisateur connecté).

| Permission | Type | Usage | Admin consent requis ? |
|---|---|---|---|
| `User.Read` | Delegated | Récupérer le profil de l'utilisateur connecté (nom, email) au moment du SSO | Non |
| `Sites.Selected` | Application | Lire le contenu de listes SharePoint **spécifiques** (allowlistées site par site) | **Oui** |
| `Mail.Send` | Application | Envoyer des emails depuis une boîte mail spécifique (cf. section 6 pour restriction) | **Oui** |

### Étapes côté Entra ID

1. *API permissions -> Add a permission -> Microsoft Graph*
2. Sélectionner chaque permission ci-dessus dans le bon onglet (Delegated ou Application)
3. **Cliquer sur *Grant admin consent for [tenant]*** - sans cette étape, les permissions Application ne sont pas effectives.

### Pourquoi `Sites.Selected` plutôt que `Sites.Read.All`

`Sites.Read.All` donne accès à **tous** les sites SharePoint du tenant - c'est excessif pour notre besoin. `Sites.Selected` exige qu'un administrateur SharePoint allowliste **explicitement** chaque site auquel l'application a accès. C'est la pratique de moindre privilège recommandée par Microsoft pour les apps backend.

### Étapes additionnelles pour `Sites.Selected`

Pour chaque site SharePoint à allowlister, un administrateur (le DSI ou un admin SharePoint) doit exécuter **une fois** un appel Graph :

```http
POST https://graph.microsoft.com/v1.0/sites/{site-id}/permissions
Content-Type: application/json

{
  "roles": ["read"],
  "grantedToIdentities": [{
    "application": {
      "id": "<AZURE_CLIENT_ID>",
      "displayName": "REAL31 Intranet"
    }
  }]
}
```

**Sites à allowlister** : à recenser par le DSI en partant des listes SharePoint suivantes (à compléter par le user) :
- Liste *Référentiel copropriétés*
- Liste *Calendrier AG/CS*
- Liste *Contrats fournisseurs*
- Liste *Stock matériel*
- Liste *Archives physiques*

Le DSI nous transmettra l'**ID du ou des sites** (`siteId` au format `<tenant>.sharepoint.com,<guid>,<guid>`) une fois l'allowlist faite.

---

## 5. Client secret

### Paramètres recommandés

| Champ | Valeur |
|---|---|
| **Description** | `REAL31 Intranet - Prod 2026` |
| **Expires** | 12 mois (rotation annuelle à mettre dans le calendrier IT) |

⚠️ **Important** : la valeur du secret n'est affichée **qu'une seule fois** au moment de la création. Si on la perd, il faut générer un nouveau secret.

### Alternative plus sécurisée (optionnelle)

Microsoft recommande l'usage d'un **certificate** plutôt qu'un secret pour la production. Mise en place plus complexe (génération keypair, upload de la clé publique, stockage de la clé privée côté Vercel). Si le DSI préfère cette voie, on s'adapte - sinon, le client secret est suffisant pour notre niveau de criticité.

---

## 6. Configuration de la boîte mail expéditrice

`Mail.Send` en permission Application permet, par défaut, d'**envoyer un mail depuis n'importe quelle boîte du tenant**. C'est trop permissif.

Microsoft fournit un mécanisme de restriction appelé **Application Access Policy** qui limite l'application à une ou plusieurs boîtes mail spécifiques.

### Boîte mail à créer (ou désigner)

Recommandation : créer une **boîte mail dédiée** au lieu d'utiliser une boîte personnelle. Exemple :
- Adresse : `intranet@real31.fr` (à confirmer par le DSI)
- Type : Shared mailbox ou User mailbox (licence dédiée)
- Display name : `REAL31 Intranet`

### Mise en place de l'Application Access Policy

À exécuter en **PowerShell** par un administrateur Exchange Online :

```powershell
# Connexion Exchange Online
Connect-ExchangeOnline -UserPrincipalName <admin>@real31.fr

# Création de la policy
New-ApplicationAccessPolicy `
  -AppId "<AZURE_CLIENT_ID>" `
  -PolicyScopeGroupId "intranet@real31.fr" `
  -AccessRight RestrictAccess `
  -Description "REAL31 Intranet - autorisé à envoyer uniquement depuis intranet@real31.fr"

# Vérification
Test-ApplicationAccessPolicy `
  -Identity "intranet@real31.fr" `
  -AppId "<AZURE_CLIENT_ID>"
```

Le résultat de `Test-ApplicationAccessPolicy` doit indiquer `AccessCheckResult: Granted`. Si l'application tente d'envoyer depuis une autre boîte, l'API Graph retournera une erreur 403.

---

## 7. Récapitulatif des informations à nous transmettre

Une fois l'App Registration créée et toutes les configurations faites, le DSI nous transmet :

| Information | Format | Sensibilité |
|---|---|---|
| *Directory (tenant) ID* (-> `AUTH_MICROSOFT_ENTRA_ID_ISSUER`) | GUID | Faible |
| `AUTH_MICROSOFT_ENTRA_ID_ID` (Application/client ID) | GUID | Faible |
| `AUTH_MICROSOFT_ENTRA_ID_SECRET` | Chaîne ~40 chars | **Critique** |
| Site IDs SharePoint allowlistés | Liste de `<tenant>.sharepoint.com,<guid>,<guid>` | Faible |
| Adresse mail expéditrice configurée | ex: `intranet@real31.fr` | Faible |
| Confirmation Application Access Policy active | OK / KO | - |
| Confirmation Admin consent accordé pour les 3 permissions | OK / KO | - |

Canal de transmission du secret : **Bitwarden / 1Password / message chiffré**. Pas d'email standard, pas de Teams non chiffré.

---

## 8. Tests d'acceptation côté projet

Une fois les credentials reçus, nous validons :

1. ✅ Login SSO depuis `localhost:3000` fonctionne, profil utilisateur récupéré
2. ✅ Lecture d'une liste SharePoint allowlistée fonctionne via Graph API
3. ✅ Lecture d'une liste SharePoint **non** allowlistée échoue avec 403 (preuve que `Sites.Selected` est correctement restrictif)
4. ✅ Envoi d'un mail de test depuis `intranet@real31.fr` fonctionne
5. ✅ Tentative d'envoi depuis une autre boîte mail échoue avec 403 (preuve que l'Application Access Policy est active)

Tout résultat inattendu : on remonte au DSI pour ajustement avant la mise en production.

---

## 9. Évolutions ultérieures (info DSI)

Pour information : à mesure que les modules de l'intranet s'enrichiront, nous reviendrons peut-être vers le DSI pour :

- Ajouter de nouveaux sites SharePoint à l'allowlist (extensions de fonctionnalités)
- Ajouter une boîte mail secondaire (ex: `noreply-alertes@real31.fr`)
- Ajouter le scope `Calendars.ReadWrite` (si on veut un jour synchroniser les AG vers les calendriers Outlook des collaborateurs - non prévu MVP)
- Migrer du client secret vers un certificate

Aucune de ces évolutions n'est imminente. Le périmètre actuel suffit pour le MVP et les premiers mois d'exploitation.

---

## 10. Questions ouvertes / décisions DSI

À trancher avec le DSI au moment de la demande :

- ☐ Nom définitif de l'App Registration (`REAL31 Intranet` proposé, mais le DSI a peut-être une convention de nommage)
- ☐ Sous-domaine de production (`intranet.real31.fr` proposé)
- ☐ Sous-domaine de staging (`intranet-staging.real31.fr` proposé)
- ☐ Adresse mail expéditrice (`intranet@real31.fr` proposé)
- ☐ Boîte mail : Shared mailbox (gratuit) ou User mailbox (licence) ?
- ☐ Préférence client secret vs certificate
- ☐ Politique de rotation du secret (12 mois proposé)
- ☐ Liste exhaustive des sites SharePoint à allowlister (à co-construire)
