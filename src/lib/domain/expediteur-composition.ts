// Le « De » du nouveau mail (compositeur « Envoyer un e-mail », 29/10/2026). Domaine PUR : la
// liste des boîtes d'où la personne peut écrire, la boîte d'une copro, et la règle qui fait
// suivre la boîte quand on choisit une copro. Le serveur rejoue ce calcul à l'envoi : la boîte
// reçue du navigateur n'est acceptée que si elle est dans la liste (expediteurAutorise).
//
// Qui écrit depuis quoi :
//   - les boîtes PARTAGÉES (boîtes triées, MAIL_TRI_BOITES) : celle de son agence ; un comptable
//     (rôle COMPTABLE) toutes, comme son onglet « Comptabilité » ; un super-admin toutes ;
//   - sa boîte PERSO, pour tout le monde, comme quand on répond ; jamais en incarnation
//     (« Changer de gestionnaire » n'ouvre pas la boîte perso de la personne incarnée) ;
//   - pas les boîtes ouvertes par une délégation de portefeuille (boîte perso du titulaire, sa
//     boîte partagée d'une autre agence) : le choix le plus restreint, à élargir si Sekou le veut.
// À l'ouverture : la boîte de son agence, comme avant ; sans elle, la première boîte partagée,
// sinon la boîte perso.

/** Une boîte partagée telle que la config la décrit (sous-ensemble de BoiteTriConfig). */
export interface BoitePartagee {
  /** Adresse en minuscules (ou « echantillon » en développement). */
  boite: string;
  /** Codes d'agence servis par la boîte (HLS, LGC, ASN). */
  agences: readonly string[];
}

/** Une boîte proposée dans « De ». */
export interface ExpediteurComposition {
  /** Adresse en minuscules : c'est l'identifiant envoyé au serveur. */
  boite: string;
  /** true = la boîte perso de la personne connectée. */
  personnelle: boolean;
  /** Agences servies (boîte partagée) ; [] pour la boîte perso. */
  agences: string[];
}

/** Ce que le navigateur sait d'une boîte proposée : de quoi régler le bouton (brouillon, envoi). */
export interface ExpediteurPropose extends ExpediteurComposition {
  /** Graph branché et vraie boîte : un brouillon peut être créé (sinon aperçu). */
  brouillon: boolean;
  /** Le bouton ENVOIE (boîte perso, ou boîte partagée dont l'envoi est ouvert) au lieu de créer un brouillon. */
  envoi: boolean;
}

const min = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/**
 * Les boîtes d'où la personne peut écrire un mail neuf, et celle choisie à l'ouverture. Ordre :
 * la boîte de son agence, les autres boîtes partagées (ordre de la config), la boîte perso.
 */
export function expediteursComposition(p: {
  /** Code d'agence de la personne (HLS…), ou rien. */
  agence: string | null | undefined;
  superAdmin: boolean;
  /** Rôle COMPTABLE : toutes les boîtes triées, comme l'onglet « Comptabilité ». */
  comptable: boolean;
  /** Les boîtes triées de la config (boitesTri()). */
  boites: readonly BoitePartagee[];
  /** Adresse de la personne connectée ; null en incarnation (pas de boîte perso). */
  perso: string | null | undefined;
}): { expediteurs: ExpediteurComposition[]; parDefaut: string | null } {
  const agence = (p.agence ?? "").trim().toUpperCase();
  const deLAgence = agence ? p.boites.find((b) => b.agences.some((a) => a.trim().toUpperCase() === agence)) : undefined;
  const partagees = p.superAdmin || p.comptable ? [...(deLAgence ? [deLAgence] : []), ...p.boites.filter((b) => b !== deLAgence)] : deLAgence ? [deLAgence] : [];
  const out: ExpediteurComposition[] = [];
  const vues = new Set<string>();
  for (const b of partagees) {
    const boite = min(b.boite);
    if (!boite || vues.has(boite)) continue;
    vues.add(boite);
    out.push({ boite, personnelle: false, agences: b.agences.map((a) => a.trim().toUpperCase()) });
  }
  const perso = min(p.perso);
  // Une adresse perso qui serait aussi une boîte partagée reste la boîte partagée (pas de doublon).
  if (perso.includes("@") && !vues.has(perso)) out.push({ boite: perso, personnelle: true, agences: [] });
  return { expediteurs: out, parDefaut: out[0]?.boite ?? null };
}

/**
 * La boîte demandée par le navigateur, si elle est dans la liste ; absente : celle de
 * l'ouverture. null = refus (une adresse fabriquée ne passe jamais).
 */
export function expediteurAutorise<E extends ExpediteurComposition>(
  expediteurs: readonly E[],
  demandee: string | null | undefined,
): E | null {
  const cible = min(demandee) || expediteurs[0]?.boite || "";
  return expediteurs.find((e) => e.boite === cible) ?? null;
}

/** Le « De » du compositeur : la boîte, et si la personne l'a choisie elle-même. */
export interface EtatExpediteur {
  boite: string;
  /** true = choisie à la main dans « De » ; false = celle de l'ouverture ou réglée par la copro. */
  manuel: boolean;
}

/**
 * La boîte après le choix d'une copro. La règle, la plus simple qui tienne :
 *   - la copro décide tant que la personne n'a pas choisi « De » à la main ;
 *   - un choix à la main tient, sauf s'il s'agit d'une boîte partagée qui ne sert pas la
 *     nouvelle copro : elle cède alors à la boîte de la copro (le choix redevient automatique) ;
 *   - la boîte perso choisie à la main tient toujours (elle vaut pour toutes les copros) ;
 *   - pas de copro, ou une copro dont la boîte n'est pas proposée : rien ne bouge.
 * `change` dit si la boîte a bougé (l'écran le montre dans « De »).
 */
export function expediteurApresCopro(
  etat: EtatExpediteur,
  boiteCopro: string | null | undefined,
  expediteurs: readonly ExpediteurComposition[],
): EtatExpediteur & { change: boolean } {
  const cible = min(boiteCopro);
  const proposee = cible ? expediteurs.find((e) => e.boite === cible && !e.personnelle) : undefined;
  if (!proposee || etat.boite === cible) return { ...etat, change: false };
  const actuelle = expediteurs.find((e) => e.boite === etat.boite);
  if (etat.manuel && actuelle?.personnelle) return { ...etat, change: false };
  return { boite: proposee.boite, manuel: false, change: true };
}

/**
 * « Toute la copropriété » (Cci, REA-305) ne part pas de la boîte perso : les réponses des
 * copropriétaires doivent arriver dans la boîte partagée, où le tri les range au binôme, et
 * pas dans la messagerie d'une seule personne. Envoi technique possible, refusé par choix.
 */
export const MOTIF_CCI_DEPUIS_PERSO =
  "« Toute la copropriété » part de la boîte partagée de la copro, pas d'une boîte perso : les réponses des copropriétaires doivent arriver dans le tri. Choisissez la boîte partagée dans « De ».";

/** La boîte peut-elle porter un envoi à toute la copropriété ? */
export function touteLaCoproPossibleDepuis(e: Pick<ExpediteurComposition, "personnelle"> | null | undefined): boolean {
  return Boolean(e && !e.personnelle);
}
