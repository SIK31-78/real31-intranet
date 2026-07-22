// Service du pole compta. Passe par le routeur (ADR-001). Degrade proprement si la
// table intranet_compta_notes n'existe pas encore (avant le CREATE TABLE) ou si la
// base tombe : etat vide / file vide, pas d'exception qui crashe la page.

import type { AgAPreparer, AuteurNote, EtatCompta, StatutPoste } from "@/lib/domain/compta";
import type { FlagCompta } from "@/lib/ports/compta-repository";
import { getComptaRepository, getCoproRepository } from "@/lib/adapters/router";
import { exigerPerimetre } from "@/lib/services/coproprietes/exiger-perimetre";

const ETAT_VIDE: EtatCompta = { comptesVerifies: false, envoyerAvant: false, checks: {}, notes: [] };

export async function getEtatCompta(coproCode: string, agDateISO: string): Promise<EtatCompta> {
  try {
    return await getComptaRepository().getEtat(coproCode, agDateISO);
  } catch (err) {
    console.warn(`[compta] indisponible pour ${coproCode} :`, (err as Error).message);
    return ETAT_VIDE;
  }
}

/** Copro de la fiche compta. Cloisonnee au gestionnaire par defaut (null si hors scope) ;
 *  `transverse` (pole compta / super-admin) leve le cloisonnement (resolution non bornee au
 *  portefeuille), meme logique que la fiche copro. Sans option -> comportement historique,
 *  qui sert aussi de garde d'appartenance (anti-IDOR) dans les actions. */
export async function getCoproCompta(
  coproCode: string,
  gestionnaireId: string,
  options?: { transverse?: boolean },
) {
  return options?.transverse
    ? getCoproRepository().findByCode(coproCode)
    : getCoproRepository().findByCode(coproCode, gestionnaireId);
}

/** File comptable : les copros (cloisonnees au gestionnaire) avec une AG datee + leur
 *  etat compta, triees par date. */
export async function listerAgAPreparer(gestionnaireId: string): Promise<AgAPreparer[]> {
  try {
    const copros = await getCoproRepository().list(gestionnaireId);
    const avecAg = copros.filter((c) => c.prochaineAg?.date);
    const etats = await getComptaRepository().getEtats(
      avecAg.map((c) => ({ coproCode: c.code, agDateISO: c.prochaineAg!.date })),
    );
    return avecAg
      .map((c) => {
        const e = etats.get(`${c.code}|${c.prochaineAg!.date}`) ?? ETAT_VIDE;
        return {
          coproCode: c.code,
          coproNom: c.nom,
          agDate: c.prochaineAg!.date,
          comptesVerifies: e.comptesVerifies,
          envoyerAvant: e.envoyerAvant,
          notesOuvertes: e.notes.filter((n) => !n.resolu).length,
        };
      })
      .sort((a, b) => a.agDate.localeCompare(b.agDate));
  } catch (err) {
    console.warn("[compta] file a preparer indisponible :", (err as Error).message);
    return [];
  }
}

// --- Ecritures (pass-through vers le routeur, ADR-001) ---------------------

// `transverse` : le pole comptable (COMPTABLES) / super-admin ecrit sur N'IMPORTE quelle
// copro (le dialogue compta est justement prevu pour eux). Dans ce cas on saute le
// cloisonnement managerId (exigerPerimetre) ; l'autorisation par role est faite en amont
// (action). Un gestionnaire normal reste cloisonne a son portefeuille (transverse absent).
export async function ajouterNoteCompta(
  coproCode: string,
  agDateISO: string,
  auteur: AuteurNote,
  texte: string,
  par: string,
  managerId: string,
  options?: { transverse?: boolean },
): Promise<void> {
  if (!options?.transverse) await exigerPerimetre(coproCode, managerId);
  return getComptaRepository().ajouterNote(coproCode, agDateISO, auteur, texte, par);
}

export async function marquerNoteCompta(
  coproCode: string,
  agDateISO: string,
  noteId: string,
  resolu: boolean,
  par: string,
  managerId: string,
  options?: { transverse?: boolean },
): Promise<void> {
  if (!options?.transverse) await exigerPerimetre(coproCode, managerId);
  return getComptaRepository().marquerNote(coproCode, agDateISO, noteId, resolu, par);
}

export async function setFlagCompta(
  coproCode: string,
  agDateISO: string,
  flag: FlagCompta,
  valeur: boolean,
  par: string,
  managerId: string,
  options?: { transverse?: boolean },
): Promise<void> {
  if (!options?.transverse) await exigerPerimetre(coproCode, managerId);
  return getComptaRepository().setFlag(coproCode, agDateISO, flag, valeur, par);
}

export async function setCheckCompta(
  coproCode: string,
  agDateISO: string,
  slug: string,
  statut: StatutPoste,
  par: string,
  managerId: string,
  options?: { transverse?: boolean },
): Promise<void> {
  if (!options?.transverse) await exigerPerimetre(coproCode, managerId);
  return getComptaRepository().setCheck(coproCode, agDateISO, slug, statut, par);
}
