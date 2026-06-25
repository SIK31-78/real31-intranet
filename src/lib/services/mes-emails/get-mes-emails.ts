// Service du cockpit "Mes emails".
//   - Source du triage : le CACHE (table intranet_mes_emails_triage), alimente par
//     la synchro de la boite du gestionnaire. Repli sur le triage fichier/mock
//     (archive) tant qu'aucune synchro n'a eu lieu.
//   - etat de traitement : fusionne depuis intranet_mes_emails_etat (ce que le
//     gestionnaire a fait sur chaque mail).
//   - contextes : enrichissement REEL eStale par copro (degradation propre si absent).
// Passe par le routeur, jamais un adapter en direct (ADR-001).

import type { ContexteCopro, MailEntrant, MesEmails } from "@/lib/domain/mes-emails";
import type { DonneesEstaleCopro } from "@/lib/domain/copropriete";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import type { EtatMail } from "@/lib/ports/mes-emails-etat-provider";
import {
  getCondoEstaleProvider,
  getCoproRepository,
  getMesEmailsEtatRepository,
  getMesEmailsProvider,
  getMesEmailsTriageStore,
} from "@/lib/adapters/router";

export async function getMesEmails(g: Gestionnaire): Promise<MesEmails> {
  const triage = await getMesEmailsTriageStore().lire(g.id);
  const etats = new Map(
    (await getMesEmailsEtatRepository().getEtats(g.id)).map((e) => [e.emailId, e]),
  );
  const mesCopros = await getCoproRepository().list(g.id);

  let mails: MailEntrant[];
  let dossiers: MesEmails["dossiers"] = triage.dossiers;
  let nbMailsAnalyses: number;
  let dateCourante: string;

  if (triage.mails.length > 0) {
    // Triage live : la boite du gestionnaire connecte, deja a lui. Pas de filtre
    // portefeuille (tout lui appartient).
    mails = triage.mails;
    nbMailsAnalyses = triage.nbMailsAnalyses;
    dateCourante = triage.syncAt ? `synchronisé le ${triage.syncAt.slice(0, 10)}` : "";
  } else {
    // Repli : triage fichier/mock (archive multi-copros) -> cloisonnement par portefeuille.
    const brut = await getMesEmailsProvider().getMesEmails(g.id);
    const miennes = new Set(mesCopros.map((c) => c.code));
    mails = brut.mails.filter((m) => miennes.has(m.coproCode));
    dossiers = brut.dossiers.filter((d) => miennes.has(d.coproCode));
    nbMailsAnalyses = brut.nbMailsAnalyses;
    dateCourante = brut.dateCourante;
  }

  mails = mails.map((m) => appliquerEtat(m, etats.get(m.id)));

  return {
    gestionnaire: { nomComplet: g.nomComplet, initiales: g.initiales },
    nbMailsAnalyses,
    dateCourante,
    mails,
    dossiers,
    contextes: await enrichirContextes(mails),
    coprosDuGestionnaire: mesCopros.map((c) => ({ code: c.code, nom: c.nom })),
  };
}

/** Applique l'etat persiste sur un mail : statut, etapes cochees, brouillon/rattachement edites, lu. */
function appliquerEtat(m: MailEntrant, e: EtatMail | undefined): MailEntrant {
  if (!e) return m;
  return {
    ...m,
    lu: e.lu || m.lu,
    statutTraitement: e.statut,
    etapesFaites: e.etapesFaites,
    ...(e.brouillon !== undefined ? { brouillonReponse: e.brouillon } : {}),
    ...(e.rattachement !== undefined ? { rattachement: e.rattachement } : {}),
    ...(e.coproCode ? { coproCode: e.coproCode, coproNom: e.coproNom ?? m.coproNom } : {}),
    ...(e.dossierId ? { dossierClasseId: e.dossierId, dossierClasseNom: e.dossierNom ?? "" } : {}),
  };
}

/** Pour chaque copro rattachee, tire son contexte eStale (en parallele). */
async function enrichirContextes(mails: MailEntrant[]): Promise<ContexteCopro[]> {
  const codes = [...new Set(mails.map((m) => m.coproCode).filter(Boolean))];
  const provider = getCondoEstaleProvider();
  return Promise.all(
    codes.map(async (code) => {
      try {
        return versContexte(code, await provider.getDonneesCopro(code));
      } catch (err) {
        console.warn(`[mes-emails] eStale indisponible pour ${code} :`, (err as Error).message);
        return { coproCode: code, disponible: false, conseilSyndical: [] };
      }
    }),
  );
}

function versContexte(code: string, d: DonneesEstaleCopro | null): ContexteCopro {
  if (!d) return { coproCode: code, disponible: false, conseilSyndical: [] };
  const ag = d.historiqueAg[0];
  return {
    coproCode: code,
    disponible: true,
    conseilSyndical: d.conseilSyndical,
    derniereAg: ag ? { date: ag.date, type: ag.type, pvDispo: ag.pvDispo } : undefined,
    budgetPrevisionnel: d.budgetPrevisionnel,
    depensesCourantes: d.depensesCourantes,
    fondsTravaux: d.fondsTravaux,
    nbProcedures: d.nbProcedures,
    nbDebiteurs: d.debiteurs?.length,
    contrats: d.contrats?.map((c) => ({ libelle: c.libelle, categorie: c.categorie })),
    anneeConstruction: d.anneeConstruction,
  };
}
