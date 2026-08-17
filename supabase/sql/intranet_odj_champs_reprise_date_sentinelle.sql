-- Reprise des saisies d'ODJ tombees sur la date sentinelle 0001-01-01.
-- A executer dans le SQL editor Supabase (base patron). Rejouable sans risque.
--
-- ============================================================================
-- LE BUG (corrige en code le 2026-08-17, commit "fix(odj): une seule resolution
-- de la date d'AG pour la lecture ET l'ecriture")
-- ============================================================================
-- L'ecran /odj/<id> accepte deux formes d'URL : "S273" (code seul) et
-- "S273__2026-10-14" (code + date d'AG). Les deux cotes ne repliaient pas pareil
-- quand l'URL ne portait pas de date :
--   - la LECTURE prenait la prochaine AG de la copro (Copropriete."nextAGDate") ;
--   - l'ECRITURE prenait la sentinelle 0001-01-01, sans consulter la copro.
-- Depuis une URL nue, tout ce que le gestionnaire saisissait partait donc sur une
-- ligne que personne ne relit : pas d'erreur, pas d'affichage, la valeur
-- disparaissait a la premiere navigation.
--
-- Constat en base le 2026-08-17 : 17 lignes sur 0001-01-01, 9 copros, et les 9
-- ont une "nextAGDate" reelle -> 100 % de ces ecritures etaient orphelines.
-- Dont trois clotures de reunion (S024 / RB, S172 / DM, S273 / CHB) et six champs
-- saisis sur S290.
--
-- ============================================================================
-- CE QUE FAIT CE SCRIPT
-- ============================================================================
-- Il deplace chaque ligne sentinelle vers la VRAIE date d'AG de sa copropriete,
-- lue par jointure sur public."Copropriete" ("referenceCrypto" = le CODE, c'est
-- bien le code qui est stocke dans intranet_odj_champs.copropriete_id, pas l'uuid).
--
-- GENERIQUE, pas une liste de codes : d'autres lignes sentinelles peuvent
-- apparaitre d'ici a ce qu'il soit passe (le correctif code n'est pas encore
-- deploye). Le rejouer une fois le travail fait ne fait rien.
--
-- CE QU'IL NE TOUCHE PAS : une copro SANS "nextAGDate" reste sur la sentinelle.
-- C'est le cas legitime (ODJ prepare avant que la date soit fixee) ; l'app le
-- reporte toute seule quand la date arrive (reporterOdjSansDate).
--
-- ============================================================================
-- COLLISIONS : LA PLUS RECENTE GAGNE (regle tranchee par Sekou)
-- ============================================================================
-- La table porte "unique (copropriete_id, ag_date, champ_id)" : si le meme champ
-- a ete saisi DEUX fois -- une fois depuis l'URL nue (-> sentinelle), une fois
-- depuis l'URL datee (-> vraie date) -- le deplacement violerait l'unicite.
--
-- 3 collisions mesurees le 2026-08-17 sur 17 lignes, et le sens s'INVERSE :
--   S113 / comptes.budget             sentinelle 19/06 08:24 vs vraie date 20/06 11:55
--   S113 / comptes.depenses-courantes sentinelle 19/06 08:23 vs vraie date 20/06 11:55
--   SE999 / visio                     sentinelle 28/07 11:40 vs vraie date 20/06 14:26
-- Ni « la sentinelle gagne » ni « la vraie date gagne » ne convient donc : sur
-- S113 la saisie visible a l'ecran est la plus recente, sur SE999 c'est la saisie
-- perdue. On garde LA PLUS RECENTE (marque_at), la perdante est SUPPRIMEE --
-- c'est la derniere intention du gestionnaire, quel que soit le chemin par lequel
-- elle est passee. Egalite parfaite : la ligne deja a la vraie date l'emporte
-- (elle est celle que l'ecran affiche aujourd'hui, on ne change rien pour rien).
-- marque_at est nullable : on retombe sur created_at plutot que de comparer a NULL.


-- ============================================================================
-- 1. INVENTAIRE AVANT (lecture seule -- a lancer seul, ne modifie rien)
-- ============================================================================
-- "deplacee"          : la ligne part telle quelle sur la vraie date.
-- "collision-gagnante": elle ecrase l'autre, qui est supprimee.
-- "collision-perdante": elle est supprimee.
-- "laissee-sentinelle": copro sans date d'AG connue -> on n'y touche pas.

with sentinelle as (
  select o.id, o.copropriete_id, o.champ_id, o.valeur, o.marque_par,
         coalesce(o.marque_at, o.created_at) as marque,
         c."nextAGDate"::date                as vraie_date
  from public.intranet_odj_champs o
  left join public."Copropriete" c on c."referenceCrypto" = o.copropriete_id
  where o.ag_date = date '0001-01-01'
),
appariee as (
  select s.*,
         e.id                                as id_existante,
         coalesce(e.marque_at, e.created_at) as marque_existante
  from sentinelle s
  left join public.intranet_odj_champs e
    on  e.copropriete_id = s.copropriete_id
    and e.ag_date        = s.vraie_date
    and e.champ_id       = s.champ_id
)
select
  copropriete_id,
  champ_id,
  vraie_date,
  marque            as marque_sentinelle,
  marque_existante  as marque_vraie_date,
  marque_par,
  left(coalesce(valeur, '(efface)'), 60) as apercu_valeur,
  case
    when vraie_date is null            then 'laissee-sentinelle'
    when id_existante is null          then 'deplacee'
    when marque > marque_existante     then 'collision-gagnante'  -- la sentinelle gagne
    else                                    'collision-perdante'  -- la vraie date gagne
  end as traitement
from appariee
order by copropriete_id, champ_id;


-- ============================================================================
-- 2. REPRISE (transaction : arbitrage puis deplacement)
-- ============================================================================
begin;

-- 2a. Arbitrage des collisions : on supprime la PERDANTE, dans les deux sens.
--     Sans cette etape, le UPDATE de 2b violerait l'unicite et la transaction
--     entiere echouerait -- donc rien ne serait repris.
with sentinelle as (
  select o.id, o.copropriete_id, o.champ_id,
         coalesce(o.marque_at, o.created_at) as marque,
         c."nextAGDate"::date                as vraie_date
  from public.intranet_odj_champs o
  join public."Copropriete" c on c."referenceCrypto" = o.copropriete_id
  where o.ag_date = date '0001-01-01'
    and c."nextAGDate" is not null
),
collision as (
  select s.id                              as id_sentinelle,
         e.id                              as id_vraie_date,
         s.marque                          as marque_sentinelle,
         coalesce(e.marque_at, e.created_at) as marque_vraie_date
  from sentinelle s
  join public.intranet_odj_champs e
    on  e.copropriete_id = s.copropriete_id
    and e.ag_date        = s.vraie_date
    and e.champ_id       = s.champ_id
),
perdante as (
  -- Egalite -> on garde la ligne deja a la vraie date (rien ne bouge a l'ecran).
  select case when marque_sentinelle > marque_vraie_date
              then id_vraie_date
              else id_sentinelle
         end as id
  from collision
)
delete from public.intranet_odj_champs
where id in (select id from perdante);

-- 2b. Deplacement : chaque sentinelle restante rejoint la vraie date d'AG.
--     Les copros sans "nextAGDate" sont exclues par la jointure -> intactes.
update public.intranet_odj_champs o
set    ag_date = c."nextAGDate"::date
from   public."Copropriete" c
where  c."referenceCrypto" = o.copropriete_id
  and  o.ag_date = date '0001-01-01'
  and  c."nextAGDate" is not null;

commit;


-- ============================================================================
-- 3. CONTROLE APRES
-- ============================================================================
-- "a_reprendre" DOIT valoir 0 : plus aucune ligne sentinelle pour une copro qui
-- a une date d'AG. "sans_date_ag" peut rester > 0, c'est le cas legitime.

select
  count(*) filter (where c."nextAGDate" is not null) as a_reprendre,
  count(*) filter (where c."nextAGDate" is null)     as sans_date_ag
from public.intranet_odj_champs o
left join public."Copropriete" c on c."referenceCrypto" = o.copropriete_id
where o.ag_date = date '0001-01-01';

-- Les clotures de reunion, la ou elles font le plus mal : les trois perdues
-- (S024 / RB, S172 / DM, S273 / CHB) doivent apparaitre sur la date d'AG de leur
-- copro, donc "sur_la_bonne_date" = true.
select o.copropriete_id,
       o.ag_date,
       c."nextAGDate"::date               as date_ag_copro,
       o.ag_date = c."nextAGDate"::date   as sur_la_bonne_date,
       o.marque_par,
       o.marque_at
from public.intranet_odj_champs o
left join public."Copropriete" c on c."referenceCrypto" = o.copropriete_id
where o.champ_id = '__cloture'
order by o.copropriete_id, o.ag_date;
