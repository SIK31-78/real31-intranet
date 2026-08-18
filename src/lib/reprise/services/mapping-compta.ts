// Service de MAPPING de la reprise comptable - INCREMENT 2 : resoudre chaque compte source
// distinct du grand livre extrait vers sa cible eStale, sous forme d'un PLAN (DRY-RUN STRICT).
//
// AUCUNE ecriture, AUCUNE mutation eStale : le service LIT le referentiel comptable de la copro
// cible (comptes existants avec leur nom) puis delegue la decision au domaine pur mapping-compta.
// Les creations (fournisseur, sous-compte d'attente) figurent dans le plan comme ACTIONS A FAIRE,
// executees seulement a l'increment 3.
//
// Hexagonal : parle UNIQUEMENT au port EstaleComptaLectureProvider (lecture seule). La liste des
// comptes existants (lireComptes) porte deja nomenclature + libelle -> elle fournit a la fois les
// fournisseurs (401), les coproprietaires (450, crees a l'injection patrimoine) et l'existence des
// comptes d'attente 471998/471999. Aucun nouveau port n'est necessaire (choix DRY, cf. rapport).
//
// PII : les intitules (noms) servent a l'appariement mais ne sont JAMAIS logues ni renvoyes dans
// les messages du plan (seuls numeros de compte, scores et compteurs le sont).

import type { JeuEcritures } from "@/lib/reprise/domain/ecriture";
import type { SoldeCompte } from "@/lib/reprise/domain/compta";
import {
  appliquerAvantRepartition,
  appliquerRaccordement,
  racineCompte,
  resoudreComptes,
  type CandidatCompte,
  type ContexteEstale,
  type PlanMapping,
} from "@/lib/reprise/domain/mapping-compta";
import {
  confronterBalanceBascule,
  detecterAvantRepartition,
  verifierBalancePostRepartition,
  type VerdictRaccordement,
} from "@/lib/reprise/domain/controle-comptes";
import type {
  EstaleComptaLectureProvider,
  OwnerEstale,
  RefAccounting,
} from "@/lib/reprise/ports/estale-compta-lecture-provider";
import { comptes450DeIntitules, lierOwnersComptes } from "@/lib/reprise/domain/liaison-comptes";
import { getEstaleComptaLectureProvider } from "@/lib/reprise/adapters/router";

export type ResultatPlanMapping =
  | { ok: true; plan: PlanMapping; ref: RefAccounting }
  | { ok: false; message: string };

/**
 * Preuve de bascule fournie par l'appelant (regle Sekou 2026-08-18) : la BALANCE
 * independante extraite (parseur-balance) + le total general du RGD si disponible (recoupe
 * que la balance est bien POST-repartition). Elle DEGRADE le blocage avant-repartition en
 * avertissement si l'extraction du grand livre la reproduit au centime - arithmetique,
 * jamais un libelle.
 */
export interface PreuveBascule {
  soldes: SoldeCompte[];
  dateBascule?: string;
  totalGeneralRgd?: number;
}

/** Liaison AUTO compte source 450 -> compte 450 eStale, construite contre les owners. */
export interface LiaisonAuto {
  /** compte source -> nomenclature eStale (entree directe de resoudreComptes). */
  liaisonParCompte: Record<string, string>;
  /** Notes informatives PII-free (owners sans compte 450, synthese de couverture). */
  notes: string[];
  /** Ambiguites a trancher par un humain, PII-free (references + scores). */
  warnings: string[];
}

