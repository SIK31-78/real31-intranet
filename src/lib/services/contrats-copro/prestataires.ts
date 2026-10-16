// Les prestataires d'une copropriété (module « Contrats & contrôles », REA-333, décision 4) :
// l'ascensoriste, la société VMC, le courtier, le fournisseur de gaz… rattachés à la copro
// depuis le référentiel d'entreprises du cabinet (celui des clés, généralisé). Ici on lit les
// entreprises par métier pour alimenter les listes déroulantes, on lie et on délie.
//
// Même ordre que suivi.ts : exigerPerimetre -> lecture -> écriture -> journal.

import { getClesEntrepriseRepository, getContratsCoproRepository } from "@/lib/adapters/router";
import { LIBELLE_METIER, METIERS_PRESTATAIRE, type MetierPrestataire } from "@/lib/domain/contrats-copro";
import type { Entreprise } from "@/lib/domain/cles/types";
import { exigerPerimetre } from "@/lib/services/coproprietes/exiger-perimetre";
import { journaliser } from "./journal";
import type { AuteurContrats } from "./types";

/** Une entreprise telle que les listes de l'onglet la proposent. */
export interface EntrepriseMetier {
  id: string;
  nom: string;
  /** Courtier partenaire : le choisir comme courtier archive le suivi d'assurance. */
  courtierPartenaire: boolean;
}

function versChoix(e: Entreprise): EntrepriseMetier {
  return { id: e.id, nom: e.nom, courtierPartenaire: e.courtierPartenaire === true };
}

function trierParNom(liste: EntrepriseMetier[]): EntrepriseMetier[] {
  return [...liste].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}

function metierConnu(metier: string): metier is MetierPrestataire {
  return (METIERS_PRESTATAIRE as readonly string[]).includes(metier);
}

/** Les entreprises du référentiel qui exercent ce métier, triées par nom. */
export async function entreprisesParMetier(metier: MetierPrestataire): Promise<EntrepriseMetier[]> {
  const liste = await getClesEntrepriseRepository().listerParMetier(metier);
  return trierParNom(liste.filter((e) => e.statut !== "bloquee").map(versChoix));
}

/** Les six métiers d'un coup, en UNE lecture du référentiel (pour la page de la fiche copro). */
export async function entreprisesParMetiers(): Promise<Record<MetierPrestataire, EntrepriseMetier[]>> {
  const toutes = await getClesEntrepriseRepository().lister();
  const out = Object.fromEntries(METIERS_PRESTATAIRE.map((m) => [m, [] as EntrepriseMetier[]])) as Record<MetierPrestataire, EntrepriseMetier[]>;
  for (const e of toutes) {
    if (e.statut === "bloquee") continue;
    for (const m of e.metiers ?? []) {
      if (metierConnu(m)) out[m].push(versChoix(e));
    }
  }
  for (const m of METIERS_PRESTATAIRE) out[m] = trierParNom(out[m]);
  return out;
}

/** Un tableau vide par métier : ce que la page passe à l'onglet si le référentiel est illisible. */
export function entreprisesParMetiersVides(): Record<MetierPrestataire, EntrepriseMetier[]> {
  return Object.fromEntries(METIERS_PRESTATAIRE.map((m) => [m, [] as EntrepriseMetier[]])) as Record<MetierPrestataire, EntrepriseMetier[]>;
}

export interface LierPrestataireInput {
  coproCode: string;
  entrepriseId: string;
  metier: MetierPrestataire;
  /** Le contact principal de ce métier pour la copro (un seul : l'ancien principal est dégradé). */
  principal: boolean;
}

/** Rattache une entreprise du référentiel à la copro, pour un métier. */
export async function lierPrestataire(p: LierPrestataireInput, auteur: AuteurContrats): Promise<void> {
  await exigerPerimetre(p.coproCode, auteur.id);
  if (!metierConnu(p.metier)) throw new Error("Métier de prestataire inconnu.");
  const entreprise = await getClesEntrepriseRepository().get(p.entrepriseId);
  if (!entreprise) throw new Error("Cette entreprise est introuvable dans le référentiel du cabinet.");
  if (entreprise.statut === "bloquee") throw new Error(`${entreprise.nom} est bloquée dans le référentiel : elle ne se rattache pas à une copropriété.`);
  if (!(entreprise.metiers ?? []).includes(p.metier)) {
    throw new Error(`${entreprise.nom} n'est pas référencée comme ${LIBELLE_METIER[p.metier].toLowerCase()} : complète sa fiche dans le référentiel d'abord.`);
  }

  await getContratsCoproRepository().lierPrestataire({ coproCode: p.coproCode, entrepriseId: entreprise.id, metier: p.metier, principal: p.principal });
  await journaliser({
    coproCode: p.coproCode,
    sujet: null,
    cycleId: null,
    type: "prestataire_lie",
    parUserId: auteur.id,
    parNom: auteur.nom,
    details: { entreprise: entreprise.nom, metier: p.metier, principal: p.principal },
  });
}

/** Détache une entreprise de la copro pour un métier (la fiche de l'entreprise ne bouge pas). */
export async function delierPrestataire(p: { coproCode: string; entrepriseId: string; metier: MetierPrestataire }, auteur: AuteurContrats): Promise<void> {
  await exigerPerimetre(p.coproCode, auteur.id);
  if (!metierConnu(p.metier)) throw new Error("Métier de prestataire inconnu.");
  const repo = getContratsCoproRepository();
  const lies = await repo.listerPrestataires([p.coproCode]);
  const lie = lies.find((x) => x.entrepriseId === p.entrepriseId && x.metier === p.metier);
  if (!lie) throw new Error("Ce prestataire n'est pas (ou plus) rattaché à cette copropriété : recharge la page.");

  await repo.delierPrestataire(p.coproCode, p.entrepriseId, p.metier);
  await journaliser({
    coproCode: p.coproCode,
    sujet: null,
    cycleId: null,
    type: "prestataire_delie",
    parUserId: auteur.id,
    parNom: auteur.nom,
    details: { entreprise: lie.entrepriseNom, metier: p.metier },
  });
}
