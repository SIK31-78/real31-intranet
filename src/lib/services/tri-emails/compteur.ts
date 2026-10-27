// Nombre de mails a trier, pour la pastille rouge de la barre laterale (demande du 08/10).
// La barre laterale s'affiche sur TOUTES les pages : le comptage ne doit jamais les
// ralentir. Garde une minute, abandonne au-dela de 1,5 s (pas de pastille plutot qu'une page
// lente). Une pastille par boite triee (V2 du 27/10/2026) : chacun voit celle de SA boite, le
// cache est donc tenu par boite.
// Depuis REA-419 (27/10/2026), le compte vient de l'index de la reception (une requete Supabase,
// plus d'appel Graph) : c'est le meme ensemble que la file. Index absent (SQL pas passe) :
// l'ancien comptage Graph ($count de la reception depuis la mise en service).

import { debutTri } from "@/lib/domain/mail-gate";
import { getIngestionTri } from "@/lib/adapters/router";
import { MAX_REPLI, compterDansLIndex } from "./synchroniser-reception";

const TTL_MS = 60_000;
const DELAI_MAX_MS = 1_500;

const cache = new Map<string, { valeur: number; expire: number }>();

/** Repli sans index : un appel Graph leger. */
async function compterDansGraph(boite: string): Promise<number> {
  const ingestion = getIngestionTri(boite);
  const depuis = debutTri(boite);
  return ingestion.compterReception
    ? ingestion.compterReception(boite, depuis ?? undefined)
    : ingestion.lireRecents({ email: boite, max: MAX_REPLI, ...(depuis ? { depuis } : {}) }).then((m) => m.length);
}

export async function compterMailsATrier(boite: string): Promise<number | null> {
  const deja = cache.get(boite);
  if (deja && Date.now() < deja.expire) return deja.valeur;
  const comptage = compterDansLIndex(boite).then((n) => n ?? compterDansGraph(boite));
  try {
    const valeur = await Promise.race([
      comptage,
      new Promise<never>((_, rejeter) => setTimeout(() => rejeter(new Error("delai depasse")), DELAI_MAX_MS)),
    ]);
    cache.set(boite, { valeur, expire: Date.now() + TTL_MS });
    return valeur;
  } catch {
    return null;
  }
}

/** Apres un rangement ou une annulation : la pastille de cette boite doit suivre tout de suite. */
export function oublierCompteur(boite: string): void {
  cache.delete(boite);
}
