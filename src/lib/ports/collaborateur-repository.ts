// Port du module Collaborateurs : l'annuaire du cabinet (public."User"), les equipes des
// copros (public."Copropriete".managerId / assistantId / accountantId), et le complement
// intranet (arrivees, departs, habilitations). Ne depend que du domaine.

import type { Collaborateur, EquipeCopro, NouveauCollaborateur, RoleEquipe, TypeHabilitation } from "@/lib/domain/collaborateur";

export interface CollaborateurRepository {
  /** Tout l'annuaire, actifs et partis, avec arrivee / depart / habilitations. Trie par nom. */
  listerTous(): Promise<Collaborateur[]>;
  get(userId: string): Promise<Collaborateur | null>;
  /** Les equipes de toutes les copros (actives et perdues). */
  listerEquipes(): Promise<EquipeCopro[]>;
  /** Cree la personne dans public."User" (actif) et note son arrivee. Renvoie l'id. */
  creer(n: NouveauCollaborateur & { initiales: string; par: string }): Promise<string>;
  /** Change un membre de l'equipe d'une copro (null = personne). */
  reaffecter(coproCode: string, role: RoleEquipe, userId: string | null): Promise<void>;
  /** Note le depart (intranet) et passe la personne inactive (App A). */
  noterDepart(userId: string, departISO: string, note: string | undefined, par: string): Promise<void>;
  /** Annule un depart note (retour, erreur). */
  annulerDepart(userId: string, par: string): Promise<void>;
  /** Pose la fonction intranet d'un collaborateur (et met le role App A en coherence). */
  changerFonction(userId: string, fonction: string, roleTable: string, par: string): Promise<void>;
  ajouterHabilitation(userId: string, type: TypeHabilitation, agence: string | undefined, par: string): Promise<void>;
  /** Clot une habilitation a aujourd'hui. */
  cloreHabilitation(id: string): Promise<void>;
}
