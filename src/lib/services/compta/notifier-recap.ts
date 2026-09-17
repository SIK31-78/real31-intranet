// Service : le MAIL au comptable quand un recap d'AG est enregistre (et copie au
// gestionnaire qui l'a saisi). Sekou est revenu le 16/09/2026 sur sa decision du 17/08
// (« la file EST le canal ») : Isabelle a attendu tout l'ete des recaps qui dormaient dans
// sa file. Les deux canaux vivent ensemble : le mail porte TOUT le recap, comme le mail
// MYTHEC d'avant (« S191 - Récap AG 12/03/2026 »), et renvoie vers la file.
//
// Best-effort par construction : un mail qui ne part pas ne defait jamais le recap, il est
// signale (Sentry) et notif_comptable_at reste null - la file, elle, l'a deja.

import { getCoproRepository, getMailOutboundProvider, getRecapAgRepository } from "@/lib/adapters/router";
import { comptablesPourAgence } from "@/lib/domain/perimetre-comptable";
import type { Creneau } from "@/lib/domain/facturation/commun";
import type { TravauxVotes } from "@/lib/ports/recap-ag-repository";
import { agenceDeCopro } from "@/lib/services/agences/resoudre-agence";
import { signalerException } from "@/lib/observabilite";
import { formatEuros, formatHeure, formatJour } from "@/lib/services/facturation/format";
import { htmlNotificationRecap } from "./notifier-recap-html";

export interface RecapANotifier {
  recapId: string;
  coproCode: string;
  assemblee: Creneau;
  /** Boite d'envoi = email de session du gestionnaire (jamais un parametre client). */
  boite?: string;
  /** Initiales ou nom de qui a saisi. */
  par?: string;
  depassementTtc: number;
  comptesApprouves?: boolean;
  reserves?: string;
  budgetModifie?: boolean;
  montantBudget?: number;
  pourcentageBudget?: number;
  pptVote?: boolean;
  pourcentagePpt?: number;
  montantPpt?: number;
  fondsTravaux?: boolean;
  travaux: TravauxVotes[];
  infoComptable?: string;
  debutContrat?: string;
  honorairesGestionTtc?: number;
  fraisPostauxReels?: boolean;
  forfaitPostauxTtc?: number;
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

const ouiNon = (v: boolean | undefined) => (v === undefined ? "" : v ? "Oui" : "Non");
const euros = (v: number | undefined) => (v === undefined ? "" : formatEuros(v));
const pourcent = (v: number | undefined) => (v === undefined ? "" : `${v.toLocaleString("fr-FR")} %`);
const ligne = (libelle: string, valeur: string) => `${libelle} : ${valeur}`;

export function sujetNotificationRecap(r: Pick<RecapANotifier, "coproCode" | "assemblee">): string {
  return `${r.coproCode} - Récap AG ${formatJour(r.assemblee.jourDebut)}`;
}

/** Le corps du mail : le meme contenu que le mail MYTHEC, champ par champ, puis le lien. */
export function corpsNotificationRecap(r: RecapANotifier, coproNom: string, lien: string): string {
  const a = r.assemblee;
  const blocs: string[] = [
    `Récap AG${r.par ? ` saisi par ${r.par}` : ""}`,
    "",
    ligne("Code entité copropriété", `${r.coproCode} - ${coproNom}`),
    ligne("Date/Heure début AG", `${formatJour(a.jourDebut)} ${formatHeure(a.heureDebut, a.minuteDebut)}`),
    ligne("Date/Heure fin AG", `${formatJour(a.jourFin)} ${formatHeure(a.heureFin, a.minuteFin)}`),
    ligne("Dépassement AG TTC", euros(r.depassementTtc)),
    ligne("Comptes approuvés", ouiNon(r.comptesApprouves)),
    ligne("Réserves", r.reserves ?? ""),
    ligne("Le budget présenté a-t-il été modifié en AG ?", ouiNon(r.budgetModifie)),
    ligne("Montant du budget N+2", euros(r.montantBudget)),
    ligne("PPT voté à cette AG ?", ouiNon(r.pptVote)),
    ligne("Fonds travaux", ouiNon(r.fondsTravaux)),
    ligne("Pourcentage PPT", pourcent(r.pourcentagePpt)),
    ligne("Montant PPT", euros(r.montantPpt)),
    ligne("Pourcentage budget", pourcent(r.pourcentageBudget)),
    ligne("Y a-t-il eu des travaux votés ?", r.travaux.length > 0 ? "Oui" : "Non"),
  ];
  for (const t of r.travaux) {
    blocs.push(
      "",
      `Travaux : ${t.libelle}`,
      ligne("  Budget", euros(t.budget)),
      ligne("  Résolution et clé de répartition", [t.numeroResolution, t.cleRepartition].filter(Boolean).join(" // ")),
      ligne("  Modalités d'appel de fonds", t.modalitesAppelFonds ?? ""),
    );
  }
  blocs.push("", ligne("Autres informations utiles pour le comptable", r.infoComptable ?? ""));
  if (r.debutContrat || r.honorairesGestionTtc !== undefined) {
    blocs.push(
      "",
      "Informations nouveau contrat",
      ligne("Honoraires de gestion courante (TTC)", euros(r.honorairesGestionTtc)),
      ligne("Frais postaux", r.fraisPostauxReels ? "au réel" : euros(r.forfaitPostauxTtc)),
      ligne("Date de début de contrat", r.debutContrat ? formatJour(r.debutContrat) : ""),
    );
  }
  blocs.push(
    "",
    `Le récap est aussi dans votre file « Récaps d'AG reçus » : ${lien}`,
    "",
    "Message envoyé automatiquement par l'intranet REAL31 à l'enregistrement du récap.",
  );
  return blocs.join("\n");
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
      sujet: sujetNotificationRecap(r),
      corps: corpsNotificationRecap(r, coproNom, lien),
      corpsHtml: htmlNotificationRecap(r, coproNom, lien),
    });
    await getRecapAgRepository().marquerNotifie(r.recapId).catch((e) => console.warn("[recap-ag] notif_comptable_at non posé :", (e as Error).message));
    return { envoye: true, a };
  } catch (e) {
    console.warn("[recap-ag] mail au comptable non envoyé :", (e as Error).message);
    signalerException(e, { source: "recap-ag", copro: r.coproCode, detail: { recapId: r.recapId } });
    return { envoye: false, a: [] };
  }
}
