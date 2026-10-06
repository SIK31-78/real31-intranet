// Service : LE pont remontees <-> Linear, dans les deux sens, en un seul passage.
// Appele par /api/cron/linear (une fois par jour) et par scripts/feedback-triage.mjs.
// Passe par le routeur (ADR-001).
//
// POURQUOI UN CRON ET PAS UN PUSH DANS LA SERVER ACTION (arbitrage Sekou 2026-10-06) :
// le bouton "Un bug / une idee" ne doit JAMAIS dependre de Linear. Une panne, un
// throttling ou une cle expiree ne peut pas faire attendre un collegue ni perdre sa
// remontee - elle est enregistree en base, le cron la poussera. Et comme le triage se
// fait en une fournee hebdo, un jour de latence ne coute rien.
//
// IDEMPOTENT : l'aller ne regarde que les remontees sans ticket, le retour ne fait
// qu'ecrire l'etat courant. Rejouer le cron deux fois de suite ne change rien.

import { getFeedbackRepository, getTicketTracker } from "@/lib/adapters/router";
import type { Feedback } from "@/lib/domain/feedback";
import {
  doitPartirDansLinear,
  raisonEcartDepuisLinear,
  statutDepuisEtatLinear,
} from "@/lib/domain/feedback-linear";

/** Ce que le cron rend : de quoi lire le resultat sans ouvrir les logs. */
export interface BilanSynchro {
  actif: boolean;
  /** Tickets crees dans Linear (l'aller). */
  pousses: { id: string; identifiant: string; titre: string }[];
  /** Statuts realignes depuis Linear (le retour). */
  realignes: { identifiant: string; de: string; vers: string }[];
  /** Tickets renommes dans Linear apres reformulation du titre au triage. */
  renommes: { identifiant: string; titre: string }[];
  /** Remontees ignorees a l'aller, avec la raison (entree maison, deja terminee). */
  ignorees: number;
  /** Tickets connus en base mais introuvables dans Linear (supprimes a la main). */
  orphelins: string[];
  /** Echecs unitaires : le cron CONTINUE, il ne s'arrete pas au premier raté. */
  erreurs: { quoi: string; message: string }[];
}

/**
 * Pousse les remontees sans ticket, puis realigne les statuts depuis Linear.
 *
 * Chaque remontee est traitee INDEPENDAMMENT : une erreur sur l'une (label supprime,
 * ticket efface, 429) n'empeche pas les autres. Le bilan nomme les echecs, et le
 * passage du lendemain les reprendra puisque rien n'aura ete ecrit en base pour elles.
 */
export async function synchroniserLinear(): Promise<BilanSynchro> {
  const tracker = getTicketTracker();
  const repo = getFeedbackRepository();
  const bilan: BilanSynchro = {
    actif: tracker.estActif(),
    pousses: [],
    realignes: [],
    renommes: [],
    ignorees: 0,
    orphelins: [],
    erreurs: [],
  };
  if (!bilan.actif) return bilan;

  // --- L'ALLER : remontees sans ticket -> issues Linear -----------------------
  const sansTicket = await repo.listerSansTicket();
  for (const f of sansTicket) {
    if (!doitPartirDansLinear(f)) {
      bilan.ignorees++;
      continue;
    }
    try {
      const ticket = await tracker.creerTicket(f);
      // ECRITURE EN BASE JUSTE APRES la creation : si ca casse ici, le ticket existe
      // dans Linear sans etre rattache, et le passage suivant en creerait un second.
      // C'est le seul doublon possible du pont ; l'index unique sur linear_issue_id
      // ne le couvre pas (deux ids differents). Assume : rare, et visible dans le
      // bilan ci-dessous, plutot qu'un verrou distribue pour un cron quotidien.
      await repo.attacherTicket(f.id, { issueId: ticket.issueId, identifiant: ticket.identifiant });
      bilan.pousses.push({ id: f.id, identifiant: ticket.identifiant, titre: f.titre });
    } catch (e) {
      bilan.erreurs.push({ quoi: `pousser « ${f.titre} »`, message: message(e) });
    }
  }

  // --- LE RETOUR : etats Linear -> statuts des remontees ----------------------
  const avecTicket = await repo.listerAvecTicket();
  const parIssue = new Map<string, Feedback>();
  for (const f of avecTicket) if (f.linearIssueId) parIssue.set(f.linearIssueId, f);
  if (parIssue.size === 0) return bilan;

  let etats;
  try {
    etats = await tracker.lireEtats([...parIssue.keys()]);
  } catch (e) {
    bilan.erreurs.push({ quoi: "relire les états Linear", message: message(e) });
    return bilan;
  }

  const vus = new Set<string>();
  for (const etat of etats) {
    vus.add(etat.issueId);
    const f = parIssue.get(etat.issueId);
    if (!f) continue;
    // Le TITRE est porte par la base : l'agent de triage le reformule en langage
    // non technique pour /nouveautes, et on pousse la meme phrase dans Linear pour
    // que les deux surfaces ne montrent pas deux libelles de la meme chose.
    // Pas de boucle possible : apres le push, les deux titres sont egaux.
    if (etat.titre !== f.titre) {
      try {
        await tracker.renommerTicket(etat.issueId, f.titre);
        bilan.renommes.push({ identifiant: etat.identifiant, titre: f.titre });
      } catch (e) {
        bilan.erreurs.push({ quoi: `renommer ${etat.identifiant}`, message: message(e) });
      }
    }

    const statut = statutDepuisEtatLinear(etat.typeEtat);
    // Type d'etat inconnu (etat custom cree dans Linear) : ON NE TOUCHE A RIEN.
    // Mieux vaut un statut qui ne bouge pas qu'une remontee ecartee par surprise.
    if (!statut || statut === f.statut) continue;
    try {
      await repo.appliquerEtatLinear(f.id, {
        statut,
        ...(statut === "livre" && etat.termineAt ? { livreAt: etat.termineAt } : {}),
        ...(statut === "ecarte"
          ? { raisonEcart: raisonEcartDepuisLinear(etat.identifiant, etat.nomEtat) }
          : {}),
      });
      bilan.realignes.push({ identifiant: etat.identifiant, de: f.statut, vers: statut });
    } catch (e) {
      bilan.erreurs.push({ quoi: `réaligner ${etat.identifiant}`, message: message(e) });
    }
  }

  // Ticket rattache en base mais absent de la reponse Linear = supprime a la main.
  // On NE DELIE PAS automatiquement (ce serait recreer un ticket au passage suivant,
  // en boucle) : on le signale, a Sekou de trancher.
  for (const [issueId, f] of parIssue) {
    if (!vus.has(issueId)) bilan.orphelins.push(f.linearIdentifiant ?? issueId);
  }

  return bilan;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
