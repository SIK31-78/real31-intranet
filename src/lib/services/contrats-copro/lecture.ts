// Services de LECTURE du module « Contrats & contrôles » (REA-333, étape 1 du plan) : l'onglet
// Contrats d'une fiche copro, la liste consolidée des suivis, le bloc de l'accueil. Aucune
// écriture ici. Passe par le routeur (ADR-001), jamais un adapter en direct.
//
// Deux principes repris de get-fiche-copro :
//   - COMPOSITION EN PARALLÈLE : tout ce qui ne dépend que du code copro part dans un seul
//     Promise.all, puis une seconde vague pour ce qui dépend des cycles (les offres).
//   - DÉGRADATION : une brique secondaire illisible (journal, prestataires, documents, offres,
//     devis) ne fait pas tomber la fiche : console.warn et valeur vide. Le contrat courant, les
//     cycles et les règles sont le cœur : s'ils tombent, la page tombe, c'est voulu.
//
// La date du jour est TOUJOURS injectée (aujourdhuiISO) : rien ici ne lit l'horloge.

import {
  getAgenceRepository,
  getClesEntrepriseRepository,
  getContratsCoproRepository,
  getDepotDocumentProvider,
} from "@/lib/adapters/router";
import {
  SUJETS,
  concerneSujet,
  estCycleADemarrer,
  joursSansAvancement,
  niveauCycle,
  pireNiveau,
  progression,
  type Ascenseur,
  type ContratCourant,
  type Cycle,
  type DevisCtq,
  type DocumentContrat,
  type NiveauQualifie,
  type OffreAssurance,
  type OffreGaz,
  type RegleRelance,
  type SujetSuivi,
} from "@/lib/domain/contrats-copro";
import { normaliserNomEntreprise } from "@/lib/domain/cles/normaliser";
import type { Copropriete } from "@/lib/domain/copropriete";
import { mailModuleActif } from "@/lib/domain/mail-gate";
import { peutEcrireSurCopro } from "@/lib/services/coproprietes/copro-appartient";
import { listerCoprosParRequete } from "@/lib/services/coproprietes/lister-copros-cache";
import { coproEnLecture, coprosEnLecture } from "@/lib/services/coproprietes/perimetre-lecture";
import type { CompteursSuivis, CycleVue, EcheancesAccueil, LigneSuivi, SuiviCopro } from "./types";

// --- Courtiers partenaires ----------------------------------------------------------------

/**
 * Liste de repli du plan (§9.4) : les quatre courtiers qui suivent eux-mêmes le renouvellement.
 * Sert si le référentiel d'entreprises est illisible ou n'a pas encore le drapeau.
 */
export const COURTIERS_PARTENAIRES_REPLI: readonly string[] = ["Areas", "Assurances Dissoubray", "Galian-Smabtp", "Paris Tronchet"];

/**
 * Les noms des courtiers partenaires du cabinet : le référentiel d'entreprises (drapeau
 * `courtierPartenaire`) UNION la liste de repli, dédoublonnés par nom normalisé. Dégrade en
 * liste de repli si le référentiel est illisible.
 */
export async function courtiersPartenaires(): Promise<string[]> {
  let duReferentiel: string[] = [];
  try {
    const entreprises = await getClesEntrepriseRepository().lister();
    duReferentiel = entreprises
      // Champ ajouté par le SQL intranet_contrats_controles, type `Entreprise` étendu dans une
      // autre vague : on le lit avec un cast local plutôt que de toucher au domaine des clés.
      .filter((e) => (e as { courtierPartenaire?: boolean }).courtierPartenaire === true)
      .map((e) => e.nom.trim())
      .filter(Boolean);
  } catch (err) {
    console.warn("[contrats-copro] référentiel d'entreprises illisible, liste de repli des courtiers :", (err as Error).message);
  }
  const vus = new Set<string>();
  const out: string[] = [];
  for (const nom of [...duReferentiel, ...COURTIERS_PARTENAIRES_REPLI]) {
    const cle = normaliserNomEntreprise(nom);
    if (!cle || vus.has(cle)) continue;
    vus.add(cle);
    out.push(nom);
  }
  return out;
}

/**
 * Le courtier du contrat courant (chaîne libre dans la source : « AREAS », « Areas  »,
 * « assurances dissoubray »…) est-il un partenaire ? Comparaison par NOM NORMALISÉ des deux
 * côtés, jamais par égalité stricte.
 */
export function estChezCourtierPartenaire(courtier: string | null | undefined, partenaires: readonly string[]): boolean {
  if (!courtier) return false;
  const cle = normaliserNomEntreprise(courtier);
  if (!cle) return false;
  return partenaires.some((p) => normaliserNomEntreprise(p) === cle);
}

