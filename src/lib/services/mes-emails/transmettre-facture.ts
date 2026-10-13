// Service : transmettre une facture reçue par mail à la boîte de réception des factures
// d'ESTALE de l'agence (une par établissement, lue via l'API : Condo.invoice.inbox),
// objet codifié « COMPTE - FOURNISSEUR - Libellé » comme l'envoi manuel actuel. On crée un
// BROUILLON de transfert (pièces jointes d'origine conservées) dans la boîte qui détient le
// mail : relu puis envoyé depuis Outlook (ADR-047, rien ne part tout seul).
// Passe par le routeur (ADR-001).

import { getMailOutboundProvider } from "@/lib/adapters/router";
import { mailModuleActif, robotFactureEstale } from "@/lib/domain/mail-gate";
import { factureComplete, objetFactureEstale, type FactureEstale } from "@/lib/domain/mes-emails-composition";

/** L'agence de la boîte traitée (déploiement par agence, MAIL_TRI_AGENCE). */
function agenceCourante(): string | null {
  return (process.env.MAIL_TRI_AGENCE ?? "").trim() || null;
}

/** L'adresse factures ESTALE de l'agence, ou null si elle n'est pas configurée. */
export function adresseFacturesAgence(): string | null {
  return robotFactureEstale(agenceCourante());
}

export async function transmettreFacture(p: {
  boite: string;
  internetMessageId: string;
  facture: Partial<FactureEstale>;
}): Promise<{ objet: string; destinataire: string; webLink?: string; simulation: boolean }> {
  if (!factureComplete(p.facture)) throw new Error("Compte, fournisseur et libellé sont requis.");
  const destinataire = adresseFacturesAgence();
  if (!destinataire) throw new Error("L'adresse de réception des factures ESTALE de l'agence n'est pas configurée (MAIL_ROBOT_FACTURE_ESTALE).");
  const objet = objetFactureEstale(p.facture);
  if (!mailModuleActif()) return { objet, destinataire, simulation: true };
  const r = await getMailOutboundProvider().creerTransfert({
    boite: p.boite,
    internetMessageId: p.internetMessageId,
    a: [destinataire],
    sujet: objet,
    commentaire: "",
  });
  return { objet, destinataire, simulation: false, ...(r.webLink ? { webLink: r.webLink } : {}) };
}
