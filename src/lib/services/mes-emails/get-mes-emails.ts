// Service du cockpit "Mes emails".
//   - Source du triage : la LECTURE LIVE des boites visibles (decision Sekou
//     2026-08-23). Plus de cache d'affichage : il montrait un instantane perime
//     ("synchronisé le 2026-06-26" en pleine page). Cf. lire-boites.ts.
//   - etat de traitement : fusionne depuis intranet_mes_emails_etat (ce que le
//     gestionnaire a fait sur chaque mail).
//   - contextes : enrichissement REEL eStale par copro (degradation propre si absent).
// Passe par le routeur, jamais un adapter en direct (ADR-001).

import type { ContexteCopro, MailEntrant, MesEmails } from "@/lib/domain/mes-emails";
import type { DonneesEstaleCopro } from "@/lib/domain/copropriete";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import type { EtatMail } from "@/lib/ports/mes-emails-etat-provider";
import { getCoproRepository, getMesEmailsEtatRepository, getTriRepository } from "@/lib/adapters/router";
import { donneesCoproEstale } from "@/lib/services/estale/donnees-copro-estale";
import { construireBoites, type BoiteMail } from "@/lib/domain/boites-mail";
import { cleDossierBinome } from "@/lib/domain/tri-emails";
import { lireBoitesLive } from "@/lib/services/mes-emails/lire-boites";

/**
 * Sur une boite PARTAGEE (syndicN), /mes-emails ne montre que le SOUS-DOSSIER du binome du
 * gestionnaire — les mails que le tri lui a distribues —, jamais toute la reception
 * (decision Sekou du 13/10). On resout ce dossier via le journal du tri (intranet_tri_dossier,
 * cle = binome:email). Pas de dossier (rien distribue, ou tri non ecrit) -> la boite partagee
 * n'apparait pas : on ne risque jamais d'exposer toute la boite commune.
 */
async function scoperAuBinome(g: Gestionnaire, boites: BoiteMail[]): Promise<BoiteMail[]> {
  const cle = g.email ? cleDossierBinome(g.email) : null;
  const repo = getTriRepository();
  const out: BoiteMail[] = [];
  for (const b of boites) {
    if (b.personnelle) {
      out.push(b);
      continue;
    }
    if (!cle) continue;
    try {
      const d = await repo.dossier(b.adresse, cle);
      if (d?.folderId) out.push({ ...b, folderId: d.folderId, libelle: `${b.libelle} · mes mails` });
    } catch (err) {
      console.warn(`[mes-emails] dossier binome introuvable pour ${b.adresse} :`, (err as Error).message);
    }
  }
  return out;
}

export async function getMesEmails(g: Gestionnaire): Promise<MesEmails> {
  // Les boites visibles sont de la CONFIGURATION, jamais une constante de code
  // (decision 8 : multi-boites des le depart).
  const boites = await scoperAuBinome(g, construireBoites(g.email, process.env.MAIL_BOITES_PARTAGEES));
  const mesCopros = await getCoproRepository().list(g.id);

  const [triage, etatsListe] = await Promise.all([
    lireBoitesLive(g, boites, mesCopros),
    getMesEmailsEtatRepository().getEtats(g.id),
  ]);
  const etats = new Map(etatsListe.map((e) => [e.emailId, e]));

  // Pas de filtre portefeuille : la boite personnelle est deja celle du connecte, et
  // une boite partagee est par nature multi-copros (c'est ce qu'on vient chercher).
  const mails = triage.mails.map((m) => appliquerEtat(m, etats.get(m.id)));

  return {
    gestionnaire: { nomComplet: g.nomComplet, initiales: g.initiales },
    boites,
    nbMailsAnalyses: triage.nbMailsAnalyses,
    // Lecture live : plus de date de synchro a afficher (elle ne pouvait qu'etre perimee).
    dateCourante: "",
    mails,
    dossiers: triage.dossiers,
    contextes: await enrichirContextes(mails, new Set(mesCopros.map((c) => c.code))),
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

/** Pour chaque copro rattachee ET dans le perimetre du gestionnaire, tire son contexte
 *  eStale. Le filtre perimetre evite de divulguer le contexte (CS, debiteurs, procedures)
 *  d'une copro hors scope si un mail/override pointe dehors (audit prod 2026-06-25). */
async function enrichirContextes(
  mails: MailEntrant[],
  perimetre: Set<string>,
): Promise<ContexteCopro[]> {
  const codes = [...new Set(mails.map((m) => m.coproCode).filter(Boolean))].filter((c) =>
    perimetre.has(c),
  );
  return Promise.all(
    codes.map(async (code) => {
      try {
        return versContexte(code, await donneesCoproEstale(code));
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
