// Service : transmettre une facture reçue par mail à la boîte de réception des factures
// d'ESTALE de l'agence (une par établissement, lue via l'API : Condo.invoice.inbox),
// objet codifié « COMPTE - FOURNISSEUR - Libellé » comme l'envoi manuel actuel. On crée un
// BROUILLON de transfert (pièces jointes d'origine conservées) dans la boîte qui détient le
// mail : relu puis envoyé depuis Outlook (ADR-047, rien ne part tout seul).
//
// L'agence est celle de la COPROPRIÉTÉ du mail (27/10/2026), plus MAIL_TRI_AGENCE : syndic2
// sert LGC et ASN, une facture d'une copro d'ASN doit partir chez le robot d'ASN. Sans copro
// choisie, on refuse (on ne devine pas la compta d'une autre agence).
// Passe par le routeur (ADR-001).

import { getMailOutboundProvider } from "@/lib/adapters/router";
import { lireRobotsFacture, mailModuleActif, robotFactureEstale } from "@/lib/domain/mail-gate";
import { factureComplete, objetFactureEstale, type FactureEstale } from "@/lib/domain/mes-emails-composition";
import { agenceDeCopro } from "@/lib/services/agences/resoudre-agence";

/**
 * Au moins une adresse factures ESTALE est-elle configurée (MAIL_ROBOT_FACTURE_ESTALE) ? Sert
 * à montrer le bouton ; l'adresse réelle se choisit à la transmission, d'après la copro.
 */
export function facturesEstaleConfigurees(): boolean {
  return Object.keys(lireRobotsFacture(process.env.MAIL_ROBOT_FACTURE_ESTALE ?? "")).length > 0;
}

/** L'adresse factures ESTALE de l'agence de cette copro ; erreur lisible sinon. */
async function robotDeLaCopro(coproCode: string): Promise<string> {
  const code = coproCode.trim();
  if (!code) throw new Error("Choisis d'abord la copropriété du mail : la facture part vers la boîte ESTALE de son agence.");
  const agence = await agenceDeCopro(code.toUpperCase());
  if (!agence) throw new Error(`L'agence de la copropriété ${code} est inconnue : impossible de choisir la boîte factures ESTALE.`);
  const robot = robotFactureEstale(agence);
  if (!robot) throw new Error(`L'adresse de réception des factures ESTALE de l'agence ${agence} n'est pas configurée (MAIL_ROBOT_FACTURE_ESTALE).`);
  return robot;
}

export async function transmettreFacture(p: {
  boite: string;
  internetMessageId: string;
  /** La copro choisie pour le mail : son agence désigne la boîte factures. */
  coproCode: string;
  facture: Partial<FactureEstale>;
}): Promise<{ objet: string; destinataire: string; webLink?: string; simulation: boolean }> {
  if (!factureComplete(p.facture)) throw new Error("Compte, fournisseur et libellé sont requis.");
  const destinataire = await robotDeLaCopro(p.coproCode);
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
