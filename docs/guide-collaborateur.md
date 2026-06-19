# Guide collaborateur - Intranet REAL31

Bienvenue. Ce guide explique, en langage simple, comment utiliser la plateforme.
Il s'enrichira au fur et a mesure des modules ; pour l'instant il couvre le
**coffre-fort de mots de passe**.

---

## Le coffre-fort de mots de passe

### A quoi ca sert

Un endroit unique et securise pour ranger les mots de passe : les tiens
(personnels) et ceux partages au sein du reseau ou de ton service (logiciels
metier, fournisseurs, acces communs). Fini le fichier Excel et les post-it.

### Le principe de securite, en une phrase

**Personne d'autre que toi ne peut lire tes mots de passe - pas meme REAL31, ni
l'informatique, ni le serveur.** Tout est chiffre **sur ton ordinateur** avant
d'etre envoye. Le serveur ne stocke que des donnees illisibles. C'est ce qu'on
appelle le "zero-knowledge" : le service garde tes secrets sans jamais pouvoir
les ouvrir.

La contrepartie : la cle qui ouvre ton coffre, c'est **toi** qui la detiens (ton
mot de passe maitre / ta passkey). Si tu la perds, personne ne peut la
retrouver a ta place.

---

### Premier acces : creer ton mot de passe maitre

La premiere fois que tu ouvres le menu **Coffre-fort**, on te demande de choisir
un **mot de passe maitre**.

- C'est **la** cle de ton coffre. Choisis-le **solide** (long, unique, que tu
  n'utilises nulle part ailleurs).
- Il **n'est jamais envoye au serveur**. Il ne sert qu'a deverrouiller, sur ton
  appareil.
- **Important** : si tu l'oublies, ton coffre **personnel** devient
  definitivement illisible (c'est le prix du zero-knowledge). Note-le dans un
  endroit sur, ou - mieux - active une passkey (voir ci-dessous).

> Une cle de recuperation arrivera plus tard pour couvrir l'oubli. En attendant,
> ton mot de passe maitre est ta seule cle : garde-le precieusement.

---

### La passkey (Windows Hello) - le plus simple au quotidien

Une **passkey** te permet de deverrouiller ton coffre avec ton **empreinte, ton
visage ou ton code PIN Windows**, sans taper de mot de passe.

**Comment l'activer** : une fois ton coffre deverrouille, clique sur **"Activer
une passkey"** (en haut a droite). Windows te demande de confirmer (empreinte /
PIN). C'est fait.

**Ensuite** : a l'ouverture du coffre, clique **"Deverrouiller avec une
passkey"** - et c'est tout.

Bon a savoir :
- Ton **mot de passe maitre reste actif** en secours (si la passkey n'est pas
  disponible, ou sur un autre poste).
- Une passkey est en general **liee a l'appareil**. Sur un autre poste, tu
  utilises ton mot de passe maitre, ou tu y enregistres une 2e passkey.
- Si ton poste ne supporte pas la passkey, pas de souci : le mot de passe maitre
  fait le travail.

---

### Les coffres : qui voit quoi

Tes mots de passe sont ranges dans des coffres, selon qui doit y avoir acces :

- **Reseau** : visible par **tous** les collaborateurs (outils communs au
  groupe).
- **Service** (Vente, Syndic, Location, Gestion Locative) : partage **au sein de
  ton service**.
- **Personnel** : **toi seul**. Personne d'autre ne le voit.

Tu vois ton coffre personnel + les coffres partages auxquels on t'a donne acces.

---

### Utiliser un mot de passe

Sur chaque entree :
- **oeil** : afficher / masquer le mot de passe.
- **copier** : le copier dans le presse-papier.
- **crayon** : modifier l'entree.
- **corbeille** : supprimer (avec confirmation).

**Ajouter** : bouton "Ajouter un mot de passe" en bas du coffre. Tu peux
renseigner le titre (ex : EDF), la copropriete, l'immeuble, l'URL, l'identifiant
et le mot de passe.

---

### Rechercher et filtrer

En haut, une **barre de recherche** trouve une entree par entreprise,
identifiant, URL, copropriete ou immeuble (tu peux taper plusieurs mots).

A cote, des **filtres** par **copropriete** et par **entreprise** permettent de
cibler. Recherche et filtres se combinent ; "Reinitialiser" remet tout a zero.

---

### Importer depuis Excel (migration)

Pour reprendre un fichier existant :

1. Dans Excel : **Fichier > Enregistrer sous > CSV UTF-8** (ou CSV ; l'accentue
   est gere automatiquement).
2. Dans un coffre, clique **"Importer (CSV)"** puis choisis le fichier. **Le
   fichier ne quitte jamais ton ordinateur** : tout est lu et chiffre sur place.
3. Les colonnes sont reconnues automatiquement (Entreprise, Identifiant, Mot de
   passe, Copropriete, Immeuble, Autre info). Tu peux ajuster, et tu vois
   combien d'entrees seront importees (les doublons sont ignores).

Apres une migration, pense a **changer les mots de passe les plus sensibles** :
ceux qui trainaient en clair dans un Excel doivent etre consideres comme exposes.

---

### Coffres partages : acces et administration

- **Voir et utiliser** un coffre partage : des qu'un administrateur t'y a donne
  acces, il apparait dans ta liste.
- **Creer un coffre partage** ou **gerer ses membres** : reserve aux
  **administrateurs**. (Cote crypto, donner acces a quelqu'un re-chiffre la cle
  du coffre vers lui : c'est fait depuis le poste d'un administrateur deja
  membre.)

**Pour les administrateurs** :
- **"Creer un coffre partage"** : reseau ou service.
- Bouton **"Membres"** sur un coffre : ajouter / retirer des collaborateurs.
- Panneau **"Administration"** : promouvoir / retrograder les administrateurs.

---

### Historique

Le bouton **"Historique"** d'un coffre montre **qui a fait quoi** (ajout,
modification, suppression, import) et **quand**. Pour respecter le
zero-knowledge, l'historique enregistre **l'action et son auteur, jamais le
contenu** du mot de passe.

---

### Bonnes pratiques

- Choisis un **mot de passe maitre solide** et **ne le partage avec personne**.
- **Active une passkey** : plus simple et plus sur au quotidien.
- Ne mets pas de mots de passe **personnels prives** dans un coffre partage.
- Apres une migration depuis Excel, **renouvelle les mots de passe sensibles**.
- Un doute, un acces a retirer, un depart : previens un administrateur.
