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
    if (existante?.outlookEventId && existante.outlookBoite) {
      // Projection deja en place : on la fait suivre (jamais de doublon d'evenement).
      await provider.mettreAJourEvenement(existante.outlookBoite, existante.outlookEventId, {
        titre,
        debut,
        ...(fin ? { fin } : {}),
      });
      return;
    }

    if (!boite) return; // pas d'agenda cible (ex. dev-login sans email) -> pas de projection

    // `debut` jour seul -> journee entiere ; datetime -> evenement de duree reunion.
    const { id } = await provider.creerEvenement({
      boite,
      sujet: titre,
      debut,
      ...(fin ? { fin } : {}),
    });
    // Pas d'id (provider no-op) : rien a memoriser, la projection reste inexistante.
    if (id) await repo.enregistrerProjection(coproCode, type, id, boite);
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
