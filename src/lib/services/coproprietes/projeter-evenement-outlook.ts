// Service : projection AUTOMATIQUE des dates CS/AG dans l'agenda Outlook du
// gestionnaire (decision Sekou 2026-07-08). La date structuree posee dans
// l'intranet reste LA SOURCE ; Outlook n'en recoit qu'un reflet :
//   - poser une date       -> creer "S024 : AG à confirmer" (journee entiere) ;
//   - confirmer            -> renommer en "S024 : AG confirmée" ;
//   - replanifier          -> deplacer l'evenement (titre repasse "à confirmer") ;
//   - effacer la date      -> supprimer l'evenement.
// TOUT est degrade propre : provider no-op (MAIL_SOURCE != graph), Graph en echec
// (403 Access Policy, timeout...) -> warn SANS PII (code copro + type seulement)
// et on continue. Le statut intranet n'est JAMAIS bloque par Outlook.
// Passe par le routeur (ADR-001).

import {
  titreProjectionOutlook,
  type StatutConfirmation,
} from "@/lib/domain/confirmation-evenement";
import { finReunion } from "@/lib/domain/reunion";
import { ressourceParEmail } from "@/lib/domain/salles-reunion";
import type { ConfirmationEvenement } from "@/lib/domain/confirmation-evenement";
import {
  getCalendrierOutboundProvider,
  getConfirmationEvenementRepository,
} from "@/lib/adapters/router";

// Un `debut` datetime ('YYYY-MM-DDTHH:mm:00') porte une heure de reunion -> on fixe
// une fin explicite (debut + duree reunion). Un jour seul ('YYYY-MM-DD') n'en a pas
// (journee entiere) : on ne passe pas de fin.
function finDe(debut: string): string | undefined {
  return debut.includes("T") ? finReunion(debut) : undefined;
}

/**
 * Lieu de l'evenement Outlook deduit du mode de tenue (bonus, degrade OK) : "Visio"
 * en visio, sinon le libelle de la salle reservee (presentiel / hybride). undefined si
 * rien a afficher (aucun mode ni salle) -> le lieu Outlook est alors laisse inchange.
 * Pas de lien Teams genere ici (limitation assumee).
 */
function lieuDe(conf: ConfirmationEvenement | undefined): string | undefined {
  if (conf?.modeReunion === "visio") return "Visio";
  return ressourceParEmail(conf?.salleEmail)?.nom;
}

/**
 * Projette (cree ou met a jour) l'evenement Outlook refletant le `debut` de
 * l'evenement (copro, type) avec le statut donne. `debut` est un jour seul
 * ('YYYY-MM-DD' -> journee entiere) OU un datetime ('YYYY-MM-DDTHH:mm:00' ->
 * evenement de duree reunion, fin = debut + 2h). Si une projection existe deja
 * (eventId + boite en base) -> PATCH (titre + debut, l'evenement est deplace /
 * renomme). Sinon -> POST dans l'agenda `boite` (email du gestionnaire connecte,
 * fourni par l'action) puis enregistrement de (eventId, boite). Sans `boite` et
 * sans projection existante, il n'y a pas d'agenda cible : on ne fait rien.
 */
