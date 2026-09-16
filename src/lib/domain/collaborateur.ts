// Les COLLABORATEURS du cabinet : qui est la, sur quel portefeuille, avec quels droits.
// Module « Collaborateurs » (Sekou, 16/09/2026 : « sinon on ne sait pas qui est sur le
// portefeuille de qui, en dehors des copros ESTALE ou ca remonte auto »).
//
// La source du collaborateur est public."User" (App A) : nom, e-mail, role, agence,
// directeur referent, actif. L'intranet y ajoute l'arrivee, le depart et les
// habilitations (tables intranet_collaborateur / intranet_habilitation). Le portefeuille,
// c'est public."Copropriete" : managerId / assistantId / accountantId. Fonctions pures.

/** Les valeurs de l'enum public."UserRole" d'App A, telles quelles. */
export const ROLES_TABLE = ["ADMIN", "DIRECTEUR_SYNDIC", "DIRECTEUR_AGENCE", "GESTIONNAIRE", "ASSISTANT", "COMPTABLE", "GESTIONNAIRE_LOCATIVE", "AUTRE"] as const;
export type RoleTable = (typeof ROLES_TABLE)[number];

export const LIBELLE_ROLE_TABLE: Record<RoleTable, string> = {
  ADMIN: "Direction",
  DIRECTEUR_SYNDIC: "Directeur de copropriété",
  DIRECTEUR_AGENCE: "Directeur d'agence",
  GESTIONNAIRE: "Gestionnaire de copropriété",
  ASSISTANT: "Assistant de copropriété",
  COMPTABLE: "Comptable copropriété",
  GESTIONNAIRE_LOCATIVE: "Gestionnaire locative",
  AUTRE: "Autre (vente, location, accueil)",
};

export const HABILITATIONS = ["referent_syndic"] as const;
export type TypeHabilitation = (typeof HABILITATIONS)[number];
export const LIBELLE_HABILITATION: Record<TypeHabilitation, string> = {
  referent_syndic: "Référent syndic d'une agence (droits de direction sur cette agence)",
};

export interface Habilitation {
  id: string;
  type: TypeHabilitation;
  agence?: string;
  depuisISO: string;
  jusquaISO?: string;
}

export interface Collaborateur {
  id: string;
  nomComplet: string;
  initiales: string;
  email?: string;
  roleTable?: string;
  agenceId?: string;
  agenceCode?: string;
  /** public."User".isActive */
  actif: boolean;
  referentDirectorId?: string;
  arriveeISO?: string;
  departISO?: string;
  note?: string;
  habilitations: Habilitation[];
}

/** L'equipe d'une copropriete au referentiel : les trois FK vers public."User". */
export interface EquipeCopro {
  code: string;
  nom: string;
  statut: "active" | "inactive";
  managerId?: string;
  assistantId?: string;
  accountantId?: string;
}

export type RoleEquipe = "gestionnaire" | "assistant" | "comptable";

export interface Portefeuille {
  gestionnaire: EquipeCopro[];
  assistant: EquipeCopro[];
  comptable: EquipeCopro[];
}

/** Les copros actives d'un collaborateur, par role tenu. */
export function portefeuilleDe(userId: string, equipes: EquipeCopro[]): Portefeuille {
  const actives = equipes.filter((e) => e.statut === "active");
  const tri = (l: EquipeCopro[]) => [...l].sort((a, b) => a.code.localeCompare(b.code));
  return {
    gestionnaire: tri(actives.filter((e) => e.managerId === userId)),
    assistant: tri(actives.filter((e) => e.assistantId === userId)),
    comptable: tri(actives.filter((e) => e.accountantId === userId)),
  };
}

export function taillePortefeuille(p: Portefeuille): number {
  return p.gestionnaire.length + p.assistant.length + p.comptable.length;
}

/** Un collaborateur est « en poste » s'il est actif et sans depart passe. */
export function estEnPoste(c: Pick<Collaborateur, "actif" | "departISO">, aujourdHuiISO: string): boolean {
  return c.actif && (!c.departISO || c.departISO > aujourdHuiISO);
}

export interface NouveauCollaborateur {
  nomComplet: string;
  email: string;
  roleTable: RoleTable;
  agenceId?: string;
  referentDirectorId?: string;
  arriveeISO?: string;
  note?: string;
}

/** Ce qui empeche de creer un collaborateur. Vide = on peut. */
export function obstaclesArrivee(n: NouveauCollaborateur, emailsExistants: string[]): string[] {
  const m: string[] = [];
  if (!n.nomComplet.trim() || n.nomComplet.trim().split(/\s+/).length < 2) m.push("le prénom et le nom");
  const email = n.email.trim().toLowerCase();
  if (!/^[a-z0-9._-]+@real31\.fr$/.test(email)) m.push("un e-mail @real31.fr");
  else if (emailsExistants.map((e) => e.toLowerCase()).includes(email)) m.push(`${email} existe déjà`);
  if (!(ROLES_TABLE as readonly string[]).includes(n.roleTable)) m.push("un rôle connu");
  if (n.arriveeISO && !/^\d{4}-\d{2}-\d{2}$/.test(n.arriveeISO)) m.push("une date d'arrivée lisible");
  return m;
}

/** « Victoria DORLEAC » -> « VD ». */
export function initialesDe(nomComplet: string): string {
  return nomComplet
    .trim()
    .split(/\s+/)
    .map((m) => m[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 3);
}

export interface Remplacants {
  gestionnaire?: string;
  assistant?: string;
  comptable?: string;
}

export interface Reaffectation {
  code: string;
  role: RoleEquipe;
  de: string;
  vers: string | null;
}

/**
 * Le plan d'un depart : chaque copro du portefeuille passe au remplacant du role, ou a
 * personne (null) si aucun remplacant n'est donne. Rien n'est ecrit ici.
 */
export function planDeDepart(userId: string, equipes: EquipeCopro[], remplacants: Remplacants): Reaffectation[] {
  const p = portefeuilleDe(userId, equipes);
  const plan: Reaffectation[] = [];
  for (const e of p.gestionnaire) plan.push({ code: e.code, role: "gestionnaire", de: userId, vers: remplacants.gestionnaire ?? null });
  for (const e of p.assistant) plan.push({ code: e.code, role: "assistant", de: userId, vers: remplacants.assistant ?? null });
  for (const e of p.comptable) plan.push({ code: e.code, role: "comptable", de: userId, vers: remplacants.comptable ?? null });
  return plan;
}

/** Ce qui empeche un depart. Vide = on peut. */
export function obstaclesDepart(c: Collaborateur, departISO: string, plan: Reaffectation[]): string[] {
  const m: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(departISO)) m.push("une date de départ lisible");
  if (plan.some((r) => r.vers === c.id)) m.push("un remplaçant ne peut pas être la personne qui part");
  const sansRemplacant = plan.filter((r) => r.vers === null);
  if (sansRemplacant.length > 0) m.push(`${sansRemplacant.length} copropriété${sansRemplacant.length > 1 ? "s" : ""} resteraient sans ${sansRemplacant[0].role} : choisir un remplaçant`);
  return m;
}
