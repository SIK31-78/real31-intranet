// Service du cockpit "Mes emails".
//   - Source du triage : la LECTURE LIVE des boites visibles (decision Sekou
//     2026-08-23). Plus de cache d'affichage : il montrait un instantane perime
//     ("synchronisé le 2026-06-26" en pleine page). Cf. lire-boites.ts.
//   - etat de traitement : fusionne depuis intranet_mes_emails_etat (ce que le
//     gestionnaire a fait sur chaque mail).
//   - contextes : NON charges ici. Le volet Contexte les demande a l'ouverture
//     (contexteCoproPour) : ~10 requetes ESTALE par affichage pour un volet replie par
//     defaut coutaient 2,3 s (mesure prod du 14/10).
// Passe par le routeur, jamais un adapter en direct (ADR-001).

import type { ContexteCopro, MailEntrant, MesEmails } from "@/lib/domain/mes-emails";
import type { DonneesEstaleCopro } from "@/lib/domain/copropriete";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import type { EtatMail } from "@/lib/ports/mes-emails-etat-provider";
import { getCoproRepository, getMesEmailsEtatRepository } from "@/lib/adapters/router";
import { donneesCoproEstale } from "@/lib/services/estale/donnees-copro-estale";
import { boitesVisibles } from "@/lib/services/mes-emails/boites-visibles";
import { lireBoitesLive } from "@/lib/services/mes-emails/lire-boites";
import { statutPartage, type StatutEcrit } from "@/lib/services/mes-emails/statut-partage";

export async function getMesEmails(g: Gestionnaire, maxPerso?: number, opts: { superAdmin?: boolean } = {}): Promise<MesEmails> {
  // Boites visibles = source unique (perso + sous-dossier du binome sur la partagee de mon
  // agence ; toutes les boites triees pour un super-admin, calcule par la page).
  const boites = await boitesVisibles(g, opts);
  // Le portefeuille vient d'ESTALE en direct : on le lit PENDANT la lecture des boites.
  const mesCoprosP = getCoproRepository().list(g.id);

  const [triage, mesCopros] = await Promise.all([lireBoitesLive(g, boites, mesCoprosP, maxPerso), mesCoprosP]);

  // Les etats se lisent APRES les boites, pour les seuls mails affiches : lire « tout » le
  // gestionnaire tronquait a 1 000 lignes (PostgREST) et les plus anciens perdaient leur
  // statut en silence (27/10/2026). Les deux lectures d'etat partent ensemble.
  const partagees = new Set(boites.filter((b) => !b.personnelle).map((b) => b.id));
  const idsPartages = triage.mails.filter((m) => m.boite && partagees.has(m.boite)).map((m) => m.id);
  const repo = getMesEmailsEtatRepository();
  const [etatsListe, statutsPartages] = await Promise.all([
    repo.getEtats(g.id, triage.mails.map((m) => m.id)),
    // Boite partagee : le statut « traité » est commun a ceux qui la voient (cf. statut-partage).
    repo.getStatutsDesMails(idsPartages),
  ]);
  const etats = new Map(etatsListe.map((e) => [e.emailId, e]));
  const lignesPartagees = new Map<string, StatutEcrit[]>();
  for (const l of statutsPartages) {
    lignesPartagees.set(l.emailId, [...(lignesPartagees.get(l.emailId) ?? []), l]);
  }

  // Pas de filtre portefeuille : la boite personnelle est deja celle du connecte, et
  // une boite partagee est par nature multi-copros (c'est ce qu'on vient chercher).
  const mails = triage.mails.map((m) => {
    const avecEtat = appliquerEtat(m, etats.get(m.id));
    const commun = m.boite && partagees.has(m.boite) ? statutPartage(m.boite, lignesPartagees.get(m.id) ?? []) : null;
    return commun ? { ...avecEtat, statutTraitement: commun.statut } : avecEtat;
  });

  return {
    gestionnaire: { nomComplet: g.nomComplet, initiales: g.initiales },
    boites,
    nbMailsAnalyses: triage.nbMailsAnalyses,
    mails,
    plusDeMails: triage.plusDeMails,
    boitesIllisibles: triage.erreurs,
    // L'adresse aussi : c'est elle que l'équipe reconnaît (Sekou, 15/10/2026).
    coprosDuGestionnaire: mesCopros.map((c) => ({
      code: c.code,
      nom: c.nom,
      adresse: [c.adresse.ligne1, `${c.adresse.codePostal} ${c.adresse.ville}`.trim()].filter(Boolean).join(", "),
    })),
  };
}

/** Applique l'etat persiste sur un mail : statut, brouillon/rattachement edites, lu. */
function appliquerEtat(m: MailEntrant, e: EtatMail | undefined): MailEntrant {
  if (!e) return m;
  return {
    ...m,
    // Lu = lu dans l'intranet OU dans Outlook (m.lu, lu a la lecture des boites, REA-422).
    lu: e.lu || m.lu,
    statutTraitement: e.statut,
    ...(e.brouillon !== undefined ? { brouillonReponse: e.brouillon } : {}),
    ...(e.rattachement !== undefined ? { rattachement: e.rattachement } : {}),
    ...(e.coproCode ? { coproCode: e.coproCode, coproNom: e.coproNom ?? m.coproNom } : {}),
    ...(e.dossierId ? { dossierClasseId: e.dossierId, dossierClasseNom: e.dossierNom ?? "" } : {}),
  };
}

/** Le contexte ESTALE d'UNE copro, demande par le volet Contexte a son ouverture. Le
 *  controle de perimetre (la copro est-elle au gestionnaire ?) est fait par l'appelant :
 *  il evite de divulguer CS, debiteurs, procedures d'une copro hors scope (audit 2026-06-25). */
export async function contexteCoproPour(code: string): Promise<ContexteCopro> {
  try {
    return versContexte(code, await donneesCoproEstale(code));
  } catch (err) {
    console.warn(`[mes-emails] ESTALE indisponible pour ${code} :`, (err as Error).message);
    return { coproCode: code, disponible: false, conseilSyndical: [] };
  }
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
