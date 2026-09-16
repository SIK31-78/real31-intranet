// Services du module Collaborateurs (16/09/2026). Passent par le routeur (ADR-001). La garde
// (direction) est dans les pages et les actions.

import { getAgenceRepository, getCollaborateurRepository } from "@/lib/adapters/router";
import {
  DETAIL_FONCTION,
  estEnPoste,
  initialesDe,
  obstaclesArrivee,
  obstaclesDepart,
  planDeDepart,
  portefeuilleDe,
  taillePortefeuille,
  type Collaborateur,
  type EquipeCopro,
  type NouveauCollaborateur,
  type Portefeuille,
  type Remplacants,
  type Fonction,
  type RoleEquipe,
  type TypeHabilitation,
} from "@/lib/domain/collaborateur";

export interface CollaborateurResume extends Collaborateur {
  enPoste: boolean;
  nbCopros: number;
  nbGestionnaire: number;
  nbAssistant: number;
  nbComptable: number;
}

export interface Annuaire {
  collaborateurs: CollaborateurResume[];
  agences: { id: string; code: string }[];
  /** Les copros actives sans gestionnaire ou sans assistant : ce qu'on ne sait pas « qui est sur quoi ». */
  orphelines: { sansGestionnaire: EquipeCopro[]; sansAssistant: EquipeCopro[] };
}

export async function listerAnnuaire(): Promise<Annuaire> {
  const repo = getCollaborateurRepository();
  const [tous, equipes, agences] = await Promise.all([repo.listerTous(), repo.listerEquipes(), getAgenceRepository().listerAgences()]);
  const aujourdHui = new Date().toISOString().slice(0, 10);
  const collaborateurs = tous.map((c) => {
    const p = portefeuilleDe(c.id, equipes);
    return { ...c, enPoste: estEnPoste(c, aujourdHui), nbCopros: taillePortefeuille(p), nbGestionnaire: p.gestionnaire.length, nbAssistant: p.assistant.length, nbComptable: p.comptable.length };
  });
  const actives = equipes.filter((e) => e.statut === "active");
  const enPosteIds = new Set(collaborateurs.filter((c) => c.enPoste).map((c) => c.id));
  return {
    collaborateurs,
    agences: agences.map((a) => ({ id: a.id, code: a.code })),
    orphelines: {
      sansGestionnaire: actives.filter((e) => !e.managerId || !enPosteIds.has(e.managerId)),
      sansAssistant: actives.filter((e) => !e.assistantId || !enPosteIds.has(e.assistantId)),
    },
  };
}

export interface FicheCollaborateur {
  collaborateur: Collaborateur;
  enPoste: boolean;
  portefeuille: Portefeuille;
  /** Les collegues en poste, pour reaffecter. */
  collegues: Collaborateur[];
  agences: { id: string; code: string }[];
  directeurs: Collaborateur[];
}

export async function getFicheCollaborateur(userId: string): Promise<FicheCollaborateur | null> {
  const repo = getCollaborateurRepository();
  const [c, tous, equipes, agences] = await Promise.all([repo.get(userId), repo.listerTous(), repo.listerEquipes(), getAgenceRepository().listerAgences()]);
  if (!c) return null;
  const aujourdHui = new Date().toISOString().slice(0, 10);
  const enPoste = tous.filter((x) => estEnPoste(x, aujourdHui) && x.id !== userId);
  return {
    collaborateur: c,
    enPoste: estEnPoste(c, aujourdHui),
    portefeuille: portefeuilleDe(userId, equipes),
    collegues: enPoste,
    agences: agences.map((a) => ({ id: a.id, code: a.code })),
    directeurs: enPoste.filter((x) => ["ADMIN", "DIRECTEUR_SYNDIC", "DIRECTEUR_AGENCE"].includes(x.roleTable ?? "")),
  };
}

export async function arriveeCollaborateur(n: NouveauCollaborateur, par: string): Promise<string> {
  const repo = getCollaborateurRepository();
  const tous = await repo.listerTous();
  const obstacles = obstaclesArrivee(n, tous.map((c) => c.email ?? "").filter(Boolean));
  if (obstacles.length > 0) throw new Error(`Il manque ${obstacles.join(", ")}.`);
  // Le role App A decoule de la fonction quand elle est donnee.
  if (n.fonction) n = { ...n, roleTable: DETAIL_FONCTION[n.fonction].roleTable };
  return repo.creer({ ...n, nomComplet: n.nomComplet.trim(), email: n.email.trim().toLowerCase(), initiales: initialesDe(n.nomComplet), par });
}

/** Le depart : le portefeuille passe aux remplacants, puis la personne est notee partie. */
export async function departCollaborateur(userId: string, departISO: string, remplacants: Remplacants, note: string | undefined, par: string): Promise<{ reaffectees: number }> {
  const repo = getCollaborateurRepository();
  const [c, equipes] = await Promise.all([repo.get(userId), repo.listerEquipes()]);
  if (!c) throw new Error("Collaborateur introuvable.");
  const plan = planDeDepart(userId, equipes, remplacants);
  const obstacles = obstaclesDepart(c, departISO, plan);
  if (obstacles.length > 0) throw new Error(obstacles.join(" ; "));
  for (const r of plan) await repo.reaffecter(r.code, r.role, r.vers);
  await repo.noterDepart(userId, departISO, note, par);
  return { reaffectees: plan.length };
}

export function annulerDepartCollaborateur(userId: string, par: string): Promise<void> {
  return getCollaborateurRepository().annulerDepart(userId, par);
}

export async function reaffecterCopro(coproCode: string, role: RoleEquipe, userId: string | null): Promise<void> {
  await getCollaborateurRepository().reaffecter(coproCode, role, userId);
}

/** La fonction intranet, et le role App A qui va avec (coherence des droits). */
export function changerFonction(userId: string, fonction: Fonction, par: string): Promise<void> {
  return getCollaborateurRepository().changerFonction(userId, fonction, DETAIL_FONCTION[fonction].roleTable, par);
}

export function ajouterHabilitation(userId: string, type: TypeHabilitation, agence: string | undefined, par: string): Promise<void> {
  return getCollaborateurRepository().ajouterHabilitation(userId, type, agence, par);
}

export function cloreHabilitation(id: string): Promise<void> {
  return getCollaborateurRepository().cloreHabilitation(id);
}