/**
 * Construit la liaison 450 SANS patrimoine : les owners viennent d'eStale (lecture), pas
 * d'une extraction. C'est la piece du DECOUPLAGE compta/patrimoine (decision Sekou
 * 2026-08-18) : une copro DEJA creee dans eStale se reprend avec "code copro + PDF" seuls.
 *
 * Le compte CIBLE de chaque owner est derive de sa REFERENCE ("450" + reference, convention
 * eStale mesuree sur S0303 : owners 0001..000A -> comptes 4500001..450000A). On ne devine
 * pas : si le compte derive n'existe pas dans le plan eStale, l'owner est exclu de la
 * liaison (note) et ses comptes sources retombent dans le circuit nominal (appariement par
 * nom + decision humaine).
 *
 * L'appariement nom <-> intitule 450 du grand livre reutilise le MEME domaine pur que le
 * flux unifie (lierOwnersComptes : seuils 0.9/0.5, marge 0.08, homonymes jamais auto,
 * collisions retrogradees). Les owners sont presentes par leur REFERENCE (PII-free) dans
 * les messages. Pur : aucune I/O ici, l'appelant fournit owners et comptes.
 */
export function liaisonDepuisOwnersEstale(
  jeu: JeuEcritures,
  owners: OwnerEstale[],
  comptes: SoldeCompte[],
): LiaisonAuto {
  const comptes450GL = comptes450DeIntitules(jeu.intitules);
  if (owners.length === 0 || comptes450GL.length === 0) {
    const notes: string[] = [];
    if (owners.length === 0)
      notes.push("Aucun owner eStale sur la copro : liaison 450 impossible, appariement par nom seul.");
    if (comptes450GL.length === 0)
      notes.push("Aucun compte 450 avec intitule dans le grand livre : liaison 450 sans objet.");
    return { liaisonParCompte: {}, notes, warnings: [] };
  }

  const notes: string[] = [];
  const cibleParReference = new Map<string, string>();
  for (const o of owners) {
    // Nomenclature BRUTE, pas racineCompte : les references eStale peuvent etre
    // alphanumeriques ("000A" -> compte "450000A") et racineCompte mange les lettres
    // (bug constate sur S0303 : l'owner 000A ressortait "sans compte 450").
    const cible = comptes.find((c) => {
      const n = c.nomenclature.trim();
      return n.startsWith("450") && n.slice(3) === o.reference;
    });
    if (cible) cibleParReference.set(o.reference, cible.nomenclature);
    else
      notes.push(
        `Owner eStale ${o.reference} : aucun compte 450 correspondant dans le plan -> exclu de la liaison auto.`,
      );
  }

  // id = REFERENCE eStale : les warnings du domaine ("owner 0003 : appariement ambigu...")
  // deviennent directement lisibles par l'humain, sans exposer de nom.
  const liaison = lierOwnersComptes(
    owners.map((o) => ({ id: o.reference, nom: o.nom })),
    comptes450GL,
  );

  const liaisonParCompte: Record<string, string> = {};
  let lies = 0;
  for (const l of liaison.liaisons) {
    if (l.statut !== "lie" || !l.compteSource) continue;
    const cible = cibleParReference.get(l.ownerId);
    if (cible) {
      liaisonParCompte[l.compteSource] = cible;
      lies += 1;
    }
  }
  notes.push(
    `Liaison auto contre les owners eStale : ${lies}/${owners.length} owner(s) lie(s), ` +
      `${liaison.comptesNonLies.length} compte(s) 450 du grand livre sans owner lie.`,
  );
  return { liaisonParCompte, notes, warnings: liaison.warnings };
}

/**
 * Comptes source distincts du jeu extrait, avec leur intitule (si capture). Les comptes a
 * REPORT SEUL (un a-nouveau, aucun mouvement - captures dans jeu.controles) comptent AUSSI :
 * sans eux, le Livret A Matera (502003, 1 133,10 en report, zero ecriture 2026) n'apparaissait
 * pas au plan et son a-nouveau n'avait aucune destination tranchee a l'import.
 */
function comptesSourceDistincts(jeu: JeuEcritures): { compte: string; intitule?: string }[] {
  const vus = new Map<string, string | undefined>();
  for (const l of jeu.lignes) {
    if (!vus.has(l.compte)) vus.set(l.compte, jeu.intitules?.[l.compte]);
  }
  for (const c of jeu.controles ?? []) {
    const report = Math.abs(c.reportDebit ?? 0) + Math.abs(c.reportCredit ?? 0);
    if (report >= 0.005 && !vus.has(c.compte)) vus.set(c.compte, jeu.intitules?.[c.compte]);
  }
  return [...vus.entries()].map(([compte, intitule]) => ({ compte, intitule }));
}

