-- Seed de la grille tarifaire (public.intranet_tarifs).
-- Source : liste SharePoint « Tarifs » du site https://real31france.sharepoint.com/sites/Reality
-- (GUID e4cf4ac7-3065-4c1a-88b7-29f6f6942b0f), exportee en CSV le 2026-07-20.
--
-- Les montants sont des TTC (convention actee : le HT facture = TTC / 1,2).
-- Verification a l'import : plusieurs tarifs donnent un HT rond une fois divises
-- par 1,2 (AGE -> 34,00 / CSSupp -> 190,00 / PreEtatDate -> 245,00), ce qui
-- corrobore la convention TTC.
--
-- Re-executable sans risque : un tarif deja present est mis a jour, pas duplique.
-- A executer dans le SQL editor Supabase (base suivi-contrats-copros).

insert into public.intranet_tarifs (annee, identifiant_prestation, libelle, montant_ttc) values
  (2024, 'TauxHoraire', 'Taux Horaire', 160.45),
  (2025, 'AGE', 'AGE', 40.00),
  (2025, 'AssExp', 'Sinistre : expertise', 105.00),
  (2025, 'CSSupp', 'CS supplémentaire', 223.80),
  (2025, 'DelivranceCopie', 'Délivrance sur support papier', 74.00),
  (2025, 'DepLieu', 'Sinistre : déplacement', 94.00),
  (2025, 'DossierAssureur', 'Sinistre : suivi dossier', 115.00),
  (2025, 'DossierAvocat', 'Constitution dossier avocat/huissier/assureur protection juridique', 194.00),
  (2025, 'DossierEmprunt', 'Constitution et suivi dossier d''emprunt', 24.75),
  (2025, 'DossierJustice', 'Constitution du dossier transmis à l''auxiliaire de justice', 193.00),
  (2025, 'Echeancier', 'Conclusion d''un protocole d''accord', 98.00),
  (2025, 'EtatDate', 'Etablissement de l''état daté', 380.00),
  (2025, 'Hypotheque', 'Frais de constitution ou de mainlevée d''hypothèque', 445.00),
  (2025, 'ImmatInitiale', 'Immatriculation initiale du syndicat', 180.00),
  (2025, 'Injonction', 'Dépôt d''une requête en injonction de payer', 203.00),
  (2025, 'MED', 'Mise en demeure', 60.00),
  (2025, 'MesConser', 'Sinistre : mesures conservatoires', 210.00),
  (2025, 'ModifRCP', 'Publication de l''EDD/RCP ou des modifications apportées à ces actes', 25.75),
  (2025, 'Opposition', 'Opposition sur mutation', 255.00),
  (2025, 'PreEtatDate', 'Etablissement du pré-état daté', 294.00),
  (2025, 'RepriseCompta', 'Reprise de la comptabilité', 45.80),
  (2025, 'TauxHoraire', 'Taux horaire', 160.45),
  (2025, 'VisiteSupp', 'Visite supplémentaire', 223.80),
  (2026, 'AGE', 'AGE', 40.80),
  (2026, 'AssExp', 'Sinistre : expertise', 137.00),
  (2026, 'CSSupp', 'CS supplémentaire', 228.00),
  (2026, 'DelivranceCopie', 'Délivrance sur support papier', 75.00),
  (2026, 'DepLieu', 'Sinistre : déplacement', 95.00),
  (2026, 'DossierAssureur', 'Sinistre : suivi dossier', 117.00),
  (2026, 'DossierAvocat', 'Constitution dossier avocat/huissier/assureur protection juridique', 197.80),
  (2026, 'DossierEmprunt', 'Constitution et suivi dossier d''emprunt (alinéa 1 et 2 loi 65)', 25.25),
  (2026, 'DossierEmpruntIII', 'Constitution et suivi dossier d''emprunt III art 26.4 loi de 65', 75.00),
  (2026, 'DossierEmpruntIIIGestion', 'Gestion courante du dossier d''emprunt III art 26.4 loi de 65', 35.00),
  (2026, 'DossierJustice', 'Constitution du dossier transmis à l''auxiliaire de justice', 196.00),
  (2026, 'Echeancier', 'Conclusion d''un protocole d''accord', 99.00),
  (2026, 'EtatDate', 'Etablissement de l''état daté', 380.00),
  (2026, 'Hypotheque', 'Frais de constitution ou de mainlevée d''hypothèque', 453.00),
  (2026, 'ImmatInitiale', 'Immatriculation initiale du syndicat', 183.00),
  (2026, 'Injonction', 'Dépôt d''une requête en injonction de payer', 207.00),
  (2026, 'MED', 'Mise en demeure', 60.00),
  (2026, 'MesConser', 'Sinistre : mesures conservatoires', 214.00),
  (2026, 'ModifRCP', 'Publication de l''EDD/RCP ou des modifications apportées à ces actes', 26.25),
  (2026, 'Opposition', 'Opposition sur mutation', 260.00),
  (2026, 'PreEtatDate', 'Etablissement du pré-état daté', 294.00),
  (2026, 'RepriseCompta', 'Reprise de la comptabilité', 46.50),
  (2026, 'TauxHoraire', 'Taux horaire', 163.65),
  (2026, 'VisiteSupp', 'Visite supplémentaire', 228.00)
on conflict (annee, identifiant_prestation) do update
  set montant_ttc = excluded.montant_ttc,
      libelle     = excluded.libelle,
      updated_at  = now();