/**
 * Le domaine (`concerneSujet`, `calculerACompleter`) compare encore le courtier aux partenaires
 * par égalité stricte. Plutôt que de le modifier (hors de cette vague), on lui passe la liste
 * des partenaires COMPLÉTÉE de la graphie exacte du courtier de la copro quand elle correspond
 * à un partenaire une fois normalisée. Le domaine retrouve alors l'égalité stricte.
 */
export function partenairesPourDomaine(courtier: string | null | undefined, partenaires: readonly string[]): readonly string[] {
  if (courtier && estChezCourtierPartenaire(courtier, partenaires) && !partenaires.includes(courtier)) {
    return [...partenaires, courtier];
  }
  return partenaires;
}

// --- Cycles -------------------------------------------------------------------------------

/** Un cycle tel que l'écran le montre : niveau, progression, repli d'amorçage, jours figés. */
export function cycleVue(c: Cycle, regle: RegleRelance, aujourdhuiISO: string, aActivite: boolean): CycleVue {
  return {
    cycle: c,
    niveau: niveauCycle(c, regle, aujourdhuiISO),
    progression: progression(c.sujet, c.etapes),
    aDemarrer: estCycleADemarrer(c, aActivite),
    joursSansAvancement: joursSansAvancement(c, regle, aujourdhuiISO),
  };
}

/** En cours d'abord, puis du plus récent au plus ancien (clos et archivés confondus). */
export function trierCycles<T extends { cycle: Cycle }>(vues: readonly T[]): T[] {
  return [...vues].sort((a, b) => {
    const ea = a.cycle.statut === "en_cours" ? 0 : 1;
    const eb = b.cycle.statut === "en_cours" ? 0 : 1;
    if (ea !== eb) return ea - eb;
    return b.cycle.creeLeISO.localeCompare(a.cycle.creeLeISO);
  });
}

/** Un contrat courant vide : la copro existe au référentiel mais n'a rien dans la source. */
export function contratCourantVide(coproCode: string): ContratCourant {
  return {
    coproCode,
    assurance: { compagnie: null, numeroContrat: null, courtier: null, souscriptionISO: null, echeanceISO: null, prime: null },
    gaz: { fournisseur: null, typePrix: null, montant: null, echeanceISO: null },
    vmc: { societe: null, reference: null, dernierCtqISO: null },
    compteurs: { ascenseurs: null, chaudieres: null, vmcGaz: null },
    energieChauffage: null,
    immatriculation: { numero: null, nonApplicable: null },
    devisRetenu: { ctq_ascenseur: null, ctq_vmc: null },
  };
}

/** Lecture secondaire : la valeur, ou `vide` avec un console.warn si elle échoue. */
async function degrade<T>(quoi: string, coproCode: string, lecture: Promise<T>, vide: T): Promise<T> {
  try {
    return await lecture;
  } catch (err) {
    console.warn(`[contrats-copro] ${quoi} de ${coproCode} illisible(s) :`, (err as Error).message);
    return vide;
  }
}

/**
 * Un cycle a « de l'activité » s'il porte au moins une offre, un devis de son sujet ou un
 * document rattaché (à lui, à une de ses offres, ou à un devis de son sujet). Un cycle
 * d'amorçage avec de l'activité ne se replie pas derrière « Démarrer le suivi ».
 */
function detecteurActivite(p: {
  offresAssurance: readonly OffreAssurance[];
  offresGaz: readonly OffreGaz[];
  devis: readonly DevisCtq[];
  documents: readonly DocumentContrat[];
}): (c: Cycle) => boolean {
  const cyclesAvecOffre = new Set<string>([...p.offresAssurance.map((o) => o.cycleId), ...p.offresGaz.map((o) => o.cycleId)]);
  const cycleDeOffre = new Map<string, string>([...p.offresAssurance.map((o) => [o.id, o.cycleId] as const), ...p.offresGaz.map((o) => [o.id, o.cycleId] as const)]);
  const sujetDeDevis = new Map(p.devis.map((d) => [d.id, d.sujet] as const));
  const sujetsAvecDevis = new Set(p.devis.map((d) => d.sujet));
  const cyclesAvecDocument = new Set<string>();
  const sujetsAvecDocumentDevis = new Set<SujetSuivi>();
  for (const d of p.documents) {
    const r = d.rattachement;
    if (r.type === "cycle_assurance") cyclesAvecDocument.add(r.cycleId);
    else if (r.type === "offre_assurance" || r.type === "offre_gaz") {
      const cycleId = cycleDeOffre.get(r.offreId);
      if (cycleId) cyclesAvecDocument.add(cycleId);
    } else if (r.type === "devis_ctq") {
      const sujet = sujetDeDevis.get(r.devisId);
      if (sujet) sujetsAvecDocumentDevis.add(sujet);
    }
  }
  return (c) =>
    cyclesAvecOffre.has(c.id) ||
    cyclesAvecDocument.has(c.id) ||
    ((c.sujet === "ctq_ascenseur" || c.sujet === "ctq_vmc") && (sujetsAvecDevis.has(c.sujet) || sujetsAvecDocumentDevis.has(c.sujet)));
}

