-- Module « Contrats & contrôles » (REA-333) : les 6 modèles de mail au conseil syndical de
-- l'ancienne application « Suivi des Contrats Copros » (table "EmailTemplate", clés
-- gas_offer_comparison, insurance_offer_comparison, elevator_ctq_single_quote,
-- elevator_ctq_quote_comparison, gas_vmc_ctq_single_quote, gas_vmc_ctq_quote_comparison)
-- recopiés dans public.intranet_mail_modeles, administrés depuis /admin/modeles-mail comme
-- les autres (plan §5.2). Textes LUS EN BASE le 16/10/2026 (lecture seule), recopiés tels
-- quels, aux accents près (« Echéance » -> « Échéance ») et aux variables près, renommées dans
-- le vocabulaire de l'intranet.
--
-- Agence null = tout le cabinet. auteur_email 'reprise-suivi-contrats'. Insérés seulement si
-- aucun modèle du même titre n'existe pour le cabinet : rejouable sans doublon.
--
-- CONTRAT AVEC LE SERVICE MAIL (src/lib/services/contrats-copro/mail-cs, autre agent).
-- Variables attendues dans l'objet et le corps, par modèle :
--
--   Communes aux 6
--     {{copro_nom}}                  nom de la copropriété
--     {{copro_code}}                 code copro (S004…) ; la source écrivait « {{copro}}{{coproRef}} »
--                                    où coproRef rendait « (S001) » avec l'espace devant, ou rien.
--                                    Dans l'intranet le code existe toujours : « {{copro_nom}} ({{copro_code}}) ».
--   Contrats : comparatif des offres gaz
--     {{contrat_actuel_fournisseur}} fournisseur du contrat gaz actuel
--     {{contrat_actuel_type_prix}}   type de prix du contrat actuel (Variable / Fixe)
--     {{contrat_actuel_montant}}     montant du contrat gaz actuel
--     {{contrat_actuel_echeance}}    échéance du contrat gaz actuel
--     {{offres}}                     MARQUEUR DE SECTION : le tableau des offres reçues, rendu
--                                    en HTML par le service (pas une simple substitution texte) ;
--                                    le corps est coupé sur le PREMIER {{offres}}
--   Contrats : comparatif des propositions d'assurance
--     {{contrat_actuel_assureur}}    assureur du contrat actuel
--     {{contrat_actuel_prime}}       prime actuelle
--     {{contrat_actuel_echeance}}    échéance du contrat d'assurance actuel
--     {{offres}}                     idem, tableau des propositions
--   Contrats : devis CTQ ascenseur / Contrats : devis VMC gaz (devis unique, SANS {{offres}})
--     {{devis_prestataire}}          prestataire du devis retenu, sinon de l'unique devis reçu
--     {{devis_montant}}              montant du même devis
--   Contrats : comparatif des devis CTQ ascenseur / Contrats : comparatif des devis VMC gaz
--     {{offres}}                     tableau des devis reçus
--
-- POINT À TRANCHER PAR LE SERVICE MAIL : le compositeur de l'intranet préfixe lui-même l'objet
-- par « CODE · Nom · Adresse » (objetCompose, src/lib/domain/mes-emails-composition.ts). Si le
-- service mail-cs passe par lui, les objets ci-dessous doublent la copro : il faudra alors
-- retirer « {{copro_nom}} ({{copro_code}}) » des objets (un update sur titre, pas un reseed).
-- Les objets sont gardés fidèles à la source en attendant.

