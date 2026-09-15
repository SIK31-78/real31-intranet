-- Frais postaux au réel sur le contrat édité (patron, 15/09/2026). Le contrat imprimé
-- dit « donne lieu à remboursement » au lieu du forfait ; le récap AG doit le savoir
-- pour proposer le bon choix. Défaut : forfait, y compris pour les 460 éditions MYTHEC.
-- Idempotent.

alter table public.intranet_historique_contrats
  add column if not exists frais_postaux_reels boolean not null default false;

comment on column public.intranet_historique_contrats.frais_postaux_reels is
  'true = frais postaux au reel sur ce document (variante du § 7.1.5). false = forfait.';
