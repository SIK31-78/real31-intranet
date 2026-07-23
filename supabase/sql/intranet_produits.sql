-- Reprise de la liste SharePoint « Produits » (site real31france/Reality),
-- export du 2026-07-22. A executer dans le SQL editor Supabase.
-- Re-executable sans risque.
--
-- Un produit par (categorie, agence) : porte le libelle exact affiche sur la
-- facture, l'identifiant produit Pennylane, et le COMPTE COMPTABLE (rattachement
-- compta). Le flow legacy resolvait le produit par l'agence de la copropriete.
-- ASN n'a pas de produit : aucune copro active n'y est rattachee (verifie).

create table if not exists public.intranet_produits (
  id                   uuid primary key default gen_random_uuid(),
  categorie            text not null,   -- ex "Honoraires gestion courante"
  agence               text not null,   -- ML / LGC / HLS
  titre                text not null,   -- libelle Pennylane, ex "Honoraires gestion courante LGC"
  pennylane_product_id text not null,   -- IdentifiantPennylaneProduit
  ledger_account_id    text not null,   -- IdentifiantCompteComptable (compte de produits)
  created_at           timestamptz not null default now(),
  unique (categorie, agence)
);

-- Lien produit sur chaque ligne de facture : porte la CATEGORIE, resolue en
-- produit (libelle + ids) au moment de l'emission selon l'agence de la copro.
alter table public.intranet_facture_lignes
  add column if not exists categorie_produit text;

insert into public.intranet_produits (categorie, agence, titre, pennylane_product_id, ledger_account_id)
values
  ('Forfait frais postaux', 'HLS', 'Forfait frais postaux HLS', '2248159', '503980005'),
  ('Forfait frais postaux', 'LGC', 'Forfait frais postaux LGC', '2248161', '503980006'),
  ('Forfait frais postaux', 'ML', 'Forfait frais postaux ML', '2248162', '503980003'),
  ('Honoraires complémentaires', 'HLS', 'Honoraires complémentaires HLS', '2248163', '503979981'),
  ('Honoraires complémentaires', 'LGC', 'Honoraires complémentaires LGC', '2248165', '503979969'),
  ('Honoraires complémentaires', 'ML', 'Honoraires complémentaires ML', '2248166', '503979900'),
  ('Honoraires gestion courante', 'HLS', 'Honoraires gestion courante HLS', '2248180', '503979967'),
  ('Honoraires gestion courante', 'LGC', 'Honoraires gestion courante LGC', '2248182', '503979968'),
  ('Honoraires gestion courante', 'ML', 'Honoraires gestion courante ML', '2248183', '503979909'),
  ('Honoraires pré état daté', 'HLS', 'Honoraires pré état daté HLS', '2248176', '503979984'),
  ('Honoraires pré état daté', 'LGC', 'Honoraires pré état daté LGC', '2248178', '503979973'),
  ('Honoraires pré état daté', 'ML', 'Honoraires pré état daté ML', '2248179', '503979972'),
  ('Honoraires suivi sinistre', 'HLS', 'Honoraires suivi sinistre HLS', '2248197', '503979990'),
  ('Honoraires suivi sinistre', 'LGC', 'Honoraires suivi sinistre LGC', '2248199', '503979992'),
  ('Honoraires suivi sinistre', 'ML', 'Honoraires suivi sinistre ML', '2248200', '503979993'),
  ('Honoraires suivi travaux', 'HLS', 'Honoraires suivi travaux HLS', '2248204', '503979989'),
  ('Honoraires suivi travaux', 'LGC', 'Honoraires suivi travaux LGC', '2248202', '503979986'),
  ('Honoraires suivi travaux', 'ML', 'Honoraires suivi travaux ML', '2248203', '503979988'),
  ('Questionnaire notaire', 'HLS', 'Questionnaire notaire HLS', '2248187', '503979985'),
  ('Questionnaire notaire', 'LGC', 'Questionnaire notaire LGC', '2248189', '503979974'),
  ('Questionnaire notaire', 'ML', 'Questionnaire notaire ML', '2248190', '503979902')
on conflict (categorie, agence) do update
  set titre = excluded.titre,
      pennylane_product_id = excluded.pennylane_product_id,
      ledger_account_id = excluded.ledger_account_id;

select categorie, count(*) as agences from public.intranet_produits group by categorie order by categorie;
