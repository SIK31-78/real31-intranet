// Service du cron quotidien REA-140 : 10 jours avant la reunion du conseil syndical, un
// mail aux comptables de l'agence UNIQUEMENT si les comptes ne sont pas encore verifies
// (decision Sekou du 12/10/2026).
//
// Sources :
//  - date du CS / date d'AG : referentiel copro (listerToutes, transverse, ESTALE compris) ;
//  - « comptes verifies »  : flag compta.comptes_verifies du pole compta, cle par
//    (copro, prochaine AG) - le meme que la file /compta et le panneau de la fiche ;
//  - destinataires         : comptablesPourAgence(agence de la copro), comme le recap d'AG.
//
// Boite d'envoi : celle du GESTIONNAIRE de la copro (repli : l'assistant), en copie. Un
// cron n'a pas de session ; l'envoi Graph est app-only, et le comptable repond ainsi a
// quelqu'un qui connait le dossier.
//
// IDEMPOTENCE : la cle (copro, date du CS) est RESERVEE dans intranet_rappels_envoyes avant
// l'envoi (cle primaire : un second passage, ou deux crons concurrents, ne renvoient pas),
// et LIBEREE si l'envoi echoue (le passage du lendemain retente, tant qu'on est dans la
// fenetre). Trace illisible -> on n'envoie rien (jamais de double envoi).

import {
  getAgenceRepository,
  getComptaRepository,
  getCoproRepository,
  getGestionnaireRepository,
  getMailOutboundProvider,
  getRappelEnvoyeRepository,
} from "@/lib/adapters/router";
import { comptablesPourAgence } from "@/lib/domain/perimetre-comptable";
import { heureDe } from "@/lib/domain/reunion";
import {
  JOURS_AVANT_CS,
  joursEntre,
  selectionnerRappelsComptesCs,
  type RappelComptesCs,
} from "@/lib/domain/rappel-comptes-cs";
import { signalerException } from "@/lib/observabilite";
import { jourParis } from "@/lib/services/date-du-jour";
import { formatJour } from "@/lib/services/facturation/format";

export interface BilanRappelsCs {
  jour: string;
  /** Rappels candidats (CS dans la fenetre, comptes non verifies). */
  candidats: number;
  envoyes: string[];
  dejaEnvoyes: string[];
  /** Copro sans comptable affecte a son agence, ou sans boite d'envoi. */
  ignores: { copro: string; raison: string }[];
  erreurs: { copro: string; message: string }[];
}

function urlIntranet(): string {
  return (process.env.INTRANET_URL ?? process.env.AUTH_URL ?? "https://real31.app").replace(/\/$/, "");
}

export function sujetRappelComptesCs(r: Pick<RappelComptesCs, "coproCode" | "csDate">): string {
  return `${r.coproCode} - Comptes à vérifier avant le conseil syndical du ${formatJour(r.csDate)}`;
}

export function corpsRappelComptesCs(r: RappelComptesCs, heureCs: string | undefined, lien: string): string {
  const quand = r.joursAvant === 1 ? "demain" : `dans ${r.joursAvant} jours`;
  const lignes = [
    "Bonjour,",
    "",
    `Le conseil syndical de ${r.coproCode} - ${r.coproNom} se réunit ${quand}, le ${formatJour(r.csDate)}${heureCs ? ` à ${heureCs}` : ""}.`,
    "Les comptes ne sont pas encore marqués vérifiés.",
  ];
  if (r.agDate) lignes.push(`L'assemblée générale est prévue le ${formatJour(r.agDate)}.`);
  lignes.push(
    "",
    `Pour marquer les comptes vérifiés : ${lien}`,
    "",
    `Message envoyé automatiquement par l'intranet REAL31, ${JOURS_AVANT_CS} jours avant le conseil syndical.`,
  );
  return lignes.join("\n");
}

export async function rappelerComptesAvantCs(maintenant: Date = new Date()): Promise<BilanRappelsCs> {
  const jour = jourParis(maintenant);
  const bilan: BilanRappelsCs = { jour, candidats: 0, envoyes: [], dejaEnvoyes: [], ignores: [], erreurs: [] };

  const copros = await getCoproRepository().listerToutes();
  // Pre-filtre sur la fenetre AVANT de lire l'etat compta : une poignee de copros, pas 260.
  const dansFenetre = copros.filter((c) => {
    if (!c.prochaineCsDate) return false;
    const j = joursEntre(jour, c.prochaineCsDate);
    return j >= 1 && j <= JOURS_AVANT_CS;
  });
  if (dansFenetre.length === 0) return bilan;

  const avecAg = dansFenetre.filter((c) => c.prochaineAg?.date);
  const etats = await getComptaRepository().getEtats(
    avecAg.map((c) => ({ coproCode: c.code, agDateISO: c.prochaineAg!.date })),
  );
  const rappels = selectionnerRappelsComptesCs(
    dansFenetre.map((c) => ({
      coproCode: c.code,
      coproNom: c.nom,
      csDate: c.prochaineCsDate,
      agDate: c.prochaineAg?.date ?? null,
      // Sans AG datee, le flag ne peut pas exister : comptes non verifies par construction.
      comptesVerifies: c.prochaineAg?.date
        ? (etats.get(`${c.code}|${c.prochaineAg.date}`)?.comptesVerifies ?? false)
        : false,
    })),
    jour,
  );
  bilan.candidats = rappels.length;
  if (rappels.length === 0) return bilan;

  const [agences, gestionnaires] = await Promise.all([
    getAgenceRepository().listerAgences(),
    getGestionnaireRepository().list(),
  ]);
  const codeAgence = new Map(agences.map((a) => [a.id, a.code]));
  const emailDe = new Map(gestionnaires.filter((g) => g.email).map((g) => [g.id, g.email as string]));
  const parCode = new Map(dansFenetre.map((c) => [c.code, c]));
  const traces = getRappelEnvoyeRepository();
  const mail = getMailOutboundProvider();

  for (const r of rappels) {
    const copro = parCode.get(r.coproCode)!;
    const a = comptablesPourAgence(copro.agenceId ? codeAgence.get(copro.agenceId) : undefined);
    if (a.length === 0) {
      bilan.ignores.push({ copro: r.coproCode, raison: "aucun comptable affecté à l'agence" });
      continue;
    }
    const boite =
      (copro.managerId && emailDe.get(copro.managerId)) || (copro.assistantId && emailDe.get(copro.assistantId)) || "";
    if (!boite) {
      bilan.ignores.push({ copro: r.coproCode, raison: "aucune boîte d'envoi (gestionnaire sans e-mail)" });
      continue;
    }
    let reserve = false;
    try {
      reserve = await traces.reserver(r.cle);
      if (!reserve) {
        bilan.dejaEnvoyes.push(r.coproCode);
        continue;
      }
      const lien = `${urlIntranet()}/comptabilite`;
      await mail.envoyerNeuf({
        boite,
        a,
        cc: [boite],
        cci: [],
        sujet: sujetRappelComptesCs(r),
        corps: corpsRappelComptesCs(r, copro.prochaineCsHeure ?? heureDe(copro.prochaineCsDate), lien),
      });
      bilan.envoyes.push(r.coproCode);
    } catch (e) {
      const message = (e as Error).message;
      bilan.erreurs.push({ copro: r.coproCode, message });
      signalerException(e, { source: "rappel-comptes-cs", copro: r.coproCode });
      // Envoi rate : on libere la cle pour que le passage du lendemain retente.
      if (reserve) await traces.liberer(r.cle).catch(() => undefined);
    }
  }
  return bilan;
}
