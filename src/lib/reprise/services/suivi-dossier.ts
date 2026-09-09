// Service de suivi d'un dossier de reprise (ADR-037) : cree, liste, et fait vivre le TABLEAU DE
// SUIVI D'EQUIPE (statut / assignation / note / echeance de chaque etape, etapes ad hoc, equipe,
// cadrage, journal). Passe par le port DossierRepository (memoire en test, Supabase en prod).
//
// Les fonctions HISTORIQUES de l'import (appliquerRecap, enregistrerJeu, corrigerJeuDossier,
// contacts d'annexes...) restent : l'UI ne les appelle plus, mais elles forment une bibliotheque
// appelable du terminal (skill estale-migration). Elles gardent leur contrat (exceptions).
//
// Les fonctions du SUIVI D'EQUIPE (changerStatutEtape, assignerEtape, noterEtape, fixerEcheance,
// ajouterEtapeAdHocAuDossier, supprimerEtapeAdHoc) ne levent JAMAIS pour un cas metier : elles
// renvoient `{ erreur }` (dossier introuvable, code inconnu, valeur invalide). Chacune : lecture ->
// mutation pure -> repo.sauver, et pose majLe/majPar sur l'etape touchee.

import type {
  ComptaResume,
  Dossier,
  EquipeReprise,
  Etape,
  Personne,
  Phase,
  RoleReprise,
  StatutEtape,
} from "@/lib/reprise/domain/dossier";
import type { VerdictRaccordement } from "@/lib/reprise/domain/controle-comptes";
import {
  PHASES,
  ROLES_REPRISE,
  ROLE_LABEL,
  ajouterEtapeAdHoc,
  assignerParRole,
  creerDossier,
  reconcilierEtapes,
} from "@/lib/reprise/domain/dossier";
import type { JeuDeDonnees, LiaisonOwnerCompte } from "@/lib/reprise/domain/patrimoine";
import { trancherLiaison } from "@/lib/reprise/domain/liaison-comptes";
import {
  marquerContact,
  type AnnexeAnalysee,
  type ContactRapproche,
} from "@/lib/reprise/domain/rapprochement-contacts";
import { appliquerCorrections, resumerCorrections, type Correction } from "@/lib/reprise/domain/corrections-patrimoine";
import type { DossierRepository } from "@/lib/reprise/ports/dossier-repository";
import type { FicheRenseignementsRepository } from "@/lib/reprise/ports/fiche-renseignements-repository";
import { calculerRecap, type RecapPatrimoine } from "./orchestrateur-patrimoine";

/**
 * Reconcilie les etapes persistees avec la checklist COURANTE (migration douce, sans perte).
 * Applique a chaque lecture : un dossier a l'ancienne nomenclature (P/V/C) se rehydrate sur la
 * checklist reelle (R1..R11) et, des la premiere mutation, se repersiste migre. Idempotent.
 */
function migrer(d: Dossier): Dossier {
  d.etapes = reconcilierEtapes(d.etapes);
  return d;
}

/** Erreur si le dossier n'existe pas (evite les mutations silencieuses). */
async function exiger(repo: DossierRepository, ref: string): Promise<Dossier> {
  const d = await repo.obtenir(ref);
  if (!d) throw new Error(`Dossier introuvable : ${ref}`);
  return migrer(d);
}

export async function creerDossierSuivi(
  repo: DossierRepository,
  ref: string,
  nomUsuel: string,
  adresse?: string,
  options?: { sortant?: string; dateBascule?: string; equipe?: EquipeReprise },
): Promise<Dossier> {
  if (await repo.obtenir(ref)) throw new Error(`Dossier deja existant : ${ref}`);
  if (options?.dateBascule !== undefined && !dateIsoValide(options.dateBascule)) {
    throw new Error(`Date de bascule invalide : ${options.dateBascule} (attendu AAAA-MM-JJ)`);
  }
  const d = creerDossier(ref, nomUsuel, adresse, options);
  await repo.sauver(d);
  return d;
}

export async function listerDossiers(repo: DossierRepository): Promise<Dossier[]> {
  const dossiers = await repo.lister();
  return dossiers.map(migrer).sort((a, b) => a.ref.localeCompare(b.ref));
}

export async function obtenirDossier(repo: DossierRepository, ref: string): Promise<Dossier | null> {
  const d = await repo.obtenir(ref);
  return d ? migrer(d) : null;
}