/** Construit le referentiel eStale (fournisseurs 401, coproprietaires 450, comptes d'attente). */
export function construireContexteEstale(comptes: SoldeCompte[]): ContexteEstale {
  const enCandidat = (c: SoldeCompte) => ({ nomenclature: c.nomenclature, intitule: c.libelle ?? "" });
  const fournisseurs = comptes
    .filter((c) => racineCompte(c.nomenclature).startsWith("401"))
    .map(enCandidat);
  const coproprietaires = comptes
    .filter((c) => racineCompte(c.nomenclature).startsWith("450"))
    .map(enCandidat);
  // Racines EXPLICITES, jamais un prefixe : le plan eStale reel nomme ces comptes 4719998
  // (Livret Ancien Syndic) et 4719999 (Banque Ancien Syndic) - 7 chiffres. Avec un
  // startsWith("471999"), LES DEUX matchaient et le find prenait le premier de la liste :
  // le 512 partait sur le LIVRET (mesure S0303, attrape par le protocole des cinq cibles
  // avant toute ecriture). Et "471998" ne matchait rien -> creation d'un doublon du livret.
  const RACINES_BANQUE_AS = new Set(["471999", "4719999"]);
  const RACINES_LIVRET_AS = new Set(["471998", "4719998"]);
  const c471999 = comptes.find((c) => RACINES_BANQUE_AS.has(racineCompte(c.nomenclature)));
  const c471998 = comptes.find((c) => RACINES_LIVRET_AS.has(racineCompte(c.nomenclature)));
  return {
    fournisseurs,
    coproprietaires,
    nomenclature471999: c471999?.nomenclature,
    nomenclature471998: c471998?.nomenclature,
  };
}

/**
 * TRONC COMMUN de construirePlanMapping et preparerRevueMapping : resolution copro, lecture
 * des comptes, liaison 450 (fournie ou AUTO), resolution du plan, garde-fous bloquants.
 * Factorise a UN endroit : deux copies de cette orchestration finiraient par diverger
 * (c'est exactement le motif du bug ODJ lecture/ecriture du 2026-08-17).
 */
async function resoudrePlanCommun(
  jeu: JeuEcritures,
  coproCode: string,
  provider: EstaleComptaLectureProvider,
  liaisonParCompte?: Record<string, string>,
  raccordement?: VerdictRaccordement,
  preuveBascule?: PreuveBascule,
): Promise<
  | { ok: true; plan: PlanMapping; ref: RefAccounting; comptes: SoldeCompte[] }
  | { ok: false; message: string }