insert into public.intranet_mail_modeles (titre, objet, corps, agence, actif, auteur_email)
select v.titre, v.objet, v.corps, null, true, 'reprise-suivi-contrats'
from (values
  ($c$Contrats : comparatif des offres gaz$c$,
   $c$Renouvellement du contrat gaz - {{copro_nom}} ({{copro_code}}) - Comparatif des offres$c$,
   $c$Bonjour,

Dans le cadre du renouvellement du contrat de gaz de votre copropriété, veuillez trouver ci-dessous un comparatif entre le contrat actuellement en vigueur et les offres reçues.

Contrat actuel
- Fournisseur : {{contrat_actuel_fournisseur}}
- Montant : {{contrat_actuel_montant}}
- Échéance : {{contrat_actuel_echeance}}
- Type de prix : {{contrat_actuel_type_prix}}

Offres reçues
{{offres}}

Nous restons à votre disposition pour échanger sur ces éléments.$c$),

  ($c$Contrats : comparatif des propositions d'assurance$c$,
   $c$Renouvellement du contrat d'assurance - {{copro_nom}} ({{copro_code}}) - Comparatif des propositions$c$,
   $c$Bonjour,

Dans le cadre du renouvellement du contrat d'assurance de votre copropriété {{copro_nom}}, veuillez trouver ci-dessous un comparatif entre le contrat actuellement en vigueur et les propositions reçues.

Contrat actuel
- Assureur : {{contrat_actuel_assureur}}
- Prime actuelle : {{contrat_actuel_prime}}
- Échéance : {{contrat_actuel_echeance}}

Propositions reçues
{{offres}}

Nous restons à votre disposition pour échanger sur ces éléments.$c$),

  ($c$Contrats : devis CTQ ascenseur$c$,
   $c${{copro_nom}} ({{copro_code}}) - Contrôle technique quinquennal de l'ascenseur$c$,
   $c$Madame, Monsieur, membres du conseil syndical,

Le contrôle technique quinquennal de l'ascenseur de votre copropriété doit être réalisé. Ce contrôle est une obligation réglementaire.

Nous avons consulté un prestataire et vous soumettons son devis :

Prestataire : {{devis_prestataire}}
Montant : {{devis_montant}}

Nous restons à votre disposition pour toute précision et vous remercions de bien vouloir nous faire part de votre accord.$c$),

  ($c$Contrats : comparatif des devis CTQ ascenseur$c$,
   $c${{copro_nom}} ({{copro_code}}) - Contrôle technique quinquennal de l'ascenseur : devis$c$,
   $c$Madame, Monsieur, membres du conseil syndical,

Le contrôle technique quinquennal de l'ascenseur de votre copropriété doit être réalisé. Ce contrôle est une obligation réglementaire.

Nous avons mis plusieurs prestataires en concurrence et vous soumettons les devis reçus :

{{offres}}

Nous restons à votre disposition pour toute précision et vous remercions de bien vouloir nous indiquer le devis que vous retenez.$c$),

  ($c$Contrats : devis VMC gaz$c$,
   $c${{copro_nom}} ({{copro_code}}) - Contrôle de la VMC gaz$c$,
   $c$Madame, Monsieur, membres du conseil syndical,

Le contrôle périodique de la ventilation mécanique contrôlée gaz de votre copropriété doit être réalisé. Ce contrôle est une obligation réglementaire liée à la sécurité des installations.

Nous avons consulté un prestataire et vous soumettons son devis :

Prestataire : {{devis_prestataire}}
Montant : {{devis_montant}}

Nous restons à votre disposition pour toute précision et vous remercions de bien vouloir nous faire part de votre accord.$c$),

  ($c$Contrats : comparatif des devis VMC gaz$c$,
   $c${{copro_nom}} ({{copro_code}}) - Contrôle de la VMC gaz : devis$c$,
   $c$Madame, Monsieur, membres du conseil syndical,

Le contrôle périodique de la ventilation mécanique contrôlée gaz de votre copropriété doit être réalisé. Ce contrôle est une obligation réglementaire liée à la sécurité des installations.

Nous avons mis plusieurs prestataires en concurrence et vous soumettons les devis reçus :

{{offres}}

Nous restons à votre disposition pour toute précision et vous remercions de bien vouloir nous indiquer le devis que vous retenez.$c$)
) as v(titre, objet, corps)
where not exists (
  select 1 from public.intranet_mail_modeles m
  where m.titre = v.titre and m.agence is null
);

-- Contrôle après passage : 6 lignes au premier passage, toujours 6 ensuite.
-- select titre, objet from public.intranet_mail_modeles
--   where auteur_email = 'reprise-suivi-contrats' order by titre;
