// Service : signale cote serveur un contrat qui sortirait sans adresse d'agence.
//
// L'ecran de generation affiche l'avertissement (domain/salles-reunion,
// `avertissementSiegeAgence`) ; ce signalement-ci sert a ce que Sekou le SACHE sans
// attendre qu'un gestionnaire le remonte : une agence inconnue veut dire que
// SIEGES_AGENCES a pris du retard sur le referentiel (decision Sekou du 12/10/2026,
// REA-273 : jamais un blanc silencieux dans un contrat).

import { avertissementSiegeAgence } from "@/lib/domain/salles-reunion";
import { signaler } from "@/lib/observabilite";

/**
 * Rend l'avertissement (ou `undefined` si l'adresse est connue) et, s'il y en a un, le
 * signale a Sentry (niveau warning) et dans les logs serveur. Le code d'agence et le code
 * copro / l'id de proposition ne sont pas des donnees personnelles.
 */
export function signalerSiegeAgenceInconnu(
  agence: string | null | undefined,
  contexte: { copro?: string; proposition?: string },
): string | undefined {
  const avertissement = avertissementSiegeAgence(agence);
  if (!avertissement) return undefined;
  console.warn(`[contrat] ${avertissement}`, contexte);
  signaler(avertissement, {
    source: "contrat",
    ...(contexte.copro ? { copro: contexte.copro } : {}),
    detail: { agence: agence ?? null, ...contexte },
  });
  return avertissement;
}