> {
  // Un jeu VIDE ne doit jamais produire un plan "pret a importer" : zero compte source =
  // zero erreur = pretAImporter true, c'est-a-dire un SUCCES MENSONGER sur un grand livre
  // que l'extraction n'a pas su lire (constate sur S0303 : 339 lignes parsees, 0 en-tete de
  // compte reconnu -> jeu vide -> plan "pret"). On refuse tout net, avec le pointeur vers
  // les notes d'extraction qui portent le diagnostic (format, pages, lignes ecartees).
  if (jeu.lignes.length === 0) {
    return {
      ok: false,
      message:
        "Aucune ecriture dans le jeu extrait : le grand livre n'a pas ete lu " +
        "(format non reconnu ou document vide). Consulter les notes d'extraction avant d'aller plus loin.",
    };
  }

  const ref = await provider.resoudreAccounting(coproCode);
  if (!ref) {
    return {
      ok: false,
      message: `Copro "${coproCode}" introuvable dans eStale ou sans exercice comptable ouvert.`,
    };
  }

  const comptes = await provider.lireComptes(ref);
  const contexte = construireContexteEstale(comptes);

  // Liaison 450 : celle du flux unifie (owners d'extraction, deja injectes) si fournie ;
  // sinon construite AUTO contre les owners eStale (reprise compta decouplee). Si la lecture
  // des owners echoue, on degrade en appariement par nom seul - VISIBLE dans les notes,
  // jamais silencieux.
  let liaison = liaisonParCompte;
  const notesLiaison: string[] = [];
  const warningsLiaison: string[] = [];
  if (!liaison) {
    try {
      const owners = await provider.lireOwners(ref);
      const auto = liaisonDepuisOwnersEstale(jeu, owners, comptes);
      liaison = auto.liaisonParCompte;
      notesLiaison.push(...auto.notes);
      warningsLiaison.push(...auto.warnings);
    } catch (e) {
      notesLiaison.push(
        `Liaison owners eStale indisponible (${(e as Error).message}) : appariement par nom seul.`,
      );
    }
  }

  const planBrut = resoudreComptes(comptesSourceDistincts(jeu), contexte, {
    ...(liaison ? { liaisonParCompte: liaison } : {}),
  });
  // Garde-fou "grand livre avant repartition" (classe 6/7 avec report non nul) : bloquant,
  // SAUF preuve ARITHMETIQUE (regle Sekou 2026-08-18) - une balance independante fournie ET
  // reproduite au centime par l'extraction degrade le blocage en avertissement. Preuve NON
  // reproduite -> blocage maintenu, ecarts VISIBLES en notes.
  const verdictAR = detecterAvantRepartition(jeu.controles ?? []);
  const notesPreuve: string[] = [];
  if (verdictAR.avantRepartition && preuveBascule) {
    const confrontation = confronterBalanceBascule(
      jeu.lignes,
      jeu.controles ?? [],
      preuveBascule.soldes,
      preuveBascule.dateBascule,
    );
    if (preuveBascule.totalGeneralRgd !== undefined) {
      const postRep = verifierBalancePostRepartition(preuveBascule.soldes, preuveBascule.totalGeneralRgd);
      confrontation.postRepartitionVerifiee = postRep.coherent;
      notesPreuve.push(
        `Recoupement post-repartition : classe 6 de la balance ${postRep.classe6.toFixed(2)} vs total RGD ` +
          `${preuveBascule.totalGeneralRgd.toFixed(2)} (ecart ${postRep.ecart.toFixed(2)}) -> ${postRep.coherent ? "coherent" : "INCOHERENT"}.`,
      );
    }
    if (confrontation.reproduite) {
      verdictAR.degradeParPreuve = confrontation;
      notesPreuve.push(
        `Preuve de bascule : balance${confrontation.dateBascule ? ` du ${confrontation.dateBascule}` : ""} ` +
          `reproduite au centime (${confrontation.confrontes} comptes confrontes, 0 ecart).`,
      );
    } else {
      notesPreuve.push(
        `Preuve de bascule fournie mais NON reproduite : ${confrontation.ecarts.length} ecart(s) ` +
          `(${confrontation.ecarts.slice(0, 5).map((e) => `${e.compte} attendu ${e.attendu} obtenu ${e.obtenu}`).join(" ; ")}` +
          `${confrontation.ecarts.length > 5 ? " ; ..." : ""}) -> blocage avant-repartition MAINTENU.`,
      );
    }
  }
  const planAR = appliquerAvantRepartition(planBrut, verdictAR);
  // Controle croise cloture <-> en cours (si fourni) : bloquant strict si les deux GL ne se
  // raccordent pas au centime. Absent pour l'ecran standalone (un seul grand livre) -> no-op.
  const planRac = raccordement ? appliquerRaccordement(planAR, raccordement) : planAR;
  const plan =
    notesLiaison.length > 0 || warningsLiaison.length > 0 || notesPreuve.length > 0
      ? {
          ...planRac,
          notes: [...planRac.notes, ...notesLiaison, ...notesPreuve],
          warnings: [...planRac.warnings, ...warningsLiaison],
        }
      : planRac;

  return { ok: true, plan, ref, comptes };
}

