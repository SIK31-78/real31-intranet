# Audit UI/UX - démo SaaS (2026-06-20)

Audit multi-agents (9 zones auditées en parallèle + synthèse) sur les écrans de la démo, charte REAL31 conservée. 65 findings bruts -> synthèse priorisée.

## Synthèse
L'UI est globalement soignée et déjà sur la charte verte, mais souffrait de trois familles de défauts visibles en démo : (1) affordances mensongères (nav full reload, chips CS et "Voir le PV" cliquables qui ne menent nulle part), (2) états vides absents (Actions, calendrier Mois/Semaine) qui font passer un écran "rien à faire" pour un écran cassé, (3) micro-copie de maquette périmée/fausse. Aucun reskin nécessaire.

## ✅ Demo-critiques - FAITS (commits 4c008d5, 19a07f3)
- Sidebar `<a>` -> `<Link>` (fini le full reload à chaque clic de menu).
- Chips CS du calendrier : non cliquables (étaient des liens morts `href="#"`).
- Fiche copro "Voir le PV" / "PV" : faux liens bleus -> Badge neutre "PV disponible".
- Écran Actions : états vides explicites par section.
- Texte ODJ : commentaire périmé corrigé (l'enregistrement écrit bien dans Estale ; le texte user-facing était déjà correct).
- Calendrier Mois/Semaine : bandeau d'état vide.
- Écran Actions : faux "+3 vs mai dernier" (donnée figée) retiré.

## ✅ Gains rapides - FAITS
- Glyphe non-ASCII ⚠ -> icône AlertTriangle (ODJ).
- Command palette : libellés accentués.
- Barre de progression Actions : `green-500` (brand) -> `ok-500` (token statut).
- Coffre : `hover:bg-green-800` (hors @theme) -> `green-600`.
- Vue liste calendrier : date humaine au lieu de l'ISO brut.
- Résolutions : breadcrumb raccourci (ne répète plus le H1).
- Dashboard : lien "Voir tout" en doublon retiré.
- Accents d'identité Actions : bleu info -> vert brand.

## ⚠️ Écarté volontairement (contredit les décisions Sekou)
- Remettre "eStale" : NON, décision = "Estale".
- Remplacer les "·" (point médian) et « guillemets » français : NON, hors liste des caractères bannis (tirets cadratins, points de suspension, flèches) ; guillemets FR corrects dans un document juridique.

## 🔲 Plus tard (améliorations de fond, non bloquantes démo)
- **Factoriser les boutons hand-rolled vers la primitive `Button`** (tailles h-7/h-9 hors échelle, rayons incohérents, focus-visible absent) : dashboard, parcours-ag, fiche-vue-ensemble, conclure-bouton, checklist-item, calendrier-vue, composer-odj, coffre-vue...
- **Ajouter `focus-visible:ring` partout** (0 occurrence dans components/dashboard) - clavier sans repère.
- **`loading.tsx` / squelettes** sur les pages force-dynamic (dashboard, copropriete/[code], coffre, resolutions) - la primitive Skeleton existe.
- **Différencier les destinations des 3 cartes KPI** du dashboard (toutes -> /mes-evenements sans filtre) : query string ou retirer le lien.
- **Feedback d'erreur** quand une action serveur échoue (les actions font `if(!g) return` silencieux alors que l'UI est optimiste -> elle ment puis revert sans Toast).
- **Garde `peutConclure` sur checklist vide** : `items.every()` renvoie true sur tableau vide.
- **États vides dédiés** sur liste copros vide et bibliothèque résolutions vide (distinguer "bank vide" de "recherche infructueuse").
- **Code mort nav** : NavKey morts (`equipe`, `toutes-copros`, `sinistres`) ; cloche topbar sans badge ; extraire une source unique de nav partagée sidebar+palette.
- **Doublon CTA supervision** sur la fiche (BlocAg "Ouvrir la supervision AG" + BlocJalons "Supervision AG" -> même URL).
- **Centraliser la date d'horloge mock** ("2026-05-27" dupliqué fiche + supervision).
- **Aligner pastilles/tags sur `Badge`** et tokens de rayon ; couleurs `amber-*`/`red-*` en dur du coffre -> `warn-*`/`err-*`.

> Rapport complet (65 findings) : transcript du workflow `audit-ui-saas-real31`.
