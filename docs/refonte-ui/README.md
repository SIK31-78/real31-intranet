# Refonte UI — premier jet (maquettes statiques)

Trois maquettes HTML autonomes (double-clic pour ouvrir, aucun framework, seules les polices viennent de Google Fonts) : `01-dashboard.html`, `02-fiche-copro.html`, `03-toutes-les-copros.html`.

## La direction proposée

- **Navigation** : un seul rail vertical **sapin sombre** (la topbar disparaît) — recherche Ctrl+K en tête, groupes Pilotage / À traiter / Ressources, apps et outils externes repliables, utilisateur + cloche en pied. Sans icônes de menu : typographie seule, compteurs en badge. Mobile : barre haute + panneau plein écran (hamburger animé, fonctionne sans JS).
- **Typo** : Fraunces (serif, titres et grands chiffres) + Plus Jakarta Sans (UI) + Spline Sans Mono (codes S117, dates, échéances).
- **Palette** : papier chaud `#F5F3EC`, cartes blanches à hairlines, **sapin réservé à la marque et à l'action primaire** (un seul bouton primaire par écran) ; statuts en tons dédiés (ocre, terracotta, bleu ardoise, vert menthe clair).
- **Densité assumée** : lignes compactes (10-12 px de padding), mais respiration entre les blocs ; les gros chiffres du pipeline en serif donnent le côté « cockpit ».
- **Tableaux en mobile** : les lignes deviennent des cartes empilées (code + état en tête, nom pleine largeur, échéance dessous) ; le kanban défile horizontalement avec snap ; la frise AG passe en vertical.
- Micro-interactions : onglets fiche copro, bascule Liste/Pipeline et filtre de recherche en vanilla JS — tout reste lisible JS coupé.

Les variables CSS en tête de chaque fichier = brouillon des futurs tokens Tailwind.

## À trancher avec Sekou

1. **Le rail sombre** : identité forte mais rupture avec l'existant clair — on garde, ou variante claire du même rail ?
2. **Fraunces (serif)** sur les titres/chiffres : signature éditoriale ou trop « magazine » pour un outil quotidien ?
3. **Nav sans icônes** (typographie seule) : ok, ou on réintroduit des pictos fins pour le repérage rapide ?