/**
 * Met a jour le statut d'une etape (par code, ex. "BA2"). Contrat HISTORIQUE (leve sur dossier ou
 * etape inconnus, pas de journal) conserve pour le terminal ; `ctx` optionnel pose majLe/majPar.
 * Le tableau d'equipe passe par `changerStatutEtape` (motif de blocage + journal + { erreur }).
 */
export async function majEtape(
  repo: DossierRepository,
  ref: string,
  codeEtape: string,
  statut: StatutEtape,
  ctx?: ContexteMaj,
): Promise<Dossier> {
  const d = await exiger(repo, ref);
  const etape = d.etapes.find((e) => e.code === codeEtape);
  if (!etape) throw new Error(`Etape inconnue : ${codeEtape} (dossier ${ref})`);
  etape.statut = statut;
  if (ctx) tamponner(etape, ctx);
  await repo.sauver(d);
  return d;
}

// ---------------------------------------------------------------------------------------------
// SUIVI D'EQUIPE (ADR-037)
// ---------------------------------------------------------------------------------------------

/** Contexte d'une mutation : qui (nom affichable) et quand (ISO), fournis par l'appelant. */
export interface ContexteMaj {
  auteur: string;
  dateIso: string;
}

/** Libelle FEMININ du statut (accorde a « étape »), pour le journal. */
const STATUT_JOURNAL: Record<StatutEtape, string> = {
  a_faire: "à faire",
  en_cours: "en cours",
  bloque: "bloquée",
  fait: "faite",
  ignore: "ignorée",
};

