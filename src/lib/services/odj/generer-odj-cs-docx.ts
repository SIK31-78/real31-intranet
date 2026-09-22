// Service : l'ODJ du CS en Word, pre-rempli, a ouvrir dans le Word du gestionnaire.
//
// Decision Sekou 2026-09-22 : le CS se remplit EN REUNION dans Word (l'editeur web etait
// juge trop complique par les collegues). L'intranet garde ce qu'il apporte vraiment, le
// pre-remplissage ESTALE / referentiel, et rend le document du cabinet tel quel.
// Passe par le routeur (ADR-001). Meme perimetre de lecture que l'ecran /odj/<id>.

import { getCoproRepository, getOdjCsDocxRenderer } from "@/lib/adapters/router";
import { donneesDocxOdjCs } from "@/lib/domain/odj-docx";
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

  // Les heures ne sont pas des champs de l'ODJ : elles viennent de la fiche copro.
  const copro = await getCoproRepository().findByCode(odj.copro.code);
  const donnees = donneesDocxOdjCs(odj, {
    ...(copro?.prochaineCsHeure ? { heureCs: copro.prochaineCsHeure } : {}),
    ...(copro?.prochaineAg?.heure ? { heureAg: copro.prochaineAg.heure } : {}),
  });

  const contenu = await getOdjCsDocxRenderer().rendre(donnees);
  const date = donnees.dateCs ? donnees.dateCs.split("/").reverse().join("-") : "sans-date";
  return { contenu, nomFichier: `ODJ-CS-${odj.copro.code}-${slug(odj.copro.nom)}-${date}.docx` };
}
