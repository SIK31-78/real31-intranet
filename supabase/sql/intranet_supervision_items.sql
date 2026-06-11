-- Table native intranet : etat de la supervision AG (checklist 34 items + visa).
-- Vit dans le schema public de la base patron (decision : tables natives dans public).
-- A executer une fois dans le SQL editor Supabase.
--
-- Le template des items (sections, libelles) vit en CODE ; cette table ne porte que
-- l'ETAT par AG, cle par (copropriete_id, ag_date, item_id).
--   - item_id = slug d'item (ex 'log.date-ag-confirmee') : statut in
--     non_verifie | ok | probleme | non_applicable, + commentaire.
--   - item_id = '__conclusion__' : ligne reservee au visa final (statut 'conclue',
--     marque_par/marque_at = qui/quand a conclu).
-- Pas de FK vers public."Copropriete" (reference logique). RLS activable (service_role passe).

create table if not exists public.intranet_supervision_items (
  id              uuid primary key default gen_random_uuid(),
  copropriete_id  text not null,
  ag_date         date not null,
  item_id         text not null,
  statut          text not null,
  commentaire     text,
  marque_par      text,
  marque_at       timestamptz,
  created_at      timestamptz not null default now(),
  unique (copropriete_id, ag_date, item_id)
);

create index if not exists intranet_supervision_items_ag_idx
  on public.intranet_supervision_items (copropriete_id, ag_date);