/** Pire niveau des cycles en cours ; « à compléter » si rien n'est qualifiable mais qu'il en reste un sans échéance. */
function niveauGlobalDe(vuesEnCours: readonly CycleVue[]): NiveauQualifie | null {
  const niveaux = vuesEnCours.map((v) => v.niveau);
  const pire = pireNiveau(niveaux);
  if (pire) return pire;
  return niveaux.includes("a_completer") ? "a_completer" : null;
}

// --- L'onglet Contrats d'une copro ----------------------------------------------------------

/**
 * Tout ce que l'onglet « Contrats » affiche pour une copro, en une lecture. null si la copro
 * est inconnue du référentiel. `auteurId` ne sert qu'à répondre « peut-il écrire ? » (ADR-041),
 * la lecture est celle du cabinet.
 */
export async function suiviDeCopro(coproCode: string, auteurId: string, aujourdhuiISO: string): Promise<SuiviCopro | null> {
  const copro = await coproEnLecture(coproCode);
  if (!copro) return null;
  const code = copro.code;
  const repo = getContratsCoproRepository();

  const [contratLu, cycles, ascenseurs, devis, documents, prestataires, journal, regles, partenaires, peutEcrire] = await Promise.all([
    repo.getContratCourant(code),
    repo.listerCycles({ coproCodes: [code] }),
    repo.listerAscenseurs([code]),
    degrade("devis", code, repo.listerDevisCtq([code]), [] as DevisCtq[]),
    degrade("documents", code, repo.listerDocuments({ type: "toute_copro", coproCode: code }), [] as DocumentContrat[]),
    degrade("prestataires", code, repo.listerPrestataires([code]), []),
    degrade("journal", code, repo.listerJournal(code, 30), []),
    repo.listerReglesRelance(),
    courtiersPartenaires(),
    degrade("droit d'écriture", code, peutEcrireSurCopro(code, auteurId), false),
  ]);
  const contrat = contratLu ?? contratCourantVide(code);

  // Seconde vague : les offres dépendent des cycles.
  const idsAssurance = cycles.filter((c) => c.sujet === "assurance").map((c) => c.id);
  const idsGaz = cycles.filter((c) => c.sujet === "gaz").map((c) => c.id);
  const [offresAssurance, offresGaz] = await Promise.all([
    idsAssurance.length ? degrade("offres d'assurance", code, repo.listerOffresAssurance(idsAssurance), [] as OffreAssurance[]) : Promise.resolve([] as OffreAssurance[]),
    idsGaz.length ? degrade("offres gaz", code, repo.listerOffresGaz(idsGaz), [] as OffreGaz[]) : Promise.resolve([] as OffreGaz[]),
  ]);

  const aActivite = detecteurActivite({ offresAssurance, offresGaz, devis, documents });
  const vues = trierCycles(cycles.map((c) => cycleVue(c, regles[c.sujet], aujourdhuiISO, aActivite(c))));
  const vuesDe = (sujet: SujetSuivi) => vues.filter((v) => v.cycle.sujet === sujet);
  const documentsDe = (sujet: SujetSuivi) => documents.filter((d) => d.sujet === sujet);
  const devisDe = (sujet: "ctq_ascenseur" | "ctq_vmc") => devis.filter((d) => d.sujet === sujet);

  const partenairesDomaine = partenairesPourDomaine(contrat.assurance.courtier, partenaires);
  const equipement = { contrat, nbAscenseurs: ascenseurs.length, partenaires: partenairesDomaine };
  const concerne = (sujet: SujetSuivi) => concerneSujet(sujet, equipement);

  return {
    coproCode: code,
    coproNom: copro.nom,
    contrat,
    regles,
    assurance: {
      concerne: concerne("assurance"),
      courtierPartenaire: estChezCourtierPartenaire(contrat.assurance.courtier, partenaires),
      cycles: vuesDe("assurance"),
      offres: offresAssurance,
      documents: documentsDe("assurance"),
    },
    gaz: {
      concerne: concerne("gaz"),
      cycles: vuesDe("gaz"),
      offres: offresGaz,
      documents: documentsDe("gaz"),
    },
    ctqAscenseur: {
      concerne: concerne("ctq_ascenseur"),
      appareils: ascenseurs.map((ascenseur: Ascenseur) => ({
        ascenseur,
        cycles: vuesDe("ctq_ascenseur").filter((v) => v.cycle.ascenseurId === ascenseur.id),
      })),
      devis: devisDe("ctq_ascenseur"),
      devisRetenuId: contrat.devisRetenu.ctq_ascenseur,
      documents: documentsDe("ctq_ascenseur"),
    },
    ctqVmc: {
      concerne: concerne("ctq_vmc"),
      cycles: vuesDe("ctq_vmc"),
      devis: devisDe("ctq_vmc"),
      devisRetenuId: contrat.devisRetenu.ctq_vmc,
      documents: documentsDe("ctq_vmc"),
    },
    prestataires,
    journal,
    peutEcrire,
    depotActif: getDepotDocumentProvider().actif,
    mailActif: mailModuleActif(),
    // Tous les cycles en cours comptent, y compris un cycle d'ascenseur orphelin d'appareil.
    niveauGlobal: niveauGlobalDe(vues.filter((v) => v.cycle.statut === "en_cours")),
  };
}

