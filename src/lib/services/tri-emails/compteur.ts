// Nombre de mails a trier, pour la pastille rouge de la barre laterale (demande du 08/10).
// La barre laterale s'affiche sur TOUTES les pages : le comptage ne doit jamais les
// ralentir. Un seul appel Graph leger, garde une minute, abandonne au-dela de 1,5 s
// (pas de pastille plutot qu'une page lente).

import { boiteTriConfiguree, debutTri } from "@/lib/domain/mail-gate";
import { getIngestionTri } from "@/lib/adapters/router";

const TTL_MS = 60_000;
const DELAI_MAX_MS = 1_500;

let cache: { boite: string; valeur: number; expire: number } | null = null;

export async function compterMailsATrier(): Promise<number | null> {
  const boite = boiteTriConfiguree();
  if (!boite) return null;
  if (cache && cache.boite === boite && Date.now() < cache.expire) return cache.valeur;
  const ingestion = getIngestionTri();
  const comptage = ingestion.compterReception
    ? ingestion.compterReception(boite, debutTri() ?? undefined)
    : ingestion.lireRecents({ email: boite, max: 100, ...(debutTri() ? { depuis: debutTri()! } : {}) }).then((m) => m.length);
  try {
    const valeur = await Promise.race([
      comptage,
      new Promise<never>((_, rejeter) => setTimeout(() => rejeter(new Error("delai depasse")), DELAI_MAX_MS)),
    ]);
    cache = { boite, valeur, expire: Date.now() + TTL_MS };
    return valeur;
  } catch {
    return null;
  }
}

/** Apres un rangement ou une annulation : la pastille doit suivre tout de suite. */
export function oublierCompteur(): void {
  cache = null;
}
