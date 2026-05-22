# `lib/adapters/mock/` - Adapter Mock (dev local & tests)

Cf. **ADR-001**.

**Ce qui vit ici :**

- Implémentations en mémoire de chaque port
- Jeux de données fictives cohérents (15 copros, événements, jalons)
- Helpers pour les tests unitaires et E2E

Activé en :
- Dev local (avant que SharePoint/eStale soient branchés)
- Tests automatisés (jamais d'appel réseau dans les tests)
- Environnements éphémères de demo

Le routeur d'adapters peut basculer vers le mock via une variable
d'environnement (à câbler en Increment 5).
