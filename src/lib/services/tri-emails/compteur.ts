// Nombre de mails a trier, pour la pastille rouge de la barre laterale (demande du 08/10).
// La barre laterale s'affiche sur TOUTES les pages : le comptage ne doit jamais les
// ralentir. Un seul appel Graph leger, garde une minute, abandonne au-dela de 1,5 s
// (pas de pastille plutot qu'une page lente). Une pastille par boite triee (V2 du
// 27/10/2026) : chacun voit celle de SA boite, le cache est donc tenu par boite.

import { debutTri } from "@/lib/domain/mail-gate";
import { getIngestionTri } from "@/lib/adapters/router";

const TTL_MS = 60_000;
const DELAI_MAX_MS = 1_500;

const cache = new Map<string, { valeur: number; expire: number }>();

export async function compterMailsATrier(boite: string): Promise<number | null> {
  const deja = cache.get(boite);
  if (deja && Date.now() < deja.expire) return deja.valeur;
  const ingestion = getIngestionTri(boite);
  const depuis = debutTri(boite);
  const comptage = ingestion.compterReception
    ? ingestion.compterReception(boite, depuis ?? undefined)
    : ingestion.lireRecents({ email: boite, max: 100, ...(depuis ? { depuis } : {}) }).then((m) => m.length);
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
