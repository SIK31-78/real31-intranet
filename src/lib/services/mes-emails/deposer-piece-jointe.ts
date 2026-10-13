// Service : déposer une pièce jointe reçue par mail (bon d'intervention, facture…) dans le
// dossier SharePoint de la copropriété (demande de Sekou, 13/10/2026). Réutilise la brique de
// dépôt du contrat (REA-116) : coupée tant que SHAREPOINT_DEPOT_ACTIF n'est pas posé (droit
// Sites.Selected à accorder sur le site « copro »). Ne lève pas : un échec revient en raison.
// Passe par le routeur (ADR-001).

import { getCoproRepository, getDepotDocumentProvider } from "@/lib/adapters/router";
import { dossierCoproDepuisLienAg, nomFichierDepose, sousDossiersPieceRecue } from "@/lib/domain/mes-emails-depot";
import type { ResultatDepot } from "@/lib/ports/depot-document-provider";
import { lirePieceJointeMail } from "./pieces-jointes";

/** Le dépôt est-il branché ? (Sert à n'afficher le bouton que s'il peut marcher.) */
export function depotPieceJointeActif(): boolean {
  return getDepotDocumentProvider().actif;
}

export async function deposerPieceJointe(p: {
  boite: string;
  internetMessageId: string;
  attachmentId: string;
  coproCode: string;
  recuLe: string;
}): Promise<(ResultatDepot & { dossier: string }) | null> {
  const depot = getDepotDocumentProvider();
  if (!depot.actif) return null;
  const sousDossiers = sousDossiersPieceRecue(p.recuLe);
  const dossier = sousDossiers.join(" / ");
  const copro = await getCoproRepository().findByCode(p.coproCode);
  if (!copro?.sharepointUrl) {
    return { depose: false, raison: "la copropriété n'a pas de dossier SharePoint renseigné.", dossier };
  }
  try {
    const pj = await lirePieceJointeMail(p.boite, p.internetMessageId, p.attachmentId);
    const r = await depot.deposer({
      dossierUrl: dossierCoproDepuisLienAg(copro.sharepointUrl),
      sousDossiers,
      nomFichier: nomFichierDepose(pj.nom, p.recuLe),
      contenu: Buffer.from(pj.base64, "base64"),
    });
    return { ...r, dossier };
  } catch (e) {
    return { depose: false, raison: `la pièce jointe n'a pas pu être lue (${e instanceof Error ? e.message : String(e)}).`, dossier };
  }
}
