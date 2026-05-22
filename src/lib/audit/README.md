# `lib/audit/` — Audit RGPD + activity log produit

Cf. **ADR-007**.

**Ce qui vit ici :**

- Helper `withAudit({ action, resource_type, resource_id }, fn, { activity? })`
- Capture du contexte utilisateur (user_id, ip, user_agent)
- Écriture transactionnelle dans `audit_log` (RGPD) ± `activity_log` (UI)

**Deux tables séparées** :

- `audit_log` — append-only, jamais affiché à l'utilisateur, conformité RGPD
- `activity_log` — historique produit affiché dans l'UI ("FS a marqué X
  comme accompli le 5 mai")

À mettre en place dans l'Increment 4 du plan J1a.
