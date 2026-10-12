// Service : ranger le contrat édité dans le dossier d'AG de la copropriété, comme le faisait
// MYTHEC (REA-116). « <AG>/<année>/Docs pour convocation/05 - contrat de syndic.pdf ».
// Ne bloque jamais l'édition : le contrat est de toute façon téléchargé, un dépôt raté
// revient en message.
//
// Passe par le routeur (ADR-001).

import "server-only";
import { getCoproRepository, getDepotDocumentProvider } from "@/lib/adapters/router";
import type { ChampsContrat } from "@/lib/domain/contrat/champs-contrat";
import { NOM_FICHIER_CONTRAT, sousDossiersContrat } from "@/lib/domain/contrat/depot-contrat";
import type { ResultatDepot } from "@/lib/ports/depot-document-provider";
import { pdfContrat } from "./pdf-contrat";

/** Le dépôt fait, ou sa raison d'échec ; null quand le dépôt SharePoint est coupé. */
export async function deposerContrat(coproCode: string, champs: ChampsContrat): Promise<(ResultatDepot & { dossier: string }) | null> {
  const depot = getDepotDocumentProvider();
  if (!depot.actif) return null;
  const sousDossiers = sousDossiersContrat(champs.dateAgISO);
  const dossier = ["AG", ...sousDossiers].join(" / ");
  const copro = await getCoproRepository().findByCode(coproCode);
  if (!copro?.sharepointUrl) {
    return { depose: false, raison: "la copropriété n'a pas de dossier SharePoint renseigné.", dossier };
  }
  try {
    const contenu = await pdfContrat(champs);
    const r = await depot.deposer({ dossierUrl: copro.sharepointUrl, sousDossiers, nomFichier: NOM_FICHIER_CONTRAT, contenu });
    return { ...r, dossier };
  } catch (e) {
    return { depose: false, raison: `le PDF n'a pas pu être produit (${e instanceof Error ? e.message : String(e)}).`, dossier };
  }
}
