-- La FONCTION d'un collaborateur (16/09/2026, Sekou : « pas "autres" mais leur vrai rôle »).
-- Portée par l'intranet : l'enum public."UserRole" d'App A ne connaît que AUTRE pour la vente,
-- la location et l'accueil, et on ne touche pas au schéma du patron. Liste fermée dans
-- src/lib/domain/collaborateur.ts (FONCTIONS). Seed d'après les pages équipe du site.

alter table public.intranet_collaborateur add column if not exists fonction text;

with f(nom, fonction) as (values
  ('Emmanuel LOPES', 'dirigeant'),
  ('Nadine LOPES', 'responsable_transaction_gestion'),
  ('Lea LOUSSOUARN', 'assistant_direction'),
  ('Sandrine LOPES', 'responsable_agence'),
  ('Xavier BERNIERE', 'directeur_vente'),
  ('Sandy CARRIER', 'directeur_copropriete'),
  ('Dimitri MYAUX', 'directeur_copropriete'),
  ('Rémi BARD', 'gestionnaire_copropriete'),
  ('Fanny SORIVELLE', 'gestionnaire_copropriete'),
  ('Mathilde ARLERI', 'gestionnaire_copropriete'),
  ('Sekou KOMA', 'gestionnaire_copropriete'),
  ('Océane RUELLAN', 'gestionnaire_copropriete'),
  ('Chrystelle BOUCHAUD', 'gestionnaire_copropriete'),
  ('Titouan GAUDIN', 'gestionnaire_copropriete'),
  ('Charlotte LECOMTE', 'gestionnaire_copropriete'),
  ('Nicolas PELOQUIN', 'gestionnaire_copropriete'),
  ('Mahaut CARTON', 'gestionnaire_copropriete'),
  ('Delphine LHOTE', 'charge_travaux'),
  ('Galiano GUAETTA', 'assistant_copropriete'),
  ('Julie BOIRON', 'assistant_copropriete'),
  ('Wilfrid-Huang TOHOUBI', 'assistant_copropriete'),
  ('Victoria DORLEAC', 'assistant_copropriete'),
  ('Sirine KHOUADER', 'assistant_copropriete'),
  ('Mylène PIN', 'assistant_copropriete'),
  ('Elsa PEIXOTO', 'comptable_copropriete'),
  ('Isabelle ANGLADE', 'comptable_copropriete'),
  ('Romain GOBERT', 'assistant_comptable'),
  ('Clementine VIGNERON', 'comptable_entreprise'),
  ('Baptiste ERCOLE', 'conseiller_vente'),
  ('Lauren RIBEIRO', 'conseiller_vente'),
  ('Daniyor ROZMETOV', 'conseiller_vente'),
  ('Erwan LEGALL', 'conseiller_vente'),
  ('Julie NICOLAS', 'conseiller_vente'),
  ('Josephine DENIS', 'conseiller_location'),
  ('Clara TORRES', 'conseiller_location'),
  ('Jennifer GAUTHIER', 'conseiller_location'),
  ('Vanessa KERVINIO', 'assistant_commercial'),
  ('Camilia FABIEN', 'assistant_commercial'),
  ('Laurence MASSONI', 'responsable_gestion_locative'),
  ('Claire GARRIAUX', 'gestionnaire_locative'),
  ('Lea CELESTINE', 'gestionnaire_locative'),
  ('Elodie FORTIN', 'gestionnaire_locative'),
  ('Natacha POISSON', 'assistant_gestionnaire_locative'),
  ('Neis LATRECHE', 'assistant_administratif'),
  ('Ana DA COSTA GOMES', 'assistant_administratif')
)
insert into public.intranet_collaborateur (user_id, fonction, maj_par)
select u.id, f.fonction, 'sql 16/09/2026'
from f join public."User" u on u.name ilike f.nom
on conflict (user_id) do update set fonction = excluded.fonction, maj_par = excluded.maj_par, updated_at = now();
