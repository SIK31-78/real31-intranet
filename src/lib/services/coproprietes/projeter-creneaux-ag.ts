// Service : projection AUTOMATIQUE des deux CRENEAUX DE TRAVAIL derives d'une date
// d'AG dans l'agenda Outlook du gestionnaire (demande Sekou 2026-07-17).
//   - poser une date d'AG  -> creer "S024 - Mise sous pli" (J-31, 10h-12h) et
//                             "S024 - RELANCE DATE AG" (J-7, 10h-10h30) ;
//   - deplacer la date     -> DEPLACER les 2 MEMES evenements (les cibles se
//                             recalculent, decalage jour ouvre compris) ;
//   - effacer la date      -> supprimer les 2 (cancel + DELETE) et effacer la memoire.
// Regle AG uniquement : un CS n'a pas de creneau derive (l'appelant filtre).
//
// Ce ne sont PAS des reunions : aucune salle, aucun vehicule, et AUCUN controle de
// disponibilite (decision Sekou : un dejeuner a J-31 ne doit pas empecher de fixer
// l'AG - on pose, il deplacera).
//
// Anti-doublon, calque sur projeter-evenement-outlook : la memoire est cle par
// (copro, role) SANS la date, donc on retrouve toujours LE meme evenement ; et si la
// memorisation d'un evenement cree echoue, on le supprime dans la foulee (au pire pas
// d'evenement, jamais deux).
//
// TOUT est degrade propre : un echec (provider no-op, Graph 403 / timeout, table pas
// encore creee) -> warn SANS PII (code copro seulement) et on continue. La date d'AG
// intranet n'est JAMAIS bloquee par Outlook. Passe par le routeur (ADR-001).

import { creneauxAg } from "@/lib/domain/jalons-ag/creneaux";
import {
  getCalendrierOutboundProvider,
  getConfirmationEvenementRepository,
  getProjectionsOutlookRepository,
} from "@/lib/adapters/router";

/** Collegues deja invites a l'AG : les creneaux de travail les invitent aussi.
 *  Best-effort : sans confirmation lisible, on projette sans participant. */
async function collaborateursAg(coproCode: string): Promise<string[]> {
  const confirmations = await getConfirmationEvenementRepository().get(coproCode);
  return confirmations.find((c) => c.type === "AG")?.collaborateursEmails ?? [];
}

/**
 * Projette (cree ou DEPLACE) les deux creneaux derives de l'AG du `agDebut` de la copro.
 * `agDebut` : 'YYYY-MM-DD' ou 'YYYY-MM-DDTHH:mm:00' (seul le jour compte). `boite` =
 * email du gestionnaire connecte, agenda cible : sans elle et sans projection existante,
 * il n'y a pas d'agenda ou poser -> on ne fait rien.
 */
export async function projeterCreneauxAg(
  coproCode: string,
  agDebut: string,
  boite?: string,
): Promise<void> {
  try {
    // Le repo AVANT tout appel Graph : s'il est indisponible, on n'a pas encore cree
    // d'evenement qu'on ne saurait pas memoriser.
    const repo = getProjectionsOutlookRepository();
    const provider = getCalendrierOutboundProvider();
    const existantes = await repo.get(coproCode);
    const participants = await collaborateursAg(coproCode);

    for (const creneau of creneauxAg(coproCode, agDebut)) {
      const existante = existantes.find((p) => p.role === creneau.role);

      if (existante?.outlookEventId && existante.outlookBoite) {
        // Projection deja en place : on DEPLACE le MEME evenement (jamais de doublon).
        await provider.mettreAJourEvenement(existante.outlookBoite, existante.outlookEventId, {
          titre: creneau.sujet,
          debut: creneau.debut,
          fin: creneau.fin,
          participants,
        });
        // Re-memorise a l'identique : idempotent, mais self-heal si la ligne avait ete
        // videe entre-temps.
        await repo.enregistrerProjection(
          coproCode,
          creneau.role,
          existante.outlookEventId,
          existante.outlookBoite,
        );
        continue;
      }

      // Etat incoherent : un id est connu mais SANS boite exploitable (impossible a
      // PATCHer). Avant de recreer, on supprime l'ancien (best-effort) pour ne jamais
      // laisser deux evenements en parallele.
      if (existante?.outlookEventId) {
        const boiteAncienne = existante.outlookBoite ?? boite;
        if (boiteAncienne) {
          await provider.supprimerEvenement(boiteAncienne, existante.outlookEventId).catch(() => {});
        }
      }

      if (!boite) continue; // pas d'agenda cible (ex. dev-login sans email)

      const { id } = await provider.creerEvenement({
        boite,
        sujet: creneau.sujet,
        debut: creneau.debut,
        fin: creneau.fin,
        ...(participants.length > 0 ? { participants } : {}),
      });
      if (!id) continue; // provider no-op : rien a memoriser
      // Memorisation en echec = evenement ORPHELIN (introuvable au prochain geste, il
      // produirait un DOUBLON). On le supprime immediatement.
      const memorise = await repo.enregistrerProjection(coproCode, creneau.role, id, boite);
      if (!memorise) {
        await provider.supprimerEvenement(boite, id).catch(() => {});
      }
    }
  } catch {
    // Degradation propre : la date d'AG est deja ecrite, Outlook rattrapera au prochain
    // geste (re-pose / confirmation). Pas de PII en log.
    console.warn(
      `[creneaux-ag] projection des creneaux impossible pour ${coproCode} (date AG conservee)`,
    );
  }
}

/**
 * Supprime les creneaux derives de la copro (DELETE des evenements - l'adapter fait
 * cancel puis DELETE, 404 tolere - puis effacement de la memoire). Appele quand la date
 * d'AG est effacee / l'AG annulee.
 */
export async function deprojeterCreneauxAg(coproCode: string): Promise<void> {
  try {
    const repo = getProjectionsOutlookRepository();
    const provider = getCalendrierOutboundProvider();

    for (const projection of await repo.get(coproCode)) {
      if (!projection.outlookEventId || !projection.outlookBoite) continue; // rien a supprimer
      await provider.supprimerEvenement(projection.outlookBoite, projection.outlookEventId);
      await repo.enregistrerProjection(coproCode, projection.role, null, null);
    }
  } catch {
    console.warn(
      `[creneaux-ag] suppression des creneaux impossible pour ${coproCode} (date AG conservee)`,
    );
  }
}
