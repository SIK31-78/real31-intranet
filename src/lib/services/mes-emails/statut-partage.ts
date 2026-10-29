// Statut de traitement PARTAGÉ sur une boîte partagée (décision Sekou du 15/10/2026).
// Sur une boîte partagée, l'assistante traite pour le gestionnaire : le mail doit sortir de
// « À traiter » pour les deux, pas seulement pour elle (6 mails chez elle, 22 chez lui le même matin). Seul le
// statut (et les étapes posées avec lui) se partage ; le brouillon et le reste de l'état
// restent propres à chacun. « Classe » = « Marquer traité » (le bouton « Conclure l'événement »
// renommé, REA-422 du 27/10/2026), « repondu » = une réponse ou un transfert partis de l'écran.
// Le « lu », lui, se partage par Outlook (isRead commun à la boîte), plus par cette ligne.
//
// Stockage sans changement de schéma : une ligne de intranet_mes_emails_etat dont le
// gestionnaire_id vaut « boite:<adresse> » porte le statut commun. Elle gagne toujours.
// Sans elle (mails conclus avant ce partage), le statut d'un autre membre qui a conclu
// ou répondu est repris : l'historique de l'une vaut aussi chez l'autre.

import type { StatutTraitement } from "@/lib/domain/mes-emails";
import type { StatutEcrit } from "@/lib/ports/mes-emails-etat-provider";

export type { StatutEcrit };

/** Clé de la ligne d'état commune à une boîte partagée. */
export const cleEtatBoite = (boite: string): string => `boite:${boite.trim().toLowerCase()}`;

/**
 * Le statut commun d'un mail d'une boîte partagée, ou null s'il n'y en a pas (le statut
 * personnel s'applique alors). `lignes` = toutes les lignes connues de CE mail.
 */
export function statutPartage(
  boite: string,
  lignes: StatutEcrit[],
): { statut: StatutTraitement; etapesFaites: number[]; marqueAt?: string } | null {
  const commune = lignes.find((l) => l.gestionnaireId === cleEtatBoite(boite));
  if (commune) return { statut: commune.statut, etapesFaites: commune.etapesFaites, ...(commune.marqueAt ? { marqueAt: commune.marqueAt } : {}) };
  const traitees = lignes
    .filter((l) => l.statut !== "nouveau")
    .sort((x, y) => (y.marqueAt ?? "").localeCompare(x.marqueAt ?? ""));
  const t = traitees[0];
  return t ? { statut: t.statut, etapesFaites: t.etapesFaites, ...(t.marqueAt ? { marqueAt: t.marqueAt } : {}) } : null;
}
