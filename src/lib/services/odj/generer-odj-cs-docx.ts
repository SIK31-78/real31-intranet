// Service : l'ODJ du CS en Word, pre-rempli, a ouvrir dans le Word du gestionnaire.
//
// Decision Sekou 2026-09-22 : le CS se remplit EN REUNION dans Word (l'editeur web etait
// juge trop complique par les collegues). L'intranet garde ce qu'il apporte vraiment, le
// pre-remplissage ESTALE / referentiel, et rend le document du cabinet tel quel.
// Passe par le routeur (ADR-001). Meme perimetre de lecture que l'ecran /odj/<id>.

import { getCoproRepository, getFacturationRepository, getOdjCsDocxRenderer } from "@/lib/adapters/router";
import { donneesCoproEstale } from "@/lib/services/estale/donnees-copro-estale";
import { donneesDocxOdjCs } from "@/lib/domain/odj-docx";
import { tauxRevalorisation } from "@/lib/domain/proposition-contrat-syndic";
import { getOdj } from "./get-odj";

export interface OdjCsDocx {
  contenu: Buffer;
  nomFichier: string;
}

/** "Les Marronniers" -> "Les-Marronniers" : un nom de fichier sans surprise sous Windows. */
function slug(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function genererOdjCsDocx(idOdj: string, gestionnaireId: string): Promise<OdjCsDocx | null> {
  const odj = await getOdj(idOdj, gestionnaireId, { transverse: true });
  if (!odj) return null;

  // Ce que l'ODJ d'ecran ne porte pas : les heures (fiche copro), les chantiers et les
  // debiteurs DETAILLES (eStale ; l'ecran n'en garde qu'un resume sur une ligne), et le
  // montant du contrat de gestion en cours. Tout est best-effort : une source muette
  // laisse un blanc dans le document, elle ne fait pas echouer le telechargement.
  // Le bareme de l'annee suivante donne la hausse a proposer au CS (toutes ses lignes
  // bougent du meme taux). Annee de reference = celle de l'AG.
  const anneeAg = odj.dateAgISO ? Number(odj.dateAgISO.slice(0, 4)) : new Date().getUTCFullYear();
  const repoFacturation = getFacturationRepository();

  const [copro, estale, contrat, baremeAg, baremeSuivant] = await Promise.all([
    getCoproRepository().findByCode(odj.copro.code),
    donneesCoproEstale(odj.copro.code).catch((e) => {
      console.warn(`[odj-docx] eStale indisponible pour ${odj.copro.code} :`, (e as Error).message);
      return null;
    }),
    repoFacturation.getDernierContrat(odj.copro.code).catch(() => null),
    repoFacturation.listerBareme(anneeAg).catch(() => []),
    repoFacturation.listerBareme(anneeAg + 1).catch(() => []),
  ]);

  const donnees = donneesDocxOdjCs(odj, {
    ...(copro?.prochaineCsHeure ? { heureCs: copro.prochaineCsHeure } : {}),
    ...(copro?.prochaineAg?.heure ? { heureAg: copro.prochaineAg.heure } : {}),
    ...(estale?.debiteurs ? { debiteurs: estale.debiteurs } : {}),
    ...(estale?.travauxVotes ? { travauxVotes: estale.travauxVotes } : {}),
    ...(contrat?.honorairesGestionTtc !== undefined
      ? { contratSyndicTtc: contrat.honorairesGestionTtc }
      : {}),
    // Le contrat ne porte pas de drapeau "au reel" : un forfait postal renseigne (> 0)
    // signifie forfait, son absence signifie reel. On ne propose le passage au reel que
    // dans le premier cas.
    ...(contrat ? { fraisPostauxReels: !contrat.forfaitPostauxTtc } : {}),
    tauxBaremeSuivant: tauxRevalorisation(baremeAg, baremeSuivant),
    dateConsultationISO: new Date().toISOString().slice(0, 10),
  });

  const contenu = await getOdjCsDocxRenderer().rendre(donnees);
  const date = donnees.dateCs ? donnees.dateCs.split("/").reverse().join("-") : "sans-date";
  return { contenu, nomFichier: `ODJ-CS-${odj.copro.code}-${slug(odj.copro.nom)}-${date}.docx` };
}
