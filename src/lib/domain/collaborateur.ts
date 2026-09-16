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

/**
 * La FONCTION d'un collaborateur, portee par l'intranet (intranet_collaborateur.fonction) :
 * plus fine que le role App A, dont l'enum ne connait que « AUTRE » pour la vente, la
 * location et l'accueil. Sekou (16/09/2026) : « pas "autres" mais leur vrai role, a terme
 * ils utiliseront l'intranet avec leurs outils ». Liste fermee, tiree des pages equipe du
 * site ; chaque fonction porte sa famille et le role App A qui lui correspond.
 */
export const FONCTIONS = [
  "dirigeant",
  "responsable_transaction_gestion",
  "responsable_agence",
  "assistant_direction",
  "directeur_copropriete",
  "gestionnaire_copropriete",
  "assistant_copropriete",
  "comptable_copropriete",
  "assistant_comptable",
  "charge_travaux",
  "directeur_vente",
  "conseiller_vente",
  "conseiller_location",
  "assistant_commercial",
  "responsable_gestion_locative",
  "gestionnaire_locative",
  "assistant_gestionnaire_locative",
  "assistant_administratif",
  "comptable_entreprise",
] as const;
export type Fonction = (typeof FONCTIONS)[number];

export type FamilleFonction = "direction" | "syndic" | "transaction" | "location" | "accueil";

export const DETAIL_FONCTION: Record<Fonction, { libelle: string; famille: FamilleFonction; roleTable: RoleTable }> = {
  dirigeant: { libelle: "Dirigeant", famille: "direction", roleTable: "ADMIN" },
  responsable_transaction_gestion: { libelle: "Responsable transaction et gestion", famille: "direction", roleTable: "AUTRE" },
  responsable_agence: { libelle: "Responsable d'agence", famille: "direction", roleTable: "DIRECTEUR_AGENCE" },
  assistant_direction: { libelle: "Assistant de direction", famille: "direction", roleTable: "ADMIN" },
  directeur_copropriete: { libelle: "Directeur de copropriété", famille: "syndic", roleTable: "DIRECTEUR_SYNDIC" },
  gestionnaire_copropriete: { libelle: "Gestionnaire de copropriété", famille: "syndic", roleTable: "GESTIONNAIRE" },
  assistant_copropriete: { libelle: "Assistant de copropriété", famille: "syndic", roleTable: "ASSISTANT" },
  comptable_copropriete: { libelle: "Comptable copropriété", famille: "syndic", roleTable: "COMPTABLE" },
  assistant_comptable: { libelle: "Assistant comptable copropriété", famille: "syndic", roleTable: "COMPTABLE" },
  charge_travaux: { libelle: "Chargé du suivi des travaux", famille: "syndic", roleTable: "GESTIONNAIRE" },
  directeur_vente: { libelle: "Directeur service vente", famille: "transaction", roleTable: "AUTRE" },
  conseiller_vente: { libelle: "Conseiller immobilier en vente", famille: "transaction", roleTable: "AUTRE" },
  conseiller_location: { libelle: "Conseiller immobilier en location", famille: "location", roleTable: "AUTRE" },
  assistant_commercial: { libelle: "Assistant commercial", famille: "transaction", roleTable: "AUTRE" },
  responsable_gestion_locative: { libelle: "Responsable gestion locative", famille: "location", roleTable: "AUTRE" },
  gestionnaire_locative: { libelle: "Gestionnaire locative", famille: "location", roleTable: "GESTIONNAIRE_LOCATIVE" },
  assistant_gestionnaire_locative: { libelle: "Assistant gestionnaire locative", famille: "location", roleTable: "AUTRE" },
  assistant_administratif: { libelle: "Assistant administratif, accueil", famille: "accueil", roleTable: "AUTRE" },
  comptable_entreprise: { libelle: "Comptable d'entreprise (le cabinet)", famille: "direction", roleTable: "AUTRE" },
};

export const LIBELLE_FAMILLE_FONCTION: Record<FamilleFonction, string> = {
  direction: "Direction",
  syndic: "Syndic de copropriété",
  transaction: "Transaction",
  location: "Location et gestion locative",
  accueil: "Accueil et administratif",
};

/** Le libelle a afficher : la fonction intranet si elle est connue, sinon le role App A. */
export function libelleFonction(c: { fonction?: string; roleTable?: string }): string {
  const f = c.fonction as Fonction | undefined;
  if (f && DETAIL_FONCTION[f]) return DETAIL_FONCTION[f].libelle;
  const r = c.roleTable as RoleTable | undefined;
  return r && LIBELLE_ROLE_TABLE[r] ? LIBELLE_ROLE_TABLE[r] : (c.roleTable ?? "—");
}

/** La famille : par la fonction, sinon deduite du role App A. */
export function familleDe(c: { fonction?: string; roleTable?: string }): FamilleFonction {
  const f = c.fonction as Fonction | undefined;
  if (f && DETAIL_FONCTION[f]) return DETAIL_FONCTION[f].famille;
  switch ((c.roleTable ?? "").toUpperCase()) {
    case "ADMIN":
    case "DIRECTEUR_AGENCE":
      return "direction";
    case "DIRECTEUR_SYNDIC":
    case "GESTIONNAIRE":
    case "ASSISTANT":
    case "COMPTABLE":
      return "syndic";
    case "GESTIONNAIRE_LOCATIVE":
      return "location";
    default:
      return "accueil";
  }
}

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
  /** Fonction intranet (cf. FONCTIONS), plus fine que le role App A. */
  fonction?: string;
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
  fonction?: Fonction;
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
