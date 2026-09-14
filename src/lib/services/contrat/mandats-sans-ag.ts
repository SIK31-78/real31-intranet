// Mandats qui se terminent SANS AG planifiee : l'alerte « pour qu'on passe pas a cote »
// (Sekou, 14/09/2026).
//
// La regle (seuil de 3 mois, niveau proche/echu) vit dans le domaine
// (domain/contrat/alerte-mandat) ; ce service ne fait que la nourrir avec la liste des
// contrats, qui sait deja ou en est chaque copro. Seules les copros ou RIEN n'est engage
// (etat « a-planifier ») sont candidates : une AG posee, un contrat genere ou un recap en
// attente sont deja suivis par la liste elle-meme.
//
// Degrade proprement : base indisponible -> liste vide, jamais une page cassee.

import { alerteMandat, type AlerteMandat } from "@/lib/domain/contrat/alerte-mandat";
import { listerContratsAPreparer } from "./lister-contrats";

export interface MandatSansAg {
  coproCode: string;
  coproNom: string;
  /** Fin du mandat en cours, ISO. */
  finMandatISO: string;
  alerte: AlerteMandat;
  /** Derniere date d'AG connue au referentiel, deja passee et jamais glissee. Aide a
   *  comprendre le trou : « la derniere AG remonte a ... ». */
  derniereAgConnueISO: string | null;
}

/** Les copros du gestionnaire a alerter, la fin de mandat la plus proche d'abord. */
export async function listerMandatsSansAg(
  managerId: string,
  aujourdhuiISO: string,
): Promise<MandatSansAg[]> {
  try {
    const lignes = await listerContratsAPreparer(managerId, aujourdhuiISO);
    return lignes
      .filter((l) => l.etat === "a-planifier")
      .flatMap((l) => {
        const alerte = alerteMandat(l.finMandatISO, aujourdhuiISO);
        if (!alerte) return [];
        return [
          {
            coproCode: l.coproCode,
            coproNom: l.nom,
            finMandatISO: l.finMandatISO,
            alerte,
            derniereAgConnueISO: l.agDatePerimee,
          },
        ];
      })
      .sort((a, b) => a.finMandatISO.localeCompare(b.finMandatISO));
  } catch (e) {
    console.warn(`[mandats-sans-ag] lecture impossible : ${(e as Error).message}`);
    return [];
  }
}
