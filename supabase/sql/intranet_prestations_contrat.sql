-- Facturation des prestations particulières du contrat (Sekou, 15/09/2026) : les 16 que
-- MYTHEC ne facturait pas (au lot, au copropriétaire, à l'heure, fixes). Trois choses :
--
-- 1. Un type de prestation de plus dans intranet_factures.
-- 2. Les tarifs FIGÉS au contrat : le récap AG photographie le barème de l'année de l'AG
--    dans le cycle ; modifier la grille en cours d'année ne touche plus les contrats déjà
--    signés (« tant qu'on n'a pas signé de nouveau contrat, ce sont les anciens »).
-- 3. Le produit Pennylane « Relance sur charges impayées » pour le recouvrement, celui
--    que le cabinet utilisait à la main (identifiants lus dans Pennylane le 15/09/2026).
--
-- RLS laissée off comme le reste des intranet_*. Idempotent.

alter table public.intranet_factures
  drop constraint if exists intranet_factures_type_prestation_check;
alter table public.intranet_factures
  add constraint intranet_factures_type_prestation_check
  check (type_prestation in (
    'depassement_cs', 'suivi_travaux', 'suivi_sinistre', 'pre_etat_date', 'etat_date',
    'depassement_ag', 'gestion_courante', 'prestation_contrat'
  ));

alter table public.intranet_suivi_contrats
  add column if not exists tarifs jsonb;
comment on column public.intranet_suivi_contrats.tarifs is
  'Tarifs TTC figes au contrat par le recap AG ({identifiant_prestation: montant}). NULL = cycle tarife par l''annee du bareme (regle historique).';

insert into public.intranet_produits (categorie, agence, titre, pennylane_product_id, ledger_account_id)
values
  ('Relance sur charges impayées', 'ML',  'Relance sur charges impayées ML',  '2248196', '503979916'),
  ('Relance sur charges impayées', 'LGC', 'Relance sur charges impayées LGC', '2248195', '503979935'),
  ('Relance sur charges impayées', 'HLS', 'Relance sur charges impayées HLS', '2248193', '503979937')
on conflict (categorie, agence) do nothing;
