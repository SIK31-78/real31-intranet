// Service : les delegations d'ecriture (ADR-041). Qui voit quoi, qui peut en poser, en
// retirer. Le droit d'ecrire qui en decoule vit dans coproprietes/copro-appartient ; ici
// on gere les delegations elles-memes. Passe par le routeur.

import { getAgenceRepository, getCollaborateurRepository, getDelegationRepository } from "@/lib/adapters/router";
import type { Collaborateur } from "@/lib/domain/collaborateur";
import { delegationActive, niveauEcriture, peutDeleguer, type AuteurEcriture, type PorteeDelegation } from "@/lib/domain/perimetre-ecriture";
import type { DelegationEnregistree, NouvelleDelegation } from "@/lib/ports/delegation-repository";

export interface DelegationVue extends DelegationEnregistree {
  de: { id: string; nomComplet: string };
  a: { id: string; nomComplet: string };
  /** Active aujourd'hui (entre ses dates), a venir, ou passee. */
  etat: "active" | "a_venir" | "passee";
  /** L'utilisateur courant peut la retirer. */
  retirable: boolean;
}

export interface EcranDelegations {
  auteur: AuteurEcriture;
  delegations: DelegationVue[];
  /** Les collaborateurs en poste, pour les listes du formulaire. */
  collaborateurs: { id: string; nomComplet: string; agenceCode?: string; roleTable?: string }[];
  /** Ceux dont l'utilisateur peut deleguer le portefeuille (lui-meme, son agence, ou tous). */
  titulairesPossibles: string[];
  agences: string[];
}

async function auteurDe(c: Collaborateur): Promise<AuteurEcriture> {
  return {
    id: c.id,
    roleTable: c.roleTable ?? null,
    agenceCode: c.agenceCode ?? null,
    habilitations: c.habilitations.filter((h) => !h.jusquaISO).map((h) => (h.agence ? `${h.type}:${h.agence}` : h.type)),
  };
}

export async function ecranDelegations(userId: string, superAdmin = false): Promise<EcranDelegations | null> {
  const repo = getCollaborateurRepository();
  const [tous, delegations, agences] = await Promise.all([repo.listerTous(), getDelegationRepository().listerEnCours(), getAgenceRepository().listerAgences()]);
  const moi = tous.find((c) => c.id === userId);
  if (!moi) return null;
  const auteur = { ...(await auteurDe(moi)), superAdmin };
  const parId = new Map(tous.map((c) => [c.id, c]));
  const aujourdHui = new Date().toISOString().slice(0, 10);
  const niveau = niveauEcriture(auteur);

  const visible = (d: DelegationEnregistree) => {
    if (niveau === "cabinet") return true;
    if (d.deUserId === userId || d.aUserId === userId) return true;
    const titulaire = parId.get(d.deUserId);
    return niveau === "agence" && peutDeleguer(auteur, { id: d.deUserId, agenceCode: titulaire?.agenceCode ?? null }, d.portee, d.agenceCode);
  };

  const vues: DelegationVue[] = delegations.filter(visible).map((d) => {
    const de = parId.get(d.deUserId);
    const a = parId.get(d.aUserId);
    const etat = delegationActive(d, aujourdHui) ? "active" : d.depuisISO > aujourdHui ? "a_venir" : "passee";
    return {
      ...d,
      de: { id: d.deUserId, nomComplet: de?.nomComplet ?? d.deUserId },
      a: { id: d.aUserId, nomComplet: a?.nomComplet ?? d.aUserId },
      etat,
      retirable: peutDeleguer(auteur, { id: d.deUserId, agenceCode: de?.agenceCode ?? null }, d.portee, d.agenceCode),
    };
  });

  const enPoste = tous.filter((c) => c.actif && !c.departISO);
  return {
    auteur,
    delegations: vues,
    collaborateurs: enPoste.map((c) => ({ id: c.id, nomComplet: c.nomComplet, ...(c.agenceCode ? { agenceCode: c.agenceCode } : {}), ...(c.roleTable ? { roleTable: c.roleTable } : {}) })),
    titulairesPossibles: enPoste.filter((c) => peutDeleguer(auteur, { id: c.id, agenceCode: c.agenceCode ?? null }, "portefeuille")).map((c) => c.id),
    agences: agences.map((a) => a.code),
  };
}

export interface DemandeDelegation {
  deUserId: string;
  aUserIds: string[];
  portee: PorteeDelegation;
  agenceCode?: string | null;
  coproCode?: string | null;
  depuisISO: string;
  jusquaISO?: string | null;
  motif?: string | null;
}

/** Cree une delegation par beneficiaire. Leve si l'auteur n'a pas le droit de deleguer ce titulaire. */
export async function creerDelegation(par: { id: string; nomComplet: string; superAdmin?: boolean }, demande: DemandeDelegation): Promise<number> {
  const repo = getCollaborateurRepository();
  const [moi, titulaire] = await Promise.all([repo.get(par.id), repo.get(demande.deUserId)]);
  if (!moi) throw new Error("Collaborateur inconnu.");
  if (!titulaire) throw new Error("Titulaire inconnu.");
  const auteur = { ...(await auteurDe(moi)), superAdmin: par.superAdmin ?? false };
  if (!peutDeleguer(auteur, { id: titulaire.id, agenceCode: titulaire.agenceCode ?? null }, demande.portee, demande.agenceCode)) {
    throw new Error("Vous ne pouvez déléguer que votre portefeuille, ou ceux de votre agence si vous la dirigez.");
  }
  if (demande.aUserIds.length === 0) throw new Error("Choisir au moins un bénéficiaire.");
  if (demande.aUserIds.includes(demande.deUserId)) throw new Error("Le titulaire ne peut pas être son propre bénéficiaire.");
  const delegations = getDelegationRepository();
  let n = 0;
  for (const aUserId of new Set(demande.aUserIds)) {
    const nouvelle: NouvelleDelegation = { ...demande, aUserId, creePar: par.nomComplet };
    await delegations.creer(nouvelle);
    n++;
  }
  return n;
}

export async function cloturerDelegation(par: { id: string; nomComplet: string; superAdmin?: boolean }, id: string): Promise<void> {
  const ecran = await ecranDelegations(par.id, par.superAdmin);
  const d = ecran?.delegations.find((x) => x.id === id);
  if (!d) throw new Error("Délégation introuvable.");
  if (!d.retirable) throw new Error("Vous ne pouvez pas retirer cette délégation.");
  await getDelegationRepository().cloturer(id, par.nomComplet);
}
