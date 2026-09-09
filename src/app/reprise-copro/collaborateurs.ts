// Personnes ASSIGNABLES sur une reprise = TOUS les collaborateurs du cabinet
// (getGestionnaireRepository().listTous()) : une tache de reprise peut revenir a une
// assistante sans portefeuille ou a un admin (ex. l'ouverture du compte bancaire),
// absents de list()/listImpersonables().
//
// Deux usages, côté serveur uniquement :
//   - listerCollaborateurs : alimente les selects (tableau d'équipe, fiche dossier) ;
//   - validerCollaborateursConnus : ANTI-INJECTION. Un id soumis par le client (select, formulaire)
//     n'est écrit dans le JSONB `etapes` / `equipe` qu'après avoir été retrouvé dans cette liste ;
//     le nom dénormalisé (Personne.nom) vient de la liste, jamais du client.

import { getGestionnaireRepository } from "@/lib/adapters/router";
import type { Personne } from "@/lib/reprise/domain/dossier";

/** Personne assignable, projetée pour l'UI (initiales pour l'avatar). */
export interface CollaborateurVue extends Personne {
  initiales: string;
}

export async function listerCollaborateurs(): Promise<CollaborateurVue[]> {
  const tous = await getGestionnaireRepository().listTous();
  return tous
    .map((g) => ({ id: g.id, nom: g.nomComplet, initiales: g.initiales }))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}

export type CollaborateursConnus = { ok: true; personnes: Map<string, Personne> } | { ok: false; message: string };

/**
 * Résout des ids soumis par le client en Personnes CONNUES du cabinet. Un seul id inconnu
 * suffit à refuser (jamais d'écriture partielle). Les ids null/undefined sont ignorés
 * (= « personne » / désassigner).
 */
export async function validerCollaborateursConnus(ids: Array<string | null | undefined>): Promise<CollaborateursConnus> {
  const demandes = [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))];
  const personnes = new Map<string, Personne>();
  if (demandes.length === 0) return { ok: true, personnes };

  const connus = new Map((await listerCollaborateurs()).map((c) => [c.id, c]));
  for (const id of demandes) {
    const c = connus.get(id);
    if (!c) return { ok: false, message: "Collaborateur inconnu : recharge la page et réessaie." };
    personnes.set(id, { id: c.id, nom: c.nom });
  }
  return { ok: true, personnes };
}
