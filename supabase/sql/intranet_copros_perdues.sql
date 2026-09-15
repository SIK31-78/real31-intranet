-- Copropriétés perdues (Sekou, 15/09/2026) : le module « Perdre une copropriété » de la
-- gestion courante passe la copro INACTIVE dans public."Copropriete" (App A, le
-- référentiel partagé) et garde ici la trace : quand, pourquoi, par qui.
--
-- App A n'a pas de date de fin de gestion : sans cette table, on saurait qu'une copro est
-- partie, jamais depuis quand - et le dernier trimestre à facturer au prorata l'exige.
--
-- RLS laissée off comme le reste des intranet_* (service_role). Idempotent.

create table if not exists public.intranet_copros_perdues (
  id              uuid primary key default gen_random_uuid(),
  copropriete_id  text not null,                 -- code affiché (referenceCrypto), ex 'S182'
  fin_gestion     date not null,                 -- dernier jour géré par le cabinet
  motif           text,                          -- libre : « changement de syndic », « vente »...
  par             text not null,                 -- nom complet de qui a acté la perte
  cree_le         timestamptz not null default now()
);

create index if not exists intranet_copros_perdues_copro_idx
  on public.intranet_copros_perdues (copropriete_id, cree_le desc);

comment on table public.intranet_copros_perdues is
  'Trace des coproprietes perdues (passees INACTIVE depuis l''intranet). Le statut lui-meme vit dans Copropriete.status.';