/** Date ISO AAAA-MM-JJ valide (format ET calendrier : pas de 2026-02-30). */
export function dateIsoValide(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function personneValide(p: unknown): p is Personne {
  return (
    typeof p === "object" &&
    p !== null &&
    typeof (p as Personne).id === "string" &&
    (p as Personne).id.trim().length > 0 &&
    typeof (p as Personne).nom === "string" &&
    (p as Personne).nom.trim().length > 0
  );
}

function tamponner(etape: Etape, ctx: ContexteMaj): void {
  etape.majLe = ctx.dateIso;
  etape.majPar = ctx.auteur;
}

function journaliser(d: Dossier, ctx: ContexteMaj, texte: string): void {
  d.journal.push({ date: ctx.dateIso, texte, auteur: ctx.auteur });
}

/** Lecture tolerante : { erreur } plutot qu'une exception quand le dossier n'existe pas. */
async function charger(repo: DossierRepository, ref: string): Promise<Dossier | { erreur: string }> {
  const d = await repo.obtenir(ref);
  if (!d) return { erreur: `Dossier introuvable : ${ref}` };
  return migrer(d);
}

function estErreur(x: unknown): x is { erreur: string } {
  return typeof x === "object" && x !== null && "erreur" in x;
}

/** Charge le dossier ET l'etape ; { erreur } si l'un des deux manque. */
async function chargerEtape(
  repo: DossierRepository,
  ref: string,
  code: string,
): Promise<{ d: Dossier; etape: Etape } | { erreur: string }> {
  const d = await charger(repo, ref);
  if (estErreur(d)) return d;
  const etape = d.etapes.find((e) => e.code === code);
  if (!etape) return { erreur: `Étape inconnue : ${code} (dossier ${ref})` };
  return { d, etape };
}

/**
 * Change le statut d'une etape. `bloque` EXIGE un motif non vide (il va dans `note`, visible sur le
 * tableau d'equipe). Un motif fourni avec un autre statut est aussi pose en note (commentaire).
 * Journal automatique : « BA2 → faite », « CA4 → bloquée : <motif> ».
 */
export async function changerStatutEtape(
  repo: DossierRepository,
  ref: string,
  code: string,
  statut: StatutEtape,
  ctx: ContexteMaj,
  motif?: string,
): Promise<Dossier | { erreur: string }> {
  if (!(statut in STATUT_JOURNAL)) return { erreur: `Statut inconnu : ${String(statut)}` };
  const motifNet = motif?.trim() ?? "";
  if (statut === "bloque" && motifNet.length === 0) {
    return { erreur: "Un motif est obligatoire pour bloquer une étape." };
  }
  const r = await chargerEtape(repo, ref, code);
  if (estErreur(r)) return r;
  const { d, etape } = r;
  etape.statut = statut;
  if (motifNet.length > 0) etape.note = motifNet;
  tamponner(etape, ctx);
  journaliser(d, ctx, `${code} → ${STATUT_JOURNAL[statut]}${motifNet ? ` : ${motifNet}` : ""}`);
  await repo.sauver(d);
  return d;
}

/** Assigne (ou desassigne avec null) une etape. Journal : « BA2 assignée à <nom> ». */
export async function assignerEtape(
  repo: DossierRepository,
  ref: string,
  code: string,
  personne: Personne | null,
  ctx: ContexteMaj,
): Promise<Dossier | { erreur: string }> {
  if (personne !== null && !personneValide(personne)) {
    return { erreur: "Personne invalide : id et nom sont obligatoires." };
  }
  const r = await chargerEtape(repo, ref, code);
  if (estErreur(r)) return r;
  const { d, etape } = r;
  if (personne) {
    etape.assigneA = { id: personne.id, nom: personne.nom.trim() };
    journaliser(d, ctx, `${code} assignée à ${etape.assigneA.nom}`);
  } else {
    delete etape.assigneA;
    journaliser(d, ctx, `${code} désassignée`);
  }
  tamponner(etape, ctx);
  await repo.sauver(d);
  return d;
}

/** Pose une note libre sur une etape (vide = efface). Pas de journal : la note EST la trace. */
export async function noterEtape(
  repo: DossierRepository,
  ref: string,
  code: string,
  note: string,
  ctx: ContexteMaj,
): Promise<Dossier | { erreur: string }> {
  if (typeof note !== "string") return { erreur: "Note invalide." };
  const r = await chargerEtape(repo, ref, code);
  if (estErreur(r)) return r;
  const { d, etape } = r;
  const nette = note.trim();
  if (nette.length > 0) etape.note = nette;
  else delete etape.note;
  tamponner(etape, ctx);
  await repo.sauver(d);
  return d;
}

/** Fixe (ISO AAAA-MM-JJ) ou efface (null) l'echeance d'une etape. */
export async function fixerEcheance(
  repo: DossierRepository,
  ref: string,
  code: string,
  echeance: string | null,
  ctx: ContexteMaj,
): Promise<Dossier | { erreur: string }> {
  if (echeance !== null && !dateIsoValide(echeance)) {
    return { erreur: `Échéance invalide : ${String(echeance)} (attendu AAAA-MM-JJ)` };
  }
  const r = await chargerEtape(repo, ref, code);
  if (estErreur(r)) return r;
  const { d, etape } = r;
  if (echeance) etape.echeance = echeance;
  else delete etape.echeance;
  tamponner(etape, ctx);
  await repo.sauver(d);
  return d;
}

/**
 * Ajoute une etape AD HOC au dossier (libelle 3..200 caracteres, phase connue, `apresCode` = une
 * etape existante du dossier). Le code X-<n> est genere par le domaine, jamais reutilise.
 */
export async function ajouterEtapeAdHocAuDossier(
  repo: DossierRepository,
  ref: string,
  saisie: { phase: Phase; libelle: string; apresCode?: string; assigneA?: Personne; echeance?: string },
  ctx: ContexteMaj,
): Promise<Dossier | { erreur: string }> {
  const libelle = (saisie.libelle ?? "").trim();
  if (libelle.length < 3 || libelle.length > 200) {
    return { erreur: "Le libellé d'une étape doit faire entre 3 et 200 caractères." };
  }
  if (!(PHASES as readonly string[]).includes(saisie.phase)) {
    return { erreur: `Phase inconnue : ${String(saisie.phase)}` };
  }
  if (saisie.assigneA !== undefined && !personneValide(saisie.assigneA)) {
    return { erreur: "Personne invalide : id et nom sont obligatoires." };
  }
  if (saisie.echeance !== undefined && !dateIsoValide(saisie.echeance)) {
    return { erreur: `Échéance invalide : ${saisie.echeance} (attendu AAAA-MM-JJ)` };
  }
  const d = await charger(repo, ref);
  if (estErreur(d)) return d;
  if (saisie.apresCode !== undefined && !d.etapes.some((e) => e.code === saisie.apresCode)) {
    return { erreur: `Étape inconnue : ${saisie.apresCode} (dossier ${ref})` };
  }

  const avant = new Set(d.etapes.map((e) => e.code));
  d.etapes = ajouterEtapeAdHoc(d.etapes, { ...saisie, libelle });
  const nouvelle = d.etapes.find((e) => !avant.has(e.code));
  if (!nouvelle) return { erreur: "L'étape n'a pas pu être ajoutée." }; // impossible par construction
  tamponner(nouvelle, ctx);
  journaliser(d, ctx, `Étape ajoutée ${nouvelle.code} : « ${libelle} »`);
  await repo.sauver(d);
  return d;
}

/** Supprime une etape AD HOC. Refuse une etape canonique (elle se coche « ignorée », elle ne se supprime pas). */
export async function supprimerEtapeAdHoc(
  repo: DossierRepository,
  ref: string,
  code: string,
  ctx: ContexteMaj,
): Promise<Dossier | { erreur: string }> {
  const r = await chargerEtape(repo, ref, code);
  if (estErreur(r)) return r;
  const { d, etape } = r;
  if (!etape.adHoc) {
    return { erreur: `L'étape ${code} est canonique : elle ne peut pas être supprimée (passe-la en « ignorée »).` };
  }
  d.etapes = d.etapes.filter((e) => e.code !== code);
  journaliser(d, ctx, `Étape supprimée ${code} : « ${etape.libelle} »`);
  await repo.sauver(d);
  return d;
}

/**
 * Pose l'equipe du dossier (REMPLACE l'equipe precedente) et assigne les etapes par role :
 * seulement celles sans assignee explicite, ou toutes si `forcer`. Leve si le dossier n'existe pas
 * ou si une personne est invalide.
 */
export async function definirEquipe(
  repo: DossierRepository,
  ref: string,
  equipe: EquipeReprise,
  ctx: ContexteMaj,
  opts?: { forcer?: boolean },
): Promise<Dossier> {
  const d = await exiger(repo, ref);
  const propre: EquipeReprise = {};
  for (const role of ROLES_REPRISE) {
    const p = equipe[role];
    if (p === undefined) continue;
    if (!personneValide(p)) throw new Error(`Personne invalide pour le rôle ${ROLE_LABEL[role]} : id et nom sont obligatoires.`);
    propre[role] = { id: p.id, nom: p.nom.trim() };
  }
  d.equipe = propre;
  const avant = d.etapes;
  d.etapes = assignerParRole(d.etapes, propre, opts?.forcer === true);
  d.etapes.forEach((e, i) => {
    if (e.assigneA?.id !== avant[i]?.assigneA?.id) tamponner(e, ctx);
  });
  const membres = (Object.keys(propre) as RoleReprise[]).map((r) => `${ROLE_LABEL[r]} : ${propre[r]!.nom}`);
  journaliser(d, ctx, membres.length > 0 ? `Équipe définie — ${membres.join(", ")}` : "Équipe effacée");
  await repo.sauver(d);
  return d;
}

/**
 * Met a jour le cadrage du dossier. Un champ `undefined` n'est pas touche ; une chaine vide EFFACE
 * (sortant, dateBascule, adresse) ; un nomUsuel vide est ignore (jamais de dossier sans nom).
 * Leve si le dossier n'existe pas ou si la date de bascule est invalide.
 */
export async function definirCadrage(
  repo: DossierRepository,
  ref: string,
  cadrage: { sortant?: string; dateBascule?: string; adresse?: string; nomUsuel?: string },
  ctx: ContexteMaj,
): Promise<Dossier> {
  if (cadrage.dateBascule !== undefined && cadrage.dateBascule !== "" && !dateIsoValide(cadrage.dateBascule)) {
    throw new Error(`Date de bascule invalide : ${cadrage.dateBascule} (attendu AAAA-MM-JJ)`);
  }
  const d = await exiger(repo, ref);
  const touches: string[] = [];
  if (cadrage.sortant !== undefined) {
    const v = cadrage.sortant.trim();
    if (v) d.sortant = v;
    else delete d.sortant;
    touches.push("syndic sortant");
  }
  if (cadrage.dateBascule !== undefined) {
    if (cadrage.dateBascule) d.dateBascule = cadrage.dateBascule;
    else delete d.dateBascule;
    touches.push("date de bascule");
  }
  if (cadrage.adresse !== undefined) {
    const v = cadrage.adresse.trim();
    if (v) d.adresse = v;
    else delete d.adresse;
    touches.push("adresse");
  }
  if (cadrage.nomUsuel !== undefined && cadrage.nomUsuel.trim()) {
    d.nomUsuel = cadrage.nomUsuel.trim();
    touches.push("nom usuel");
  }
  if (touches.length > 0) journaliser(d, ctx, `Cadrage mis à jour : ${touches.join(", ")}`);
  await repo.sauver(d);
  return d;
}

/**
 * Archive / desarchive un dossier (reversible). Le flag vit dans le JSONB `compteurs` (ADDITIF,
 * zero SQL) : on le pose (true) ou on l'efface (undefined au desarchivage, pour garder le JSONB
 * propre). Journalise le geste (date fournie par l'appelant, domaine sans horloge).
 */
export async function archiverDossier(
  repo: DossierRepository,
  ref: string,
  archive: boolean,
  nowISO: string,
): Promise<Dossier> {
  const d = await exiger(repo, ref);
  d.compteurs = { ...d.compteurs, archive: archive ? true : undefined };
  d.journal.push({ date: nowISO, texte: archive ? "Dossier archive." : "Dossier desarchive." });
  await repo.sauver(d);
  return d;
}

/**
 * Supprime DEFINITIVEMENT un dossier de reprise ET les fiches de renseignements liees (hard delete,
 * irreversible). Renvoie le nombre de fiches parties (pour l'annoncer). Le jeu de donnees, les
 * compteurs, le journal et les etapes disparaissent avec le dossier. AUCUNE mutation eStale (une
 * copro deja injectee dans eStale n'est PAS touchee : on ne supprime que le suivi de reprise).
 */
export async function supprimerDossierEtFiches(
  dossierRepo: DossierRepository,
  fichesRepo: FicheRenseignementsRepository,
  ref: string,
): Promise<{ fichesSupprimees: number }> {
  const fichesSupprimees = await fichesRepo.supprimerParDossier(ref);
  await dossierRepo.supprimer(ref);
  return { fichesSupprimees };
}

export async function ajouterAnomalie(repo: DossierRepository, ref: string, texte: string): Promise<Dossier> {
  const d = await exiger(repo, ref);
  if (!d.anomalies.includes(texte)) d.anomalies.push(texte);
  await repo.sauver(d);
  return d;
}

/**
 * Ajoute une entree libre au journal. ATTENTION ordre des parametres (refonte ADR-037) :
 * (texte, dateIso, auteur?) — l'ancienne signature etait (date, texte).
 */
export async function ajouterJournal(
  repo: DossierRepository,
  ref: string,
  texte: string,
  dateIso: string,
  auteur?: string,
): Promise<Dossier> {
  const d = await exiger(repo, ref);
  d.journal.push({ date: dateIso, texte, ...(auteur ? { auteur } : {}) });
  await repo.sauver(d);
  return d;
}

/**
 * Reporte le resultat d'une analyse (recap) dans le dossier : compteurs + anomalies
 * actionnables (notes d'extraction + avertissements des auto-checks). Ne touche PAS aux
 * statuts d'etapes (rester conforme au perimetre : une case cochee = fait et verifie).
 */
export async function appliquerRecap(
  repo: DossierRepository,
  ref: string,
  recap: RecapPatrimoine,
): Promise<Dossier> {
  const d = await exiger(repo, ref);
  d.compteurs = {
    ...d.compteurs,
    nbLots: recap.lots.total,
    nbCles: recap.cles.length,
    nbCoproprietaires: recap.owners.total,
    nbAttributions: recap.attributions.total,
    nbAnomalies: recap.checks.erreurs.length + recap.checks.warnings.length,
  };
  const nouvelles = [...recap.notes, ...recap.checks.warnings.map((w) => w.message)];
  for (const a of nouvelles) if (!d.anomalies.includes(a)) d.anomalies.push(a);
  await repo.sauver(d);
  return d;
}

/**
 * Persiste le jeu de donnees extrait dans le dossier, pour rehydrater la fiche a
 * l'ouverture SANS re-analyser. Tolerant a la degradation cote adapter : si la colonne
 * n'existe pas encore (ALTER pas lance), l'ecriture est un no-op silencieux et l'analyse
 * marche quand meme (les compteurs restent, seul le detail du jeu n'est pas conserve).
 */
export async function enregistrerJeu(
  repo: DossierRepository,
  ref: string,
  jeu: JeuDeDonnees,
): Promise<void> {
  const d = await exiger(repo, ref);
  d.jeu = jeu;
  await repo.sauver(d);
}

/**
 * Persiste le resume de la reprise comptable dans les compteurs du dossier (loge dans le JSONB
 * `compteurs` deja persiste : zero migration). Sert a rehydrater le bloc compta du recap GO/STOP.
 *
 * `compta` = exercice CLOTURE (toujours) ; `comptaEnCours` et `raccordement` = exercice en cours +
 * controle croise (present quand un SECOND grand livre a ete fourni). ADDITIF : passer undefined pour
 * ces deux derniers EFFACE l'ancienne valeur (un dossier repasse a un seul GL ne garde pas un croise
 * perime). Retro-compat : un appel a un seul argument (mono-GL) efface proprement en cours/croise.
 */
export async function enregistrerComptaResume(
  repo: DossierRepository,
  ref: string,
  compta: ComptaResume,
  comptaEnCours?: ComptaResume,
  raccordement?: VerdictRaccordement,
): Promise<void> {
  const d = await exiger(repo, ref);
  d.compteurs = { ...d.compteurs, compta, comptaEnCours, raccordement };
  await repo.sauver(d);
}

/**
 * Persiste (ou EFFACE) l'erreur d'extraction du grand livre dans les compteurs du dossier
 * (JSONB `compteurs`, ADDITIF, zero migration). Passer `undefined` efface l'erreur (extraction
 * reussie a la relance) pour ne pas laisser trainer une alerte perimee. PII-free.
 */
export async function enregistrerComptaErreur(
  repo: DossierRepository,
  ref: string,
  erreur: string | undefined,
): Promise<void> {
  const d = await exiger(repo, ref);
  d.compteurs = { ...d.compteurs, comptaErreur: erreur };
  await repo.sauver(d);
}

/**
 * Reporte le resultat COMPLET d'une analyse dans le dossier en UNE lecture + UNE ecriture
 * (audit API 2026-07-16, P1-7). La route /api/reprise/analyser enchainait appliquerRecap,
 * enregistrerComptaResume, enregistrerComptaErreur, enregistrerJeu et ajouterJournal : chacun
 * refaisait obtenir() (SELECT de toute la ligne) puis sauver() (upsert de toute la ligne, JSONB
 * `jeu` de plusieurs Mo inclus) -> jusqu'a 10 allers-retours Supabase lourds par analyse, avec
 * risque de lost-update entre les cycles. Ici : 1 obtenir() + toutes les mutations en memoire +
 * 1 sauver(). Semantique STRICTEMENT identique a la sequence d'origine :
 *   - recap -> compteurs + anomalies (sans doublon), comme appliquerRecap ;
 *   - compta (si fournie) -> compteurs.compta/comptaEnCours/raccordement (undefined EFFACE,
 *     comme enregistrerComptaResume) ;
 *   - comptaErreur appliquee UNIQUEMENT si grandLivreJoint (comme le garde de la route) ;
 *   - jeu remplace ; journal appendu.
 * Les helpers unitaires ci-dessus restent inchanges (utilises ailleurs : actions, corrections...).
 */
export async function appliquerResultatAnalyse(
  repo: DossierRepository,
  ref: string,
  resultat: {
    recap: RecapPatrimoine;
    jeu: JeuDeDonnees;
    compta?: ComptaResume;
    comptaEnCours?: ComptaResume;
    raccordement?: VerdictRaccordement;
    /** Un grand livre etait-il joint a l'analyse ? (gouverne l'ecriture/effacement de comptaErreur) */
    grandLivreJoint: boolean;
    comptaErreur?: string;
    /** Documents annexes analyses (remplace ceux persistes ; undefined efface -> re-analyse propre). */
    annexes?: AnnexeAnalysee[];
    /** Contacts rapproches aux owners (remplace ceux persistes ; undefined efface). */
    contactsAnnexes?: ContactRapproche[];
    /** Date de l'entree de journal (fournie par l'appelant, service sans horloge). */
    nowISO: string;
    journalTexte: string;
  },
): Promise<void> {
  const d = await exiger(repo, ref);

  // 1. Recap -> compteurs + anomalies (meme logique que appliquerRecap).
  reporterCompteurs(d, resultat.recap);
  const nouvelles = [...resultat.recap.notes, ...resultat.recap.checks.warnings.map((w) => w.message)];
  for (const a of nouvelles) if (!d.anomalies.includes(a)) d.anomalies.push(a);

  // 1bis. Documents annexes : remplacent ceux persistes (undefined efface -> une re-analyse sans
  // annexe ne laisse pas de contacts perimes ; meme semantique que compta/en cours). PII : reste
  // dans le JSONB de la ligne, jamais logue.
  d.compteurs = { ...d.compteurs, annexes: resultat.annexes, contactsAnnexes: resultat.contactsAnnexes };

  // 2. Resume compta (meme logique que enregistrerComptaResume : undefined efface en cours/croise).
  if (resultat.compta) {
    d.compteurs = {
      ...d.compteurs,
      compta: resultat.compta,
      comptaEnCours: resultat.comptaEnCours,
      raccordement: resultat.raccordement,
    };
  }

  // 3. Erreur d'extraction du grand livre : posee OU effacee seulement si un GL etait joint
  // (meme garde que la route ; sans GL joint on ne touche a rien).
  if (resultat.grandLivreJoint) {
    d.compteurs = { ...d.compteurs, comptaErreur: resultat.comptaErreur };
  }

  // 4. Jeu complet (rehydratation de la fiche sans re-analyse) + 5. journal.
  d.jeu = resultat.jeu;
  d.journal.push({ date: resultat.nowISO, texte: resultat.journalTexte });

  await repo.sauver(d);
}

/** Recalcule les compteurs patrimoine du dossier depuis un recap (miroir de appliquerRecap). */
function reporterCompteurs(d: Dossier, recap: RecapPatrimoine): void {
  d.compteurs = {
    ...d.compteurs,
    nbLots: recap.lots.total,
    nbCles: recap.cles.length,
    nbCoproprietaires: recap.owners.total,
    nbAttributions: recap.attributions.total,
    nbAnomalies: recap.checks.erreurs.length + recap.checks.warnings.length,
  };
}

/** Resultat d'une correction manuelle : jeu + recap recalcules (a renvoyer a l'UI) + notes. */
export interface ResultatCorrectionDossier {
  jeu: JeuDeDonnees;
  recap: RecapPatrimoine;
  /** Notes informatives PII-free (cascades, fusions, reattachements). */
  notes: string[];
}

/**
 * Applique des corrections MANUELLES au jeu persiste d'un dossier (editeur de corrections, ADR-030).
 * Relit le dossier (cloisonnement en amont via l'action), applique les corrections au domaine PUR
 * (transactionnel : tout ou rien), RE-PASSE verifierTout + detecterDoublons + calculerRecap (via
 * calculerRecap), repersiste le jeu + les compteurs, et JOURNALISE un resume PII-free (detail des
 * notes dans le journal du dossier, en base). Le recap/pretAProduire se met a jour tout seul.
 *
 * AUCUNE mutation eStale : les corrections ne touchent QUE le jeu local. Leve si le jeu est absent
 * (analyse jamais lancee) ou si une correction reference une entite inconnue (message clair).
 */
export async function corrigerJeuDossier(
  repo: DossierRepository,
  ref: string,
  corrections: Correction[],
  nowISO: string,
): Promise<ResultatCorrectionDossier> {
  const d = await exiger(repo, ref);
  if (!d.jeu) throw new Error("Aucun jeu de donnees a corriger : lance d'abord l'analyse.");
  if (corrections.length === 0) throw new Error("Aucune correction fournie.");

  const res = appliquerCorrections(d.jeu, corrections);
  if (!res.ok) throw new Error(res.erreurs.join(" | "));

  d.jeu = res.jeu;
  const recap = calculerRecap(res.jeu);
  reporterCompteurs(d, recap);

  const resume = resumerCorrections(corrections);
  const detail = res.notes.length > 0 ? ` ${res.notes.join(" ")}` : "";
  d.journal.push({
    date: nowISO,
    texte: `Correction manuelle : ${corrections.length} modification(s) (${resume}).${detail}`,
  });
  await repo.sauver(d);

  // Le resume compta (balance / nb comptes / erreur GL / en cours / controle croise) ne vit pas dans
  // le jeu : on le rehydrate depuis les compteurs persistes pour que l'UI n'ait pas a re-analyser les
  // grands livres.
  if (d.compteurs.compta) recap.compta = d.compteurs.compta;
  if (d.compteurs.comptaEnCours) recap.comptaEnCours = d.compteurs.comptaEnCours;
  if (d.compteurs.raccordement) recap.raccordement = d.compteurs.raccordement;
  if (d.compteurs.comptaErreur) recap.comptaErreur = d.compteurs.comptaErreur;

  return { jeu: res.jeu, recap, notes: res.notes };
}

/**
 * Tranche une liaison owner <-> compte 450 (revue humaine) et repersiste le jeu. Le compte choisi
 * (ou null pour "sans compte") vient d'un candidat propose. Pur cote domaine (trancherLiaison) ;
 * ce service ne fait que charger / muter / sauver. No-op propre si aucune liaison sur le dossier.
 */
export async function trancherLiaisonDossier(
  repo: DossierRepository,
  ref: string,
  ownerId: string,
  compteSource: string | null,
): Promise<LiaisonOwnerCompte[]> {
  const d = await exiger(repo, ref);
  if (!d.jeu?.liaisons450) return [];
  const liaisons = trancherLiaison(d.jeu.liaisons450, ownerId, compteSource);
  d.jeu = { ...d.jeu, liaisons450: liaisons };
  await repo.sauver(d);
  return liaisons;
}

/** Resultat d'une decision sur un contact annexe : jeu (eventuellement enrichi) + contacts a jour. */
export interface ResultatContactAnnexe {
  jeu?: JeuDeDonnees;
  contacts: ContactRapproche[];
}

/**
 * VALIDE un contact d'annexe : ecrit son email/telephone sur l'owner du JEU choisi (`ownerId` =
 * l'owner apparie OU un owner corrige par l'humain). REUTILISE le mecanisme de corrections existant
 * (appliquerCorrections owner.modifier -> transactionnel + journalise + auto-checks re-passes) : on
 * ne duplique pas la logique d'ecriture du jeu. Le contact est ensuite marque "valide". AUCUNE
 * mutation eStale (le jeu local seulement ; la remontee vers eStale passe par la validation de
 * fiche existante). PII : ni email ni nom dans le journal (seul l'ownerId interne).
 */
export async function validerContactAnnexeDossier(
  repo: DossierRepository,
  ref: string,
  contactId: string,
  ownerId: string,
  nowISO: string,
): Promise<ResultatContactAnnexe> {
  const d = await exiger(repo, ref);
  const contacts = d.compteurs.contactsAnnexes ?? [];
  const contact = contacts.find((c) => c.id === contactId);
  if (!contact) throw new Error("Contact annexe introuvable (re-analyse peut-etre necessaire).");
  if (!d.jeu) throw new Error("Aucun jeu de donnees a enrichir : lance d'abord l'analyse.");
  if (!contact.email && !contact.telephone) {
    throw new Error("Ce contact ne porte ni email ni telephone : rien a reporter sur le coproprietaire.");
  }
  if (!d.jeu.owners.some((o) => o.id === ownerId)) {
    throw new Error(`Coproprietaire ${ownerId} introuvable dans le jeu.`);
  }

  const champs = {
    ...(contact.email ? { email: contact.email } : {}),
    ...(contact.telephone ? { telPortable: contact.telephone } : {}),
  };
  const res = appliquerCorrections(d.jeu, [{ type: "owner.modifier", id: ownerId, champs }]);
  if (!res.ok) throw new Error(res.erreurs.join(" | "));

  d.jeu = res.jeu;
  const recap = calculerRecap(res.jeu);
  reporterCompteurs(d, recap);
  d.compteurs = { ...d.compteurs, contactsAnnexes: marquerContact(contacts, contactId, "valide", ownerId) };
  d.journal.push({
    date: nowISO,
    texte: `Contact d'annexe reporte sur un coproprietaire (email/telephone). Owner ${ownerId}.`,
  });
  await repo.sauver(d);
  return { jeu: d.jeu, contacts: d.compteurs.contactsAnnexes ?? [] };
}

/**
 * IGNORE un contact d'annexe (proposition ecartee) : le marque "ignore", sans toucher au jeu.
 * No-op propre si le contact n'existe pas / plus. Journalise le geste (PII-free).
 */
export async function ignorerContactAnnexeDossier(
  repo: DossierRepository,
  ref: string,
  contactId: string,
  nowISO: string,
): Promise<ContactRapproche[]> {
  const d = await exiger(repo, ref);
  const contacts = d.compteurs.contactsAnnexes ?? [];
  if (!contacts.some((c) => c.id === contactId)) return contacts;
  const maj = marquerContact(contacts, contactId, "ignore");
  d.compteurs = { ...d.compteurs, contactsAnnexes: maj };
  d.journal.push({ date: nowISO, texte: `Contact d'annexe ignore (${contactId}).` });
  await repo.sauver(d);
  return maj;
}
