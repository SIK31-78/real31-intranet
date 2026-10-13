// Service : le MAIL aux comptables de l'agence quand la date du conseil syndical est posee
// (ou deplacee) depuis la fiche copro (REA-272, decision Sekou du 12/10/2026 : un mail,
// PAS de jalon dans les agendas). Le comptable prepare les comptes pour le CS : il doit
// savoir quand il a lieu, et quand se tient l'AG qui suit si on la connait deja.
//
// Meme mecanique que le mail du recap d'AG (compta/notifier-recap) : destinataires =
// comptablesPourAgence(agence de la copro), boite d'envoi = email de session du
// gestionnaire, copie a lui-meme. BEST-EFFORT par construction : un mail qui ne part pas
// ne defait jamais la date, il est journalise (console + Sentry) et on continue.

import { getCoproRepository, getMailOutboundProvider } from "@/lib/adapters/router";
import { comptablesPourAgence } from "@/lib/domain/perimetre-comptable";
import { heureDe } from "@/lib/domain/reunion";
import { agenceDeCopro } from "@/lib/services/agences/resoudre-agence";
import { signalerException } from "@/lib/observabilite";
import { formatJour } from "@/lib/services/facturation/format";

export interface DateCsAAnnoncer {
  coproCode: string;
  /** Nouvelle date du CS ('YYYY-MM-DD' ou 'YYYY-MM-DDTHH:mm'). */
  dateCsISO: string;
  /** Date du CS AVANT la pose (meme format). Identique -> pas de mail (simple re-sauvegarde). */
  ancienneDateCsISO?: string | null;
  /** Boite d'envoi = email de session du gestionnaire (jamais un parametre client). */
  boite?: string;
}

export interface ResultatAnnonceCs {
  envoye: boolean;
  /** Destinataires en A (les comptables de l'agence). */
  a: string[];
}

/** « 15/11/2026 à 18:00 », ou « 15/11/2026 » sans heure. */
function jourEtHeure(iso: string, heure?: string): string {
  const h = heure ?? heureDe(iso);
  return h ? `${formatJour(iso)} à ${h}` : formatJour(iso);
}

/** Meme jour ET meme heure : la date n'a pas change, on ne renvoie pas de mail. */
export function dateCsInchangee(nouvelle: string, ancienne: string | null | undefined): boolean {
  if (!ancienne) return false;
  return nouvelle.slice(0, 10) === ancienne.slice(0, 10) && (heureDe(nouvelle) ?? "") === (heureDe(ancienne) ?? "");
}

export function sujetAnnonceCs(coproCode: string, dateCsISO: string): string {
  return `${coproCode} - Conseil syndical le ${formatJour(dateCsISO)}`;
}

/** Le corps du mail. La date d'AG n'est mentionnee que si elle est connue. */
export function corpsAnnonceCs(p: {
  coproCode: string;
  coproNom: string;
  dateCsISO: string;
  dateAgISO?: string | null;
  heureAg?: string;
}): string {
  const lignes = [
    "Bonjour,",
    "",
    `La réunion du conseil syndical de ${p.coproCode} - ${p.coproNom} est fixée au ${jourEtHeure(p.dateCsISO)}.`,
  ];
  if (p.dateAgISO) lignes.push(`L'assemblée générale est prévue le ${jourEtHeure(p.dateAgISO, p.heureAg)}.`);
  lignes.push("", "Message envoyé automatiquement par l'intranet REAL31 à la pose de la date du conseil syndical.");
  return lignes.join("\n");
}

export async function annoncerDateCsAuxComptables(d: DateCsAAnnoncer): Promise<ResultatAnnonceCs> {
  if (!d.boite || !d.dateCsISO) return { envoye: false, a: [] };
  if (dateCsInchangee(d.dateCsISO, d.ancienneDateCsISO)) return { envoye: false, a: [] };
  try {
    const [agence, copro] = await Promise.all([
      agenceDeCopro(d.coproCode),
      getCoproRepository().findByCode(d.coproCode).catch(() => null),
    ]);
    const a = comptablesPourAgence(agence);
    if (a.length === 0) {
      console.warn(`[annonce-cs] aucun comptable affecté à l'agence ${agence ?? "?"} pour ${d.coproCode} : pas de mail.`);
      return { envoye: false, a };
    }
    await getMailOutboundProvider().envoyerNeuf({
      boite: d.boite,
      a,
      cc: [d.boite],
      cci: [],
      sujet: sujetAnnonceCs(d.coproCode, d.dateCsISO),
      corps: corpsAnnonceCs({
        coproCode: d.coproCode,
        coproNom: copro?.nom ?? d.coproCode,
        dateCsISO: d.dateCsISO,
        dateAgISO: copro?.prochaineAg?.date ?? null,
        heureAg: copro?.prochaineAg?.heure,
      }),
    });
    return { envoye: true, a };
  } catch (e) {
    console.warn("[annonce-cs] mail aux comptables non envoyé :", (e as Error).message);
    signalerException(e, { source: "annonce-cs", copro: d.coproCode });
    return { envoye: false, a: [] };
  }
}
