# `lib/ports/` — Interfaces (contrats)

Cf. **ADR-001** (architecture hexagonale).

**Ce qui vit ici :**

- Interfaces TypeScript pour chaque dépôt (`CoproRepository`,
  `EvenementRepository`, `JalonRepository`, …)
- Types de paramètres / retours liés aux signatures

Les ports définissent **quoi** est possible (lire une copro par id,
lister les événements d'une copro, marquer un jalon accompli). Ils ne
disent **rien** sur le **comment** (SQL ? HTTP ? Mock ?).

**Règle :** dépendent uniquement du domaine. Pas d'implémentation ici,
juste des `interface` et `type`.
