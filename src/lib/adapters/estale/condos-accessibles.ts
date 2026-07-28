// Resolution CODE copro -> condoID eStale, sur TOUTES les sources de condos accessibles
// au compte de service (bug remonte par Sekou le 2026-07-28 : "aucune donnee ne remonte
// sur les copros eStale").
//
// POURQUOI : `me.collaborator.condos` ne liste QUE les copros dont le compte de service
// est le GESTIONNAIRE ATTITRE cote eStale (mesure du 2026-07-28 : 2 copros sur 8). La
// LISTE des copros, elle, passe par `me.agency.condos` (8 copros) -> une copro s'affichait
// dans l'app mais sa fiche ne resolvait aucun condoID -> tous les blocs eStale (conseil
// syndical, historique AG, conformite, compta, contrats) tombaient en "non disponible".
//
// On elargit donc a l'UNION des sources exposees par le schema (meme correctif que le
// module reprise, cf. lib/reprise/adapters/estale-compta/reel-provider.ts) :
//   - me.collaborator.condos  (portefeuille du collaborateur)
//   - me.agency.condos        (toute l'agence)
//   - me.accesses             (Agency | Establishment | Collaborator) -> leurs condos
// Dedup par id. LECTURE SEULE : elargir la resolution technique ne change RIEN au
// cloisonnement metier (qui voit quelle copro), applique en code cote intranet.

import { estaleGql } from "./client";

export type CondoRef = { id: string; reference: string };

const TTL_MS = 10 * 60 * 1000;
let cache: { liste: CondoRef[]; expire: number } | null = null;

const Q_CONDOS_ACCESSIBLES = `{
  me {
    collaborator { condos(archived: false) { id reference } }
    agency { condos(archived: false) { id reference } }
    accesses {
      __typename
      ... on Agency { condos(archived: false) { id reference } }
      ... on Establishment { condos(archived: false) { id reference } }
      ... on Collaborator { condos(archived: false) { id reference } }
    }
  }
}`;

type Data = {
  me: {
    collaborator: { condos: CondoRef[] } | null;
    agency: { condos: CondoRef[] } | null;
    accesses: ({ condos?: CondoRef[] } | null)[] | null;
  };
};

/** "S0299" / "s299 " -> "S299" : prefixe lettre + numero sans zeros de tete. */
export function normaliserRef(ref: string): string {
  const m = ref.trim().toUpperCase().match(/^([A-Z]+)0*(\d+)$/);
  return m ? `${m[1]}${m[2]}` : ref.trim().toUpperCase();
}

/** Tous les condos accessibles, dedupliques par id. Cache module (TTL 10 min). */
export async function chargerCondosAccessibles(): Promise<CondoRef[]> {
  if (cache && Date.now() < cache.expire) return cache.liste;
  const data = await estaleGql<Data>(Q_CONDOS_ACCESSIBLES);
  const parId = new Map<string, CondoRef>();
  const ajouter = (condos?: CondoRef[] | null) => {
    for (const c of condos ?? []) if (c?.id) parId.set(c.id, c);
  };
  ajouter(data.me.collaborator?.condos);
  ajouter(data.me.agency?.condos);
  for (const acces of data.me.accesses ?? []) ajouter(acces?.condos);
  const liste = [...parId.values()];
  cache = { liste, expire: Date.now() + TTL_MS };
  return liste;
}

/** condoID eStale d'un code copro (reference normalisee). null = copro inconnue d'eStale. */
export async function resoudreCondoId(code: string): Promise<string | null> {
  const liste = await chargerCondosAccessibles();
  const cible = normaliserRef(code);
  return liste.find((c) => normaliserRef(c.reference) === cible)?.id ?? null;
}

/** Vide le cache module (tests / diagnostic). */
export function viderCacheCondos(): void {
  cache = null;
}