/**
 * Construit le PLAN de mapping du jeu d'ecritures extrait vers la copro cible eStale (coproCode).
 * Generique par coproCode (aucun code copro en dur). Degrade proprement : copro introuvable ou
 * eStale indisponible => { ok:false, message } (jamais d'exception qui remonte).
 *
 * `provider` injectable pour les tests ; par defaut le routeur choisit reel (si eStale configure)
 * ou mock.
 */
export async function construirePlanMapping(
  jeu: JeuEcritures,
  coproCode: string,
  provider: EstaleComptaLectureProvider = getEstaleComptaLectureProvider(),
  liaisonParCompte?: Record<string, string>,
  raccordement?: VerdictRaccordement,
  preuveBascule?: PreuveBascule,
): Promise<ResultatPlanMapping> {
  try {
    const commun = await resoudrePlanCommun(jeu, coproCode, provider, liaisonParCompte, raccordement, preuveBascule);
    if (!commun.ok) return commun;
    return { ok: true, plan: commun.plan, ref: commun.ref };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `Mapping eStale impossible pour "${coproCode}" : ${message}` };
  }
}

/** Referentiel eStale expose a l'ecran de revue (pour les listes deroulantes de mapping manuel). */
export interface CandidatsEstale {
  /** Comptes 401 fournisseurs existants (nomenclature + nom). PII : noms affiches en UI seulement. */
  fournisseurs: CandidatCompte[];
  /** Comptes 450 coproprietaires existants (nomenclature + nom). PII : idem. */
  coproprietaires: CandidatCompte[];
  /**
   * Comptes d'attente/regularisation 46x et 47x existants (nomenclature + nom) : cibles candidates
   * pour la decision "coproprietaire parti" (ex. 471xxx "Coproprietaires partis", ou un 461-005
   * deja cree par la comptable). PII : noms affiches en UI seulement.
   */
  partis: CandidatCompte[];
}

/** true si le compte est un compte d'attente/regularisation 46x ou 47x (cible "coproprietaire parti"). */
function estComptePartis(nomenclature: string): boolean {
  const r = racineCompte(nomenclature);
  return r.startsWith("46") || r.startsWith("47");
}

export type ResultatRevueMapping =
  | { ok: true; plan: PlanMapping; candidats: CandidatsEstale; ref: RefAccounting }
  | { ok: false; message: string };

/**
 * Prepare la REVUE HUMAINE du mapping : construit le plan (comme construirePlanMapping) MAIS
 * expose en plus le referentiel eStale (comptes 401/450 avec leur nom) dont l'ecran a besoin
 * pour les listes deroulantes de mapping manuel. Le rejeu des decisions humaines (recalcul du
 * verdict) reste PUR cote domaine (appliquerDecisions) : ce service ne lit qu'eStale.
 *
 * DRY-RUN strict : aucune ecriture, aucune mutation. Degrade proprement (copro introuvable /
 * eStale indisponible => { ok:false, message }, jamais d'exception qui remonte).
 */
export async function preparerRevueMapping(
  jeu: JeuEcritures,
  coproCode: string,
  provider: EstaleComptaLectureProvider = getEstaleComptaLectureProvider(),
  liaisonParCompte?: Record<string, string>,
  raccordement?: VerdictRaccordement,
  preuveBascule?: PreuveBascule,
): Promise<ResultatRevueMapping> {
  try {
    const commun = await resoudrePlanCommun(jeu, coproCode, provider, liaisonParCompte, raccordement, preuveBascule);
    if (!commun.ok) return commun;
    const { plan, ref, comptes } = commun;
    const contexte = construireContexteEstale(comptes);

    // Cibles "coproprietaire parti" : comptes d'attente/regularisation 46x/47x deja dans eStale.
    const partis = comptes
      .filter((c) => estComptePartis(c.nomenclature))
      .map((c) => ({ nomenclature: c.nomenclature, intitule: c.libelle ?? "" }));

    return {
      ok: true,
      plan,
      candidats: {
        fournisseurs: contexte.fournisseurs,
        coproprietaires: contexte.coproprietaires,
        partis,
      },
      ref,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `Revue mapping eStale impossible pour "${coproCode}" : ${message}` };
  }
}