export async function projeterEvenementOutlook(
  coproCode: string,
  type: "AG" | "CS",
  debut: string,
  statut: StatutConfirmation,
  boite?: string,
): Promise<void> {
  try {
    const repo = getConfirmationEvenementRepository();
    const provider = getCalendrierOutboundProvider();
    const titre = titreProjectionOutlook(coproCode, type, statut);
    const fin = finDe(debut);

    const existante = (await repo.get(coproCode)).find((c) => c.type === type);
    // Salle + vehicule reserves (persistes AVANT la projection par definirDateEvenement) :
    // ajoutes comme ressources de l'evenement. La MAJ (confirm / replanif) les REMET donc
    // ils sont conserves. Liste vide -> aucune ressource attachee (ou retiree).
    const ressources = [existante?.salleEmail, existante?.vehiculeEmail].filter(
      (e): e is string => Boolean(e),
    );
    // Collegues associes (persistes de meme AVANT la projection) : invites comme
    // participants "required" -> l'evenement apparait dans leur agenda. Liste vide ->
    // aucun participant (ou retire au PATCH, comme les ressources).
    const participants = existante?.collaborateursEmails ?? [];
    // Lieu deduit du mode (bonus) : "Visio" en visio, sinon la salle. undefined -> aucun
    // lieu a afficher (ni mode ni salle).
    const lieu = lieuDe(existante);

    if (existante?.outlookEventId && existante.outlookBoite) {
      // Projection deja en place : on DEPLACE / RENOMME le MEME evenement (jamais de doublon).
      // `lieu` est TOUJOURS transmis (chaine vide si ni mode ni salle) pour que la salle /
      // "Visio" apparaisse dans le rendez-vous du gestionnaire ET soit retiree quand on
      // retire la salle (sinon un ancien lieu resterait affiche a tort).
      await provider.mettreAJourEvenement(existante.outlookBoite, existante.outlookEventId, {
        titre,
        debut,
        ...(fin ? { fin } : {}),
        ressources,
        participants,
        lieu: lieu ?? "",
      });
      // Re-memorise (id + boite) a l'identique : idempotent, mais self-heal si la colonne
      // avait ete videe entre-temps (l'id relu reste la reference du meme evenement).
      await repo.enregistrerProjection(coproCode, type, existante.outlookEventId, existante.outlookBoite);
      return;
    }

    // Etat incoherent : un id d'evenement est connu mais SANS boite exploitable (on ne
    // peut pas le PATCHer). Avant de recreer, on supprime l'ancien (best-effort) pour ne
    // jamais laisser deux evenements en parallele.
    if (existante?.outlookEventId) {
      const boiteAncienne = existante.outlookBoite ?? boite;
      if (boiteAncienne) {
        await provider.supprimerEvenement(boiteAncienne, existante.outlookEventId).catch(() => {});
      }
    }

    if (!boite) return; // pas d'agenda cible (ex. dev-login sans email) -> pas de projection

    // `debut` jour seul -> journee entiere ; datetime -> evenement de duree reunion.
    const { id } = await provider.creerEvenement({
      boite,
      sujet: titre,
      debut,
      ...(fin ? { fin } : {}),
      ...(ressources.length > 0 ? { ressources } : {}),
      ...(participants.length > 0 ? { participants } : {}),
      ...(lieu ? { lieu } : {}),
    });
    // Pas d'id (provider no-op) : rien a memoriser, la projection reste inexistante.
    if (!id) return;
    // On memorise l'id. Si AUCUNE ligne n'a ete mise a jour (row de confirmation absente
    // ou persistance en echec), l'evenement qu'on vient de creer serait un ORPHELIN :
    // introuvable au prochain geste, il produirait un DOUBLON (et la salle resterait
    // bloquee sur lui). On le supprime immediatement -> au pire pas d'evenement, jamais deux.
    const memorise = await repo.enregistrerProjection(coproCode, type, id, boite);
    if (!memorise) {
      await provider.supprimerEvenement(boite, id).catch(() => {});
    }
  } catch {
    // Degradation propre : la donnee intranet est deja ecrite, Outlook rattrapera au
    // prochain geste (re-pose / confirmation). Pas de PII en log.
    console.warn(`[projection-outlook] projection impossible pour ${coproCode} ${type} (statut intranet conserve)`);
  }
}

/**
 * Supprime la projection Outlook de l'evenement (copro, type) si elle existe :
 * DELETE de l'evenement (404 tolere par l'adapter) puis effacement de
 * (eventId, boite) en base. Appele quand la date est effacee (RAZ).
 */
export async function deprojeterEvenementOutlook(
  coproCode: string,
  type: "AG" | "CS",
): Promise<void> {
  try {
    const repo = getConfirmationEvenementRepository();
    const existante = (await repo.get(coproCode)).find((c) => c.type === type);
    if (!existante?.outlookEventId || !existante.outlookBoite) return; // rien a supprimer

    await getCalendrierOutboundProvider().supprimerEvenement(
      existante.outlookBoite,
      existante.outlookEventId,
    );
    await repo.enregistrerProjection(coproCode, type, null, null);
  } catch {
    console.warn(`[projection-outlook] suppression impossible pour ${coproCode} ${type} (statut intranet conserve)`);
  }
}