// --- La liste consolidée --------------------------------------------------------------------

function gestionnaireDe(copro: Copropriete): string | undefined {
  return copro.equipe.find((m) => m.role === "gestionnaire")?.nomComplet;
}

/** La table des agences { id -> code }, lue UNE fois ; vide si elle est illisible. */
async function agencesParId(): Promise<Map<string, string>> {
  try {
    return new Map((await getAgenceRepository().listerAgences()).map((a) => [a.id, a.code]));
  } catch (err) {
    console.warn("[contrats-copro] table des agences illisible :", (err as Error).message);
    return new Map();
  }
}

/** Échéance croissante, les nulles en dernier, puis nom de copro, puis code. */
export function trierLignes(lignes: readonly LigneSuivi[]): LigneSuivi[] {
  return [...lignes].sort((a, b) => {
    if (a.echeanceISO !== b.echeanceISO) {
      if (a.echeanceISO === null) return 1;
      if (b.echeanceISO === null) return -1;
      return a.echeanceISO.localeCompare(b.echeanceISO);
    }
    return a.coproNom.localeCompare(b.coproNom, "fr") || a.coproCode.localeCompare(b.coproCode);
  });
}

/**
 * Les cycles EN COURS, qualifiés, du cabinet ou des copros données. Un cycle d'une copro
 * inactive ou inconnue du référentiel est écarté. Lectures groupées (toutes les offres des
 * cycles, tous les devis des copros), jamais une requête par cycle.
 *
 * L'activité d'un cycle ne compte ici que les offres et les devis : les documents se lisent
 * copro par copro (pas de lecture groupée au port), ce serait une requête par copro sur le
 * cabinet entier. La fiche (`suiviDeCopro`) les compte, elle.
 */
