// Service du pole compta. Passe par le routeur (ADR-001). Degrade proprement si la
// table intranet_compta_notes n'existe pas encore (avant le CREATE TABLE) ou si la
// base tombe : etat vide / file vide, pas d'exception qui crashe la page.

import type { AgAPreparer, AuteurNote, EtatCompta } from "@/lib/domain/compta";
import type { FlagCompta } from "@/lib/ports/compta-repository";
import { getComptaRepository, getCoproRepository } from "@/lib/adapters/router";

const ETAT_VIDE: EtatCompta = { comptesVerifies: false, envoyerAvant: false, notes: [] };

export async function getEtatCompta(coproCode: string, agDateISO: string): Promise<EtatCompta> {
  try {
    return await getComptaRepository().getEtat(coproCode, agDateISO);
  } catch (err) {
    console.warn(`[compta] indisponible pour ${coproCode} :`, (err as Error).message);
    return ETAT_VIDE;
  }
}

/** File comptable : les copros avec une AG datee + leur etat compta, triees par date. */
export async function listerAgAPreparer(): Promise<AgAPreparer[]> {
  try {
    const copros = await getCoproRepository().list();
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

export async function ajouterNoteCompta(
  coproCode: string,
  agDateISO: string,
  auteur: AuteurNote,
  texte: string,
  par: string,
): Promise<void> {
  return getComptaRepository().ajouterNote(coproCode, agDateISO, auteur, texte, par);
}

export async function marquerNoteCompta(noteId: string, resolu: boolean, par: string): Promise<void> {
  return getComptaRepository().marquerNote(noteId, resolu, par);
}

export async function setFlagCompta(
  coproCode: string,
  agDateISO: string,
  flag: FlagCompta,
  valeur: boolean,
  par: string,
): Promise<void> {
  return getComptaRepository().setFlag(coproCode, agDateISO, flag, valeur, par);
}
