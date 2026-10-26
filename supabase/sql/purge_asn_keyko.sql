-- PURGE de l'import Keyko d'Asnières (REA-53), à la demande, JAMAIS en routine.
--
-- ⛔ HORS SERVICE DEPUIS LE 26/10/2026 : le vrai import est fait (dump du 26/10) et Asnières
-- travaille dans l'intranet. Le bloc « refus » ci-dessous arrête le script avant toute
-- suppression. Ne le retirer qu'en sachant qu'on efface des sorties et retours réels.
--
-- Sert une seule fois : effacer l'import de TEST fait sur le vieux dump du 23/09 (décision
-- Sekou du 21/10/2026) avant le vrai import sur un dump frais. Après le vrai import, ce
-- fichier ne doit plus être passé : il effacerait des gestes réels d'Asnières.
--
-- AVANT : retirer les photos du bucket (le SQL ne vide pas le Storage) :
--   node scripts/import-cles-keyko.mjs --dump "<dump>" --ecrire --retirer-photos
--
-- Le journal des mouvements est immuable par déclencheur (ADR-040) : on le coupe le temps de
-- la purge, dans la même transaction, puis on le remet. Si une ligne échoue, tout est annulé
-- et le déclencheur reste en place.

begin;

-- Refus : le vrai import est fait, purger effacerait les gestes réels d'Asnières.
do $$
begin
  raise exception 'purge_asn_keyko.sql est hors service depuis le vrai import du 26/10/2026 (REA-53) : rien n''a été supprimé.';
end;
$$;

-- Inventaire avant (à comparer au rapport de l'import)
select 'trousseaux' as quoi, count(*) from public.intranet_cles_trousseau where agence_code = 'ASN'
union all select 'biens', count(*) from public.intranet_bien where agence_code = 'ASN'
union all select 'mouvements', count(*) from public.intranet_cles_mouvement where agence_code = 'ASN'
union all select 'prêts', count(*) from public.intranet_cles_pret p join public.intranet_cles_trousseau t on t.id = p.trousseau_id where t.agence_code = 'ASN';

alter table public.intranet_cles_mouvement disable trigger intranet_cles_mouvement_immuable_trg;

delete from public.intranet_cles_mouvement
 where agence_code = 'ASN'
    or trousseau_id in (select id from public.intranet_cles_trousseau where agence_code = 'ASN');

-- Prêts et réservations se citent l'un l'autre : on délie avant de supprimer.
update public.intranet_cles_pret set reservation_id = null
 where trousseau_id in (select id from public.intranet_cles_trousseau where agence_code = 'ASN');
update public.intranet_cles_reservation set pret_id = null
 where trousseau_id in (select id from public.intranet_cles_trousseau where agence_code = 'ASN');
delete from public.intranet_cles_reservation
 where trousseau_id in (select id from public.intranet_cles_trousseau where agence_code = 'ASN');
delete from public.intranet_cles_pret
 where trousseau_id in (select id from public.intranet_cles_trousseau where agence_code = 'ASN');

-- Les accès partent en cascade avec leur trousseau ; les liens de double d'abord.
update public.intranet_cles_trousseau set jumeau_de = null where agence_code = 'ASN';
delete from public.intranet_cles_trousseau where agence_code = 'ASN';

delete from public.intranet_bien where agence_code = 'ASN' and source = 'import_keyko';

-- Les entreprises créées par l'import, si plus rien ne les cite.
delete from public.intranet_cles_entreprise e
 where e.source = 'import_keyko'
   and not exists (select 1 from public.intranet_cles_pret p where p.entreprise_id = e.id)
   and not exists (select 1 from public.intranet_cles_reservation r where r.entreprise_id = e.id)
   and not exists (select 1 from public.intranet_cles_mouvement m where m.entreprise_id = e.id);

alter table public.intranet_cles_mouvement enable trigger intranet_cles_mouvement_immuable_trg;

commit;

-- Contrôle après : 0 partout, et le déclencheur actif (tgenabled = 'O')
select 'trousseaux' as quoi, count(*) from public.intranet_cles_trousseau where agence_code = 'ASN'
union all select 'biens', count(*) from public.intranet_bien where agence_code = 'ASN'
union all select 'mouvements', count(*) from public.intranet_cles_mouvement where agence_code = 'ASN'
union all select 'entreprises import_keyko', count(*) from public.intranet_cles_entreprise where source = 'import_keyko';
select tgname, tgenabled from pg_trigger where tgname = 'intranet_cles_mouvement_immuable_trg';
