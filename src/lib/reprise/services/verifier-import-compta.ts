// Service de VERIFICATION POST-IMPORT du volet compta : apres que le gestionnaire a importe
// entries.xlsx (et saisi les eclatements) DANS L'UI eStale, on relit les soldes par compte
// via le port de LECTURE (aucune mutation, sans danger en production) et on les confronte
// aux CIBLES DE CALAGE produites par produire-compta.
//
// C'est le filet ultime de la reprise : « balance du sortant vs balance eStale post-import,
// compte par compte, delta 0 obligatoire » (S0303 : 44 comptes cibles, 0 ecart). Un compte
// absent d'eStale ou en ecart est liste - jamais un verdict global muet.

import { SEUIL_EQUILIBRE } from "@/lib/reprise/domain/compta";
import type { EstaleComptaLectureProvider } from "@/lib/reprise/ports/estale-compta-lecture-provider";
import { getEstaleComptaLectureProvider } from "@/lib/reprise/adapters/router";

/** Ecart constate sur UN compte cible. */
export interface EcartCible {
  compte: string;
  /** Solde attendu (signe, debit positif) = la cible de calage. */
  attendu: number;
  /** Solde lu dans eStale (signe), null si le compte est introuvable. */
  lu: number | null;
  /** Ecart signe lu - attendu (null si introuvable). */
  ecart: number | null;
}

export type ResultatVerificationImport =
  | {
      ok: true;
      /** true si TOUS les comptes retombent au centime. */
      conforme: boolean;
      nbControles: number;
      ecarts: EcartCible[];
      comptesIntrouvables: string[];
    }
  | { ok: false; message: string };

function arrondi(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Confronte les cibles de calage aux soldes eStale de la copro. LECTURE SEULE.
 * `provider` injectable pour les tests ; par defaut le routeur choisit reel (si configure)
 * ou mock. Degrade proprement : copro introuvable / eStale indisponible => { ok:false }.
 */
export async function verifierSoldesApresImport(
  coproCode: string,
  cibles: Record<string, number>,
  provider: EstaleComptaLectureProvider = getEstaleComptaLectureProvider(),
): Promise<ResultatVerificationImport> {
  try {
    const ref = await provider.resoudreAccounting(coproCode);
    if (!ref) {
      return { ok: false, message: `Copro "${coproCode}" introuvable dans eStale ou sans exercice comptable ouvert.` };
    }
    const comptes = await provider.lireComptes(ref);
    const soldeParNomenclature = new Map(comptes.map((c) => [c.nomenclature, arrondi(c.solde)]));

    const ecarts: EcartCible[] = [];
    const comptesIntrouvables: string[] = [];
    for (const [compte, attendu] of Object.entries(cibles)) {
      const lu = soldeParNomenclature.get(compte);
      if (lu === undefined) {
        comptesIntrouvables.push(compte);
        ecarts.push({ compte, attendu: arrondi(attendu), lu: null, ecart: null });
        continue;
      }
      const ecart = arrondi(lu - attendu);
      if (Math.abs(ecart) >= SEUIL_EQUILIBRE) ecarts.push({ compte, attendu: arrondi(attendu), lu, ecart });
    }

    return {
      ok: true,
      conforme: ecarts.length === 0,
      nbControles: Object.keys(cibles).length,
      ecarts,
      comptesIntrouvables,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `Lecture eStale impossible pour "${coproCode}" : ${message}` };
  }
}
