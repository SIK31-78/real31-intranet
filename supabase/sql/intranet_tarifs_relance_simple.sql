-- REA-103 : la « Relance simple » rejoint la grille tarifaire (public.intranet_tarifs).
-- Tarif 2026 : 7,20 € TTC. Ligne INFORMATIVE : rien ne la facture automatiquement et
-- l'application ne l'exige pas (elle n'entre pas dans les « identifiants manquants »).
-- Le panneau /admin/tarifs la range dans « Autres prestations facturables (hors contrat) ».
-- Le contrat imprime ne la mentionne pas et n'est pas touche.
--
-- Pour 2027 et suivantes : la saisir dans /admin/tarifs (ou elle suit « Ouvrir l'année »).
-- Re-executable sans risque : la ligne deja presente est mise a jour, pas dupliquee.
-- A executer dans le SQL editor Supabase.

insert into public.intranet_tarifs (annee, identifiant_prestation, libelle, montant_ttc) values
  (2026, 'RelanceSimple', 'Relance simple', 7.20)
on conflict (annee, identifiant_prestation) do update
  set montant_ttc = excluded.montant_ttc,
      libelle     = excluded.libelle,
      updated_at  = now();
