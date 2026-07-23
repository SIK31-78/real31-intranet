-- Table native intranet : REMONTEES DES COLLABORATEURS (bug / idee) + roadmap + changelog.
-- Vit dans le schema public de la base patron (lgrsnrclufsulglbwcqi), comme les autres
-- tables natives intranet_* (jalons / supervision_items / dossiers / api_keys...).
--
-- A executer une fois dans le SQL editor Supabase de la base cible.
--
-- UNE seule table derriere TROIS surfaces :
--   1. le bouton "Signaler un bug / une idee" (partout dans l'app)  -> INSERT ;
--   2. le panneau /admin/feedback (super-admin, la roadmap de travail) -> SELECT/UPDATE ;
--   3. la page /nouveautes (tous les collaborateurs, la vitrine)    -> SELECT public.
--
-- CONFIDENTIALITE : la page publique n'expose JAMAIS auteur_email / description /
-- note_interne. La projection publique (domain/feedback.ts versEntreePublique) ne garde
-- que {type, titre, statut, livre_at} ; le cloisonnement est applique EN CODE (service
-- get-nouveautes + listerPublic bornes aux statuts prevu/en_cours/livre).
--
-- Correspond EXACTEMENT a ce que lit/ecrit l'adapter
-- src/lib/adapters/supabase/supabase-feedback-repository.ts :
--   SELECT id, type, titre, description, page, auteur_email, auteur_initiales,
--          severite, statut, priorite, note_interne, raison_ecart, created_at,
--          updated_at, livre_at
--   INSERT type, titre, description, page, auteur_email, auteur_initiales, severite
--   UPDATE statut, raison_ecart, livre_at, updated_at        (changement de statut)
--   UPDATE titre, priorite, note_interne, updated_at         (edition admin)
--
-- Pas de FK vers public."User" : reference logique par auteur_email, comme les autres
-- tables intranet_* (minimise le drift Prisma cote App A).
-- RLS laissee off (comme le reste de public et les autres tables intranet_*) ;
-- l'intranet lit/ecrit via la cle service_role, le cloisonnement (super-admin pour
-- l'admin, projection publique pour la vitrine) est applique EN CODE.

create table if not exists public.intranet_feedback (
  id                uuid primary key default gen_random_uuid(),
  type              text not null check (type in ('bug','idee')),
  titre             text not null,                             -- court, editable par l'admin (derive de la description a la creation)
  description       text not null,                             -- le texte du collaborateur ; JAMAIS expose sur /nouveautes
  page              text,                                      -- pathname capture automatiquement au moment du signalement
  auteur_email      text,                                      -- ref logique = public."User".email ; JAMAIS expose sur /nouveautes
  auteur_initiales  text,                                      -- ex 'SK' (affichage admin uniquement)
  severite          text not null check (severite in ('bloquant','genant','confort')),
  statut            text not null default 'nouveau'
                    check (statut in ('nouveau','prevu','en_cours','livre','ecarte')),
  priorite          int,                                       -- NULL = non priorise ; ordre dans la roadmap "a venir"
  note_interne      text,                                      -- note de travail admin ; JAMAIS exposee au public
  raison_ecart      text,                                      -- obligatoire (regle domaine) quand statut = 'ecarte'
  created_at        timestamptz not null default now(),
  updated_at        timestamptz,                               -- touche a chaque changement de statut / edition admin
  livre_at          timestamptz                                -- renseigne quand statut -> 'livre' : sert de date du changelog
);

-- Triage admin : filtre par statut (worklist par etat).
create index if not exists intranet_feedback_statut_idx
  on public.intranet_feedback (statut);

-- Liste antechronologique (dernieres remontees en premier).
create index if not exists intranet_feedback_created_idx
  on public.intranet_feedback (created_at desc);
