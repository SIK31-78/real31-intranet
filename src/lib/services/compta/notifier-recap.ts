// Service : le MAIL au comptable quand un recap d'AG est enregistre (et copie au
// gestionnaire qui l'a saisi). Sekou est revenu le 16/09/2026 sur sa decision du 17/08
// (« la file EST le canal ») : Isabelle a attendu tout l'ete des recaps qui dormaient dans
// sa file. Les deux canaux vivent ensemble : le mail dit qu'il y a un recap et renvoie vers
// la file, la file reste la note de travail. Envoi reel en MAIL_SOURCE=graph seulement.
//
// Best-effort par construction : un mail qui ne part pas ne defait jamais le recap, il est
// signale (Sentry) et notif_comptable_at reste null - la file, elle, l'a deja.

import { getCoproRepository, getMailOutboundProvider, getRecapAgRepository } from "@/lib/adapters/router";
import { comptablesPourAgence } from "@/lib/domain/perimetre-comptable";
import { agenceDeCopro } from "@/lib/services/agences/resoudre-agence";
import { signalerException } from "@/lib/observabilite";
import { formatEuros, formatJour } from "@/lib/services/facturation/format";

export interface RecapANotifier {
  recapId: string;
  coproCode: string;
  agDate: string;
  /** Boite d'envoi = email de session du gestionnaire (jamais un parametre client). */
  boite?: string;
  /** Initiales ou nom de qui a saisi. */
  par?: string;
  comptesApprouves?: boolean;
  budgetModifie?: boolean;
  montantBudget?: number;
  nbTravauxVotes: number;
  depassementHeures: number;
  infoComptable?: string;
}

export interface ResultatNotification {
  envoye: boolean;
  /** Destinataires en A (les comptables de l'agence). */
  a: string[];
}

/** Base des liens dans les mails : l'URL publique de l'intranet. */
function urlIntranet(): string {
  return (process.env.INTRANET_URL ?? process.env.AUTH_URL ?? "https://real31.app").replace(/\/$/, "");
}

export function corpsNotificationRecap(r: RecapANotifier, coproNom: string, lien: string): string {
  const lignes = [
    `Bonjour,`,
    ``,
    `Le récap de l'AG du ${formatJour(r.agDate)} de ${r.coproCode} – ${coproNom} vient d'être enregistré${r.par ? ` par ${r.par}` : ""}.`,
    ``,
    `• Comptes ${r.comptesApprouves === false ? "NON approuvés" : "approuvés"}`,
    // Le montant n'est saisi que si l'AG a modifie le budget presente : sinon on le dit
    // « non renseigne » plutot que « inchange », qui laissait croire a un chiffre connu.
    r.montantBudget !== undefined ? `• Budget voté : ${formatEuros(r.montantBudget)}` : `• Budget voté : non renseigné`,
    r.nbTravauxVotes > 0 ? `• ${r.nbTravauxVotes} travaux voté${r.nbTravauxVotes > 1 ? "s" : ""} (appels de fonds à prévoir)` : `• Aucuns travaux votés`,
    r.depassementHeures > 0 ? `• Dépassement d'AG : ${r.depassementHeures} h` : null,
    r.infoComptable ? `` : null,
    r.infoComptable ? `Note du gestionnaire : ${r.infoComptable}` : null,
    ``,
    `Le récap complet est dans votre file « Récaps d'AG reçus » : ${lien}`,
    ``,
    `Ce message est envoyé automatiquement par l'intranet REAL31 à l'enregistrement du récap.`,
  ];
  return lignes.filter((l): l is string => l !== null).join("\n");
}

export async function notifierRecapAg(r: RecapANotifier): Promise<ResultatNotification> {
  if (!r.boite) return { envoye: false, a: [] };
  try {
    const [agence, copro] = await Promise.all([agenceDeCopro(r.coproCode), getCoproRepository().findByCode(r.coproCode).catch(() => null)]);
    const a = comptablesPourAgence(agence);
    if (a.length === 0) {
      console.warn(`[recap-ag] aucun comptable affecté à l'agence ${agence ?? "?"} pour ${r.coproCode} : pas de mail.`);
      return { envoye: false, a };
    }
    const lien = `${urlIntranet()}/comptabilite/recaps/${encodeURIComponent(r.recapId)}`;
    const coproNom = copro?.nom ?? r.coproCode;
    await getMailOutboundProvider().envoyerNeuf({
      boite: r.boite,
      a,
      // Copie au gestionnaire : il voit que le comptable a bien recu (demande d'Isabelle
      // et Titouan, 16/09/2026).
      cc: [r.boite],
      cci: [],
      sujet: `Récap AG ${r.coproCode} – ${coproNom} – AG du ${formatJour(r.agDate)}`,
      corps: corpsNotificationRecap(r, coproNom, lien),
    });
    await getRecapAgRepository().marquerNotifie(r.recapId).catch((e) => console.warn("[recap-ag] notif_comptable_at non posé :", (e as Error).message));
    return { envoye: true, a };
  } catch (e) {
    console.warn("[recap-ag] mail au comptable non envoyé :", (e as Error).message);
    signalerException(e, { source: "recap-ag", copro: r.coproCode, detail: { recapId: r.recapId } });
    return { envoye: false, a: [] };
  }
}
