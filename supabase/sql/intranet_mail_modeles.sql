-- Table native intranet : MODÈLES DE MAIL (REA-296), proposés dans « Envoyer un e-mail » et
-- dans les réponses de l'écran E-mails, modifiés depuis /admin/modeles-mail.
--
-- Décisions de Sekou du 15/10/2026 : un modèle appartient à une agence (code ML / LGC / HLS /
-- ASN) ou à tout le cabinet (agence null) ; seuls les admins et les responsables d'agence
-- les modifient (garde EN CODE : peutEditerModelesMail). Ce sont les mails SIMPLES, écrits à
-- une personne ; les communications à la copropriété vont dans les modèles de mailing ESTALE.
--
-- À exécuter une fois dans le SQL editor Supabase. Rejouable : la table et les modèles de
-- départ ne sont créés que s'ils manquent.
--
-- Correspond EXACTEMENT à l'adapter src/lib/adapters/supabase/supabase-modele-mail-repository.ts :
--   SELECT id, titre, objet, corps, agence, actif, auteur_email, created_at, updated_at
--   INSERT / UPDATE titre, objet, corps, agence, actif, auteur_email (+ updated_at)
--   DELETE by id
--
-- Pas de FK vers public."User" : référence logique par auteur_email. RLS laissée off (comme
-- le reste de public) ; l'intranet lit et écrit via la clé service_role.

create table if not exists public.intranet_mail_modeles (
  id            uuid primary key default gen_random_uuid(),
  titre         text not null,                 -- nom affiché dans la liste « Modèle »
  objet         text not null default '',      -- objet proposé (le préfixe copro est ajouté par l'intranet)
  corps         text not null,                 -- texte, variables {{copro_adresse}}, {{destinataire_nom}}…
  agence        text,                          -- code d'agence ; null = tout le cabinet
  actif         boolean not null default true, -- false = retiré des listes sans être supprimé
  auteur_email  text,                          -- dernier auteur (réf. logique public."User".email)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);

create index if not exists intranet_mail_modeles_agence_idx
  on public.intranet_mail_modeles (agence, actif);

-- Modèles de départ : repris des modèles d'événement Crypto les plus utilisés (export du
-- 15/10/2026, tri validé par Sekou, cf. Mythec-refactor/Migration communication/
-- tri-modeles-crypto.md). Sans la signature ni le bloc agence (Signitic signe), sans la ligne
-- « Réf » (en attente de REA-323). Insérés seulement si aucun modèle du même titre n'existe
-- pour la même agence : rejouer le fichier ne crée pas de doublon.
insert into public.intranet_mail_modeles (titre, objet, corps, agence, auteur_email)
select v.titre, v.objet, v.corps, v.agence, 'reprise-crypto'
from (values
  ('Mail simple', '',
   E'Immeuble concerné : {{copro_adresse}}\n\nMadame, Monsieur,\n\n\n\nCordialement,',
   'HLS'),
  ('Ordre de service', 'Ordre de service',
   E'Immeuble concerné : {{copro_adresse}}\n\nMadame, Monsieur,\n\nNous vous remercions de bien vouloir intervenir dans l''immeuble référencé ci-dessus dans les meilleurs délais.\n\nProblème constaté :\n\nModalités d''accès :\n\nPersonne à contacter sur place :\n\nNous vous en remercions par avance,\n\nCordialement,',
   'HLS'),
  ('Demande de devis', 'Devis',
   E'Immeuble concerné : {{copro_adresse}}\n\nMadame, Monsieur,\n\nNous vous remercions de bien vouloir nous établir votre proposition pour :\n\nProblème constaté :\n\nModalités d''accès :\n\nPersonne à contacter sur place :\n\nNous vous remercions par avance de votre retour,\n\nCordialement,',
   'HLS'),
  ('Devis validé', 'Devis validé',
   E'Immeuble concerné : {{copro_adresse}}\n\nMadame, Monsieur,\n\nNous vous retournons ci-joint votre devis signé bon pour accord et vous remercions de bien vouloir planifier l''intervention correspondante.\n\nModalités d''accès :\n\nNous vous en remercions par avance,\n\nCordialement,',
   'HLS'),
  ('Mail simple', '',
   E'Immeuble concerné : {{copro_adresse}}\n\nMadame, Monsieur,\n\n\n\nCordialement,',
   'LGC'),
  ('Ordre de service', 'Ordre de service',
   E'Immeuble concerné : {{copro_adresse}}\n\nMadame, Monsieur,\n\nNous vous remercions d''intervenir dans l''immeuble référencé ci-dessus dans les meilleurs délais.\n\nProblème constaté :\n\nModalités d''accès :\nCodes d''accès :\n\nPersonne à contacter sur place :\n\nLes clés se trouvent à votre disposition à notre agence.\nNos horaires d''ouverture sont : lundi au samedi de 09h30 à 12h30 et de 14h00 à 19h30 (fermeture à 18h00 le samedi)\n\nCordialement,',
   'LGC'),
  ('Devis validé', 'Devis validé',
   E'Immeuble concerné : {{copro_adresse}}\n\nMadame, Monsieur,\n\nNous vous prions de trouver ci-joint votre devis n° … dûment validé et signé.\n\nNous vous remercions d''en accuser bonne réception et de nous indiquer votre date d''intervention.\n\nCordialement,',
   'LGC'),
  ('Changement de syndic (fournisseur)', 'Changement de syndic - IMPORTANT',
   E'Immeuble concerné : {{copro_adresse}}\n\nRéférence du contrat :\n\nMadame, Monsieur,\n\nPar la présente, nous vous informons que nous avons été nommés syndic de la copropriété citée en référence.\n\nNous vous remercions de bien vouloir faire parvenir toutes les correspondances concernant cet immeuble par mail à l''adresse suivante :\n\nsyndic2@real31.fr\n\nLes factures doivent être libellées de la manière suivante :\n\nSDC {{copro_adresse}}\nC/O REAL 31\n13 rd pt du Souvenir Français\n92250 LA GARENNE-COLOMBES\n\nNous vous prions également de nous adresser la copie de vos attestations d''assurance professionnelle pour l''année en cours.\n\nCordialement,',
   'LGC')
) as v(titre, objet, corps, agence)
where not exists (
  select 1 from public.intranet_mail_modeles m
  where m.titre = v.titre and m.agence is not distinct from v.agence
);

-- Contrôle après passage : 8 modèles au premier passage, toujours 8 ensuite.
-- select agence, titre from public.intranet_mail_modeles order by agence, titre;