export async function listerSuivis(p: { coproCodes?: readonly string[]; aujourdhuiISO: string }): Promise<LigneSuivi[]> {
  const repo = getContratsCoproRepository();
  const filtreCodes = p.coproCodes ? new Set(p.coproCodes) : null;
  if (filtreCodes && filtreCodes.size === 0) return [];

  const [copros, cycles, regles, agences] = await Promise.all([
    coprosEnLecture(),
    repo.listerCycles({ ...(p.coproCodes ? { coproCodes: p.coproCodes } : {}), statuts: ["en_cours"] }),
    repo.listerReglesRelance(),
    agencesParId(),
  ]);

  const coproParCode = new Map<string, Copropriete>();
  for (const c of copros) {
    if (c.statut !== "active") continue;
    if (filtreCodes && !filtreCodes.has(c.code)) continue;
    coproParCode.set(c.code, c);
  }
  const retenus = cycles.filter((c) => c.statut === "en_cours" && coproParCode.has(c.coproCode));
  if (retenus.length === 0) return [];

  const idsAssurance = retenus.filter((c) => c.sujet === "assurance").map((c) => c.id);
  const idsGaz = retenus.filter((c) => c.sujet === "gaz").map((c) => c.id);
  const codesCtq = [...new Set(retenus.filter((c) => c.sujet === "ctq_ascenseur" || c.sujet === "ctq_vmc").map((c) => c.coproCode))];
  const [offresAssurance, offresGaz, devis] = await Promise.all([
    idsAssurance.length ? degrade("offres d'assurance", "la liste", repo.listerOffresAssurance(idsAssurance), [] as OffreAssurance[]) : Promise.resolve([] as OffreAssurance[]),
    idsGaz.length ? degrade("offres gaz", "la liste", repo.listerOffresGaz(idsGaz), [] as OffreGaz[]) : Promise.resolve([] as OffreGaz[]),
    codesCtq.length ? degrade("devis", "la liste", repo.listerDevisCtq(codesCtq), [] as DevisCtq[]) : Promise.resolve([] as DevisCtq[]),
  ]);

  // Les devis sont portés par la copro : un cycle CTQ a de l'activité si SA copro a un devis
  // de son sujet. Les offres sont portées par le cycle.
  const cyclesAvecOffre = new Set<string>([...offresAssurance.map((o) => o.cycleId), ...offresGaz.map((o) => o.cycleId)]);
  const coproSujetAvecDevis = new Set(devis.map((d) => `${d.coproCode}|${d.sujet}`));
  const aActivite = (c: Cycle) => cyclesAvecOffre.has(c.id) || coproSujetAvecDevis.has(`${c.coproCode}|${c.sujet}`);

  const lignes: LigneSuivi[] = retenus.map((c) => {
    const copro = coproParCode.get(c.coproCode)!;
    const vue = cycleVue(c, regles[c.sujet], p.aujourdhuiISO, aActivite(c));
    const agenceCode = copro.agenceId ? agences.get(copro.agenceId) : undefined;
    const gestionnaire = gestionnaireDe(copro);
    return {
      cycleId: c.id,
      sujet: c.sujet,
      coproCode: copro.code,
      coproNom: copro.nom,
      ...(agenceCode ? { agenceCode } : {}),
      ...(gestionnaire ? { gestionnaire } : {}),
      ...(copro.managerId ? { managerId: copro.managerId } : {}),
      echeanceISO: c.echeanceISO,
      niveau: vue.niveau,
      statut: c.statut,
      etapeCourante: vue.progression.etapeCourante?.libelle ?? null,
      franchies: vue.progression.franchies,
      total: vue.progression.total,
      ...(c.sujet === "ctq_ascenseur" ? { ascenseurIdentifiant: c.ascenseurIdentifiant ?? null } : {}),
      aDemarrer: vue.aDemarrer,
      joursSansAvancement: vue.joursSansAvancement,
    };
  });
  return trierLignes(lignes);
}

/** Les compteurs `Stat` de la liste, sur les lignes déjà filtrées par l'écran. Pur. */
export function compteursSuivis(lignes: readonly LigneSuivi[]): CompteursSuivis {
  const parSujet = Object.fromEntries(SUJETS.map((s) => [s, 0])) as Record<SujetSuivi, number>;
  const c: CompteursSuivis = { total: lignes.length, rouge: 0, orange: 0, vert: 0, aCompleter: 0, parSujet };
  for (const l of lignes) {
    parSujet[l.sujet] += 1;
    if (l.niveau === "rouge") c.rouge += 1;
    else if (l.niveau === "orange") c.orange += 1;
    else if (l.niveau === "vert") c.vert += 1;
    else c.aCompleter += 1;
  }
  return c;
}

// --- Le bloc de l'accueil -------------------------------------------------------------------

const ECHEANCES_VIDES: EcheancesAccueil = { rouges: [], oranges: [], aCompleter: 0 };

/**
 * Les échéances qui demandent un geste sur les copros de la vue courante (portefeuille,
 * agence, cabinet : `listerCoprosParRequete` la suit). Les cycles d'amorçage encore repliés
 * (« à démarrer ») ne font pas de rouge ni d'orange : rien n'y a jamais été fait, le signaler
 * en rouge noierait les vrais dossiers figés. Ne lève JAMAIS : l'accueil ne doit pas tomber.
 */
export async function echeancesPourAccueil(managerId: string, aujourdhuiISO: string): Promise<EcheancesAccueil> {
  try {
    const copros = await listerCoprosParRequete(managerId);
    const coproCodes = copros.map((c) => c.code);
    if (coproCodes.length === 0) return ECHEANCES_VIDES;
    const lignes = await listerSuivis({ coproCodes, aujourdhuiISO });
    const actives = lignes.filter((l) => !l.aDemarrer);
    return {
      rouges: actives.filter((l) => l.niveau === "rouge"),
      oranges: actives.filter((l) => l.niveau === "orange"),
      aCompleter: lignes.filter((l) => l.niveau === "a_completer").length,
    };
  } catch (err) {
    console.warn("[contrats-copro] échéances de l'accueil illisibles :", (err as Error).message);
    return ECHEANCES_VIDES;
  }
}
