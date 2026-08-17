// Resolution de la CLE d'etat de l'ODJ (copro + date d'AG) a partir de l'id d'URL.
//
// POURQUOI CE MODULE (bug de perte silencieuse, constate le 2026-08-17). L'ecran /odj/<id>
// accepte deux formes d'id : "S273" (code seul) et "S273__2026-10-14" (code + date d'AG).
// La LECTURE (get-odj) repliait le code seul sur la prochaine AG de la copro ; l'ECRITURE
// (actions.ts) repliait le meme code seul sur la sentinelle 0001-01-01, sans jamais
// consulter la copro. Resultat : depuis une URL sans date, tout ce qui etait saisi partait
// sur une ligne que personne ne relit -- aucune erreur, aucun affichage. 17 lignes
// orphelines sur 9 copros, dont 3 clotures de reunion perdues.
//
// La regle de repli vit donc ICI, a un SEUL endroit, appele par la lecture ET par
// l'ecriture. Recopier "agParam ?? copro.prochaineAg?.date" des deux cotes est exactement
// ce qui a produit la divergence : la prochaine evolution la reproduirait.
//
// Passe par le routeur (ADR-001).

import { cache } from "react";
import { getCoproRepository } from "@/lib/adapters/router";
import { ODJ_SANS_DATE } from "@/lib/ports/odj-repository";

export interface CleOdj {
  /** Code de la copro, ex "S273". */
  code: string;
  /** Date d'AG retenue (ISO "YYYY-MM-DD") ; absente = aucune AG connue pour cette copro. */
  dateAg?: string;
  /** Cle de stockage dans intranet_odj_champs : la date d'AG, ou la sentinelle a defaut. */
  agDate: string;
}

/** Decoupe l'id d'URL. Pur : aucune lecture, aucun repli - juste la forme de l'id. */
export function decouperIdOdj(id: string): { code: string; agParam?: string } {
  const i = id.indexOf("__");
  return i < 0 ? { code: id } : { code: id.slice(0, i), agParam: id.slice(i + 2) };
}

/**
 * Regle de repli, forme pure (la date de la copro est deja lue par l'appelant).
 * Ordre : la date portee par l'URL prime, sinon la prochaine AG de la copro, et la
 * sentinelle SEULEMENT si la copro n'a reellement aucune date d'AG (cas legitime :
 * ODJ prepare avant que la date soit fixee, reporte ensuite par reporterOdjSansDate).
 */
export function cleOdj(id: string, dateProchaineAg?: string): CleOdj {
  const { code, agParam } = decouperIdOdj(id);
  const dateAg = agParam ?? dateProchaineAg;
  return { code, ...(dateAg ? { dateAg } : {}), agDate: dateAg ?? ODJ_SANS_DATE };
}

/**
 * Regle de repli, forme complete : lit la copro pour connaitre sa prochaine AG.
 * A appeler APRES la garde de cloisonnement (l'appelant a deja verifie que la copro est
 * dans le perimetre) - ici on ne cherche qu'une date, pas un droit.
 *
 * Memoise par requete (React.cache) comme coproAppartient : une action qui resout la cle
 * pour le verrou de cloture puis pour l'ecriture n'interroge la base qu'une fois.
 */
export const resoudreCleOdj = cache(
  async (id: string, gestionnaireId: string): Promise<CleOdj> => {
    const { code } = decouperIdOdj(id);
    // Portefeuille d'abord ; a defaut lecture TRANSVERSE (sans managerId) : le comptable
    // a un perimetre d'agence, pas de portefeuille (cf. copro-appartient). Sans ce repli,
    // il retomberait sur la sentinelle - c'est-a-dire sur le bug qu'on repare.
    const copro =
      (await getCoproRepository().findByCode(code, gestionnaireId)) ??
      (await getCoproRepository().findByCode(code));
    return cleOdj(id, copro?.prochaineAg?.date);
  },
);
