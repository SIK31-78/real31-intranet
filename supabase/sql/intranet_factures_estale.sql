-- Factures REAL31 saisies automatiquement dans ESTALE (REA-11, 2026-10-01).
--
-- Une facture de gestion courante emise chez Pennylane, une fois VALIDEE, est creee
-- dans la compta ESTALE de la copropriete (createEntry, statut « bon a payer »).
-- Ces deux colonnes en gardent la trace :
--   - estale_entry_id : l'ecriture creee chez ESTALE. Presente = deja envoyee, la
--     facture ne repart jamais (anti-doublon cote intranet).
--   - estale_erreur   : pourquoi elle n'est pas partie (brouillon Pennylane pas encore
--     valide, exercice verrouille, panne). Presente = bouton « Renvoyer dans ESTALE ».
-- Les deux vides = facture non concernee (copro hors ESTALE, autre prestation).
--
-- Idempotent. A passer a la main dans l'editeur SQL Supabase (comme le reste de supabase/sql).

alter table public.intranet_factures
  add column if not exists estale_entry_id text,
  add column if not exists estale_erreur   text;
