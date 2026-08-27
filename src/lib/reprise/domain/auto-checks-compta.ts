// LA BATTERIE DES 11 AUTO-CHECKS COMPTABLES - domaine PUR, aucune I/O.
//
// Transcription en code du savoir S0303 (reprise reelle menee jusqu'a la cloture les
// 23-24/08/2026). Regle d'execution : TOUS les controles s'executent sur le fichier
// entries.xlsx RELU DEPUIS LE DISQUE (R10 : on ne croit pas la structure en memoire,
// on croit la relecture) - c'est le service produire-compta qui relit puis appelle ici.
// UN SEUL ECHEC = PAS DE LIVRAISON.
//
// | #  | Controle                                               | Attendu                    |
// |----|--------------------------------------------------------|----------------------------|
// | 1  | Lignes non reconnues a l'extraction                    | 0, sur chaque source       |
// | 2  | Equilibre global du grand livre, reports inclus        | 0,00 (tol. 0,005)          |
// | 3  | Raccord GL N-1 / GL N (filet n.2)                      | 0 ecart, 0 orphelin        |
// | 4  | Paires a-nouveau / "Cloture N-1" en classe 6           | net 0,00 sur CHAQUE compte |
// | 5  | Format (date, journal, compte, cle, type, montant...)  | 0 erreur                   |
// | 6  | BALANCE PAR COMPTE CIBLE vs sortant (R13)              | 0 ecart                    |
// | 7  | Comptes d'attente agreges                              | total = somme des sources  |
// | 8  | Somme TVA / deductible / recuperable vs RGD            | delta 0,00 sur les trois   |
// | 9  | Appariement RGD <-> GL                                 | 100 % hors residus attendus|
// | 10 | Ventilation des cles en classe 6                       | somme par cle == classe 6  |
// | 11 | Volume                                                 | < 10 000 lignes ET > 0     |
//
// Le controle 6 est LE SEUL qui attrape une erreur d'appariement (un mapping faux mais
// bijectif laisse l'equilibre global, la balance par classe et le total des 45x
// parfaitement justes) ; les autres la laissent passer intacte.

import { SEUIL_EQUILIBRE } from "@/lib/reprise/domain/compta";
import type { ControleCompte, LigneEcriture } from "@/lib/reprise/domain/ecriture";
import type { VerdictRaccordement } from "@/lib/reprise/domain/controle-comptes";
import type { PlanMapping } from "@/lib/reprise/domain/mapping-compta";
import type { EntreeMappingResolue } from "@/lib/reprise/domain/decisions-mapping";
import { JOURNAUX_ENTRIES, LIMITE_LIGNES_IMPORT, type LigneEntry } from "@/lib/reprise/domain/entries";
import type { VerdictOmission } from "@/lib/reprise/domain/omission-paires";
import { apparierRgdGl, type LigneRgd } from "@/lib/reprise/domain/rgd";

export type StatutCheck = "ok" | "echec" | "non_execute";

export interface CheckCompta {
  /** Numero 1..11 (l'ordre de la table ci-dessus). */
  numero: number;
  /** Code court stable (filtrage / tests). */
  code: string;
  libelle: string;
  statut: StatutCheck;
  /** Details PII-free : ecarts constates, comptes en cause, ou motif de non-execution. */
  details: string[];
}

export interface BatterieCompta {
  checks: CheckCompta[];
  /** true si AUCUN echec (les non-executes ne bloquent pas mais restent visibles). */
  ok: boolean;
  nbEchecs: number;
  nbNonExecutes: number;
}

/** Tout ce que la batterie consomme. Le service assemble ; le domaine juge. */
export interface DonneesBatterie {
  /** Compteur de lignes non reconnues PAR source d'extraction (GL cloture, GL N, RGD...). */
  nonReconnues: { source: string; nb: number }[];
  /**
   * Le grand livre dont entries.xlsx a ete produit (APRES omission des paires si appliquee) :
   * les memes lignes/controles que la construction, pour que la balance attendue soit la bonne.
   */
  gl: { lignes: LigneEcriture[]; controles: ControleCompte[] };
  /** Verdict du controle croise N-1/N (calcule a l'analyse si les DEUX GL sont fournis). */
  raccordement?: VerdictRaccordement;
  /** Verdict de l'omission des paires (calcule sur le GL portant des reports de classe 6). */
  omission?: VerdictOmission;
  /** Plan de mapping RESOLU (decisions appliquees). */
  plan: PlanMapping;
  /** Les lignes d'entries.xlsx RELUES DEPUIS LE FICHIER (jamais la structure en memoire). */
  entriesRelues: LigneEntry[];
  /** Lignes RGD (checks 8 et 9). Absent -> checks non executes, jamais faussement verts. */
  rgd?: LigneRgd[];
}

function arrondi(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Somme signee d'une ligne entries (debit positif). */
function signeEntry(l: LigneEntry): number {
  return l.type === "debit" ? l.montantTTC : -l.montantTTC;
}

/** Somme signee d'une ligne GL. */
function signeGl(l: LigneEcriture): number {
  return l.sens === "debit" ? l.montant : -l.montant;
}

function ok(numero: number, code: string, libelle: string, details: string[] = []): CheckCompta {
  return { numero, code, libelle, statut: "ok", details };
}
function echec(numero: number, code: string, libelle: string, details: string[]): CheckCompta {
  return { numero, code, libelle, statut: "echec", details };
}
function nonExecute(numero: number, code: string, libelle: string, motif: string): CheckCompta {
  return { numero, code, libelle, statut: "non_execute", details: [motif] };
}

// --- 1. Lignes non reconnues -------------------------------------------------------
function check1(d: DonneesBatterie): CheckCompta {
  const lib = "Lignes non reconnues a l'extraction = 0, sur chaque source";
  const ko = d.nonReconnues.filter((s) => s.nb > 0);
  if (ko.length === 0) return ok(1, "NON_RECONNUES", lib);
  return echec(1, "NON_RECONNUES", lib, ko.map((s) => `${s.source} : ${s.nb} ligne(s) non reconnue(s) (aucun continue silencieux tolere).`));
}

// --- 2. Equilibre global, reports inclus ------------------------------------------
function check2(d: DonneesBatterie): CheckCompta {
  const lib = "Equilibre global du grand livre, reports inclus (0,00, tol. 0,005)";
  let debit = 0;
  let credit = 0;
  for (const c of d.gl.controles) {
    debit += c.reportDebit ?? 0;
    credit += c.reportCredit ?? 0;
  }
  for (const l of d.gl.lignes) {
    if (l.sens === "debit") debit += l.montant;
    else credit += l.montant;
  }
  const ecart = arrondi(debit - credit);
  if (Math.abs(ecart) < SEUIL_EQUILIBRE) return ok(2, "EQUILIBRE_GLOBAL", lib);
  return echec(2, "EQUILIBRE_GLOBAL", lib, [
    `ecart ${ecart.toFixed(2)} (debit ${arrondi(debit).toFixed(2)} / credit ${arrondi(credit).toFixed(2)}) : extraction incomplete ou reports/totaux repris a tort.`,
  ]);
}

// --- 3. Raccord GL N-1 / GL N ------------------------------------------------------
function check3(d: DonneesBatterie): CheckCompta {
  const lib = "Raccord GL N-1 / GL N : 0 ecart, 0 compte orphelin (filet n.2)";
  if (!d.raccordement) {
    return nonExecute(3, "RACCORD_EXERCICES", lib, "un seul grand livre fourni : le controle croise n'a pas pu etre fait (fournir le second GL).");
  }
  if (d.raccordement.raccorde) return ok(3, "RACCORD_EXERCICES", lib, [`${d.raccordement.nbComptesRaccordes} compte(s) raccorde(s) au centime.`]);
  return echec(3, "RACCORD_EXERCICES", lib, [
    ...d.raccordement.ecarts.map((e) => `compte ${e.compte} : cloture ${e.soldeCloture.toFixed(2)} vs report N ${e.reportEnCours.toFixed(2)} (ecart ${e.ecart.toFixed(2)}).`),
    ...d.raccordement.comptesSansVisAVis.map((c) => `compte ${c.compte} : present d'un seul cote (${c.cote}) avec un montant non nul.`),
  ]);
}

// --- 4. Paires a-nouveau / cloture en classe 6 ------------------------------------
function check4(d: DonneesBatterie): CheckCompta {
  const lib = "Paires a-nouveau / 'Cloture N-1' en classe 6 : net 0,00 sur CHAQUE compte";
  if (!d.omission) {
    // Pas de verdict = pas de report de classe 6 constate au moment de la production.
    const reports6 = d.gl.controles.some(
      (c) => c.compte.trim().startsWith("6") && ((c.reportDebit ?? 0) !== 0 || (c.reportCredit ?? 0) !== 0),
    );
    if (!reports6) return ok(4, "PAIRES_CLASSE_6", lib, ["aucun report a-nouveau de classe 6 : rien a apparier."]);
    return echec(4, "PAIRES_CLASSE_6", lib, ["reports de classe 6 presents mais aucun verdict d'omission calcule : produire via le service (jamais a la main)."]);
  }
  if (d.omission.comptesNonAnnules.length === 0) {
    return ok(4, "PAIRES_CLASSE_6", lib, d.omission.applicable ? [`${d.omission.paires.length} paire(s) nettes a 0,00 (bloc du ${d.omission.dateRepartition}).`] : ["aucun report de classe 6."]);
  }
  return echec(4, "PAIRES_CLASSE_6", lib,
    d.omission.comptesNonAnnules.map((c) => `compte ${c.compte} : report ${c.reportSigne.toFixed(2)} non annule (net ${c.net.toFixed(2)}) - ne rien omettre, diagnostiquer.`),
  );
}

// --- 5. Format du fichier ----------------------------------------------------------
const RE_DATE = /^\d{2}\/\d{2}\/\d{4}$/;
function check5(d: DonneesBatterie): CheckCompta {
  const lib = "Format : date JJ/MM/AAAA, journal dans la liste, compte, cle 3 car, type, montant > 0, longueurs";
  const details: string[] = [];
  d.entriesRelues.forEach((l, i) => {
    const n = i + 2; // ligne physique du fichier (1 = en-tetes)
    if (!RE_DATE.test(l.date)) details.push(`ligne ${n} : date "${l.date}" hors format JJ/MM/AAAA.`);
    if (!l.libelle || l.libelle.length > 180) details.push(`ligne ${n} : libelle absent ou > 180 caracteres.`);
    if (l.piece && l.piece.length > 40) details.push(`ligne ${n} : piece > 40 caracteres.`);
    if (l.journal && !(JOURNAUX_ENTRIES as readonly string[]).includes(l.journal)) details.push(`ligne ${n} : journal "${l.journal}" hors liste.`);
    if (!l.compte) details.push(`ligne ${n} : compte vide.`);
    if (l.cle && !/^.{3}$/.test(l.cle)) details.push(`ligne ${n} : cle "${l.cle}" (3 caracteres attendus).`);
    if (!(l.montantTTC > 0)) details.push(`ligne ${n} : Montant TTC ${l.montantTTC} (positif strict attendu, le sens est dans Type).`);
    for (const [nom, v] of [["TVA", l.tva], ["Deductible", l.deductible], ["Recuperable", l.recuperable]] as const) {
      if (v !== undefined && v < 0) details.push(`ligne ${n} : ${nom} ${v} negatif (valeur ABSOLUE attendue, le sens est dans Type).`);
    }
    if (l.commentaire && l.commentaire.length > 2000) details.push(`ligne ${n} : commentaire > 2000 caracteres.`);
  });
  if (details.length === 0) return ok(5, "FORMAT_ENTRIES", lib);
  return echec(5, "FORMAT_ENTRIES", lib, details);
}

// --- Soldes attendus par compte CIBLE (partages par les checks 6 et 7) -------------
interface AttenduCible {
  /** cible -> { solde attendu signe, comptes sources agreges } */
  parCible: Map<string, { attendu: number; sources: string[] }>;
}

function soldesAttendus(d: DonneesBatterie): AttenduCible {
  // Solde signe de chaque compte SOURCE (reports inclus).
  const soldeSource = new Map<string, number>();
  for (const c of d.gl.controles) {
    soldeSource.set(c.compte, arrondi((c.reportDebit ?? 0) - (c.reportCredit ?? 0)));
  }
  for (const l of d.gl.lignes) {
    soldeSource.set(l.compte, arrondi((soldeSource.get(l.compte) ?? 0) + signeGl(l)));
  }
  const parCible = new Map<string, { attendu: number; sources: string[] }>();
  for (const e of d.plan.entrees as EntreeMappingResolue[]) {
    if (e.ignore) continue;
    if (e.statut !== "mappe" && e.statut !== "reporte_bloc_b") continue;
    if (!e.cible) continue;
    const solde = soldeSource.get(e.compteSource) ?? 0;
    const agg = parCible.get(e.cible.nomenclature) ?? { attendu: 0, sources: [] };
    agg.attendu = arrondi(agg.attendu + solde);
    agg.sources.push(e.compteSource);
    parCible.set(e.cible.nomenclature, agg);
  }
  return { parCible };
}

/** Solde signe par compte CIBLE recalcule depuis le fichier RELU. */
function soldesProduits(entries: LigneEntry[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of entries) out.set(l.compte, arrondi((out.get(l.compte) ?? 0) + signeEntry(l)));
  return out;
}

// --- 6. Balance par compte CIBLE vs sortant (LE filet R13) -------------------------
function check6(d: DonneesBatterie): CheckCompta {
  const lib = "Balance par compte CIBLE (fichier relu) vs balance du sortant apres mapping : 0 ecart";
  const attendus = soldesAttendus(d).parCible;
  const produits = soldesProduits(d.entriesRelues);
  const details: string[] = [];
  for (const [cible, { attendu }] of attendus) {
    const produit = produits.get(cible) ?? 0;
    const ecart = arrondi(produit - attendu);
    if (Math.abs(ecart) >= SEUIL_EQUILIBRE) {
      details.push(`compte cible ${cible} : produit ${produit.toFixed(2)} vs attendu ${attendu.toFixed(2)} (ecart ${ecart.toFixed(2)}).`);
    }
  }
  for (const cible of produits.keys()) {
    if (!attendus.has(cible) && Math.abs(produits.get(cible)!) >= SEUIL_EQUILIBRE) {
      details.push(`compte cible ${cible} : present dans le fichier mais attendu par aucun mapping.`);
    }
  }
  if (details.length === 0) return ok(6, "BALANCE_PAR_CIBLE", lib, [`${attendus.size} compte(s) cible controles, 0 ecart.`]);
  return echec(6, "BALANCE_PAR_CIBLE", lib, details);
}

// --- 7. Comptes d'attente agreges --------------------------------------------------
const CATEGORIES_ATTENTE = new Set(["banque", "livret", "attente_ancien", "rompus_473"]);
function check7(d: DonneesBatterie): CheckCompta {
  const lib = "Comptes d'attente agreges : total du compte cible = somme des comptes sources";
  // Cibles d'agregation = celles visees par au moins un compte de categorie attente.
  const ciblesAttente = new Map<string, string[]>();
  for (const e of d.plan.entrees as EntreeMappingResolue[]) {
    if (e.ignore || !e.cible) continue;
    if (!CATEGORIES_ATTENTE.has(e.categorie)) continue;
    const arr = ciblesAttente.get(e.cible.nomenclature) ?? [];
    arr.push(e.compteSource);
    ciblesAttente.set(e.cible.nomenclature, arr);
  }
  if (ciblesAttente.size === 0) return ok(7, "ATTENTE_AGREGES", lib, ["aucun compte d'attente dans le plan."]);

  const attendus = soldesAttendus(d).parCible;
  const produits = soldesProduits(d.entriesRelues);
  const details: string[] = [];
  for (const [cible, sources] of ciblesAttente) {
    const attendu = attendus.get(cible)?.attendu ?? 0;
    const produit = produits.get(cible) ?? 0;
    const ecart = arrondi(produit - attendu);
    if (Math.abs(ecart) >= SEUIL_EQUILIBRE) {
      details.push(`compte d'attente ${cible} (sources ${sources.join(", ")}) : produit ${produit.toFixed(2)} vs somme des sources ${attendu.toFixed(2)}.`);
    }
  }
  if (details.length === 0) return ok(7, "ATTENTE_AGREGES", lib, [`${ciblesAttente.size} compte(s) d'attente, totaux = somme des sources.`]);
  return echec(7, "ATTENTE_AGREGES", lib, details);
}

// --- 8. Sommes TVA / deductible / recuperable vs RGD -------------------------------
function check8(d: DonneesBatterie): CheckCompta {
  const lib = "Somme TVA / deductible / recuperable du fichier vs RGD : delta 0,00 sur les trois";
  if (!d.rgd || d.rgd.length === 0) return nonExecute(8, "TVA_VS_RGD", lib, "RGD non fourni : les colonnes TVA n'ont pas de reference a confronter.");
  // COMPARAISON EN SIGNE : le fichier est en valeur absolue + sens dans Type, le RGD est signe.
  // Comparer des totaux absolus a des totaux signes donnerait un faux ecart = 2 x la somme des
  // lignes negatives (piege documente S0303).
  let tvaF = 0, dedF = 0, recF = 0;
  for (const l of d.entriesRelues) {
    const s = l.type === "debit" ? 1 : -1;
    tvaF += s * (l.tva ?? 0);
    dedF += s * (l.deductible ?? 0);
    recF += s * (l.recuperable ?? 0);
  }
  let tvaR = 0, dedR = 0, recR = 0;
  for (const r of d.rgd) {
    tvaR += r.tva ?? 0;
    dedR += r.deductible ?? 0;
    recR += r.recuperable ?? 0;
  }
  const details: string[] = [];
  for (const [nom, f, ref] of [["TVA", tvaF, tvaR], ["Deductible", dedF, dedR], ["Recuperable", recF, recR]] as const) {
    const ecart = arrondi(f - ref);
    if (Math.abs(ecart) >= SEUIL_EQUILIBRE) details.push(`${nom} : fichier ${arrondi(f).toFixed(2)} vs RGD ${arrondi(ref).toFixed(2)} (ecart ${ecart.toFixed(2)}).`);
  }
  if (details.length === 0) return ok(8, "TVA_VS_RGD", lib);
  return echec(8, "TVA_VS_RGD", lib, details);
}

// --- 9. Appariement RGD <-> GL -----------------------------------------------------
/** Residus GL legitimes : les travaux (671/672), absents du RGD par construction. */
function estCompteTravaux(compte: string): boolean {
  const c = compte.trim();
  return c.startsWith("671") || c.startsWith("672");
}
function check9(d: DonneesBatterie): CheckCompta {
  const lib = "Appariement RGD <-> GL : 100 %, hors residus attendus (travaux cote GL, 716 cote RGD)";
  if (!d.rgd || d.rgd.length === 0) return nonExecute(9, "APPARIEMENT_RGD", lib, "RGD non fourni.");
  const app = apparierRgdGl(d.gl.lignes, d.rgd);
  const details: string[] = [];
  for (const r of app.residusGl) {
    if (!estCompteTravaux(r.ligne.compte)) {
      details.push(`GL sans RGD : compte ${r.ligne.compte}, ${r.ligne.date}, ${r.ligne.montant.toFixed(2)} (seuls les travaux 671/672 sont attendus ici).`);
    }
  }
  for (const r of app.residusRgd) {
    if (!r.compte.trim().startsWith("716")) {
      details.push(`RGD sans GL : compte ${r.compte}, ${r.date}, ${r.ttc.toFixed(2)} (seul le 716 est attendu ici).`);
    }
  }
  if (details.length === 0) return ok(9, "APPARIEMENT_RGD", lib, [`${app.parIndexGl.size} ligne(s) appariee(s).`]);
  return echec(9, "APPARIEMENT_RGD", lib, details);
}

// --- 10. Ventilation des cles en classe 6 ------------------------------------------
function check10(d: DonneesBatterie): CheckCompta {
  const lib = "Ventilation des cles en classe 6 : somme par cle == solde de classe 6, aucune ligne sans cle";
  const lignes6 = d.entriesRelues.filter((l) => l.compte.trim().startsWith("6"));
  if (lignes6.length === 0) return ok(10, "VENTILATION_CLES", lib, ["aucune ligne de classe 6 dans le fichier."]);
  const details: string[] = [];
  const parCle = new Map<string, number>();
  let total = 0;
  lignes6.forEach((l) => {
    if (!l.cle) details.push(`ligne classe 6 (${l.compte}, ${l.date}) sans cle : la repartition serait fausse.`);
    const cle = l.cle ?? "(vide)";
    parCle.set(cle, arrondi((parCle.get(cle) ?? 0) + signeEntry(l)));
    total = arrondi(total + signeEntry(l));
  });
  const sommeCles = arrondi([...parCle.values()].reduce((s, v) => s + v, 0));
  if (Math.abs(sommeCles - total) >= SEUIL_EQUILIBRE) {
    details.push(`somme par cle ${sommeCles.toFixed(2)} != solde classe 6 ${total.toFixed(2)}.`);
  }
  if (details.length === 0) {
    return ok(10, "VENTILATION_CLES", lib, [
      `classe 6 = ${total.toFixed(2)} ventiles sur ${parCle.size} cle(s) : ${[...parCle.entries()].map(([k, v]) => `${k}=${v.toFixed(2)}`).join(", ")}.`,
    ]);
  }
  return echec(10, "VENTILATION_CLES", lib, details);
}

// --- 11. Volume --------------------------------------------------------------------
function check11(d: DonneesBatterie): CheckCompta {
  const lib = `Volume : > 0 et < ${LIMITE_LIGNES_IMPORT} lignes (limite dure eStale par import)`;
  const n = d.entriesRelues.length;
  if (n === 0) return echec(11, "VOLUME", lib, ["0 ligne : un jeu vide traverse tous les garde-fous, c'est un ECHEC, jamais un succes."]);
  if (n >= LIMITE_LIGNES_IMPORT) return echec(11, "VOLUME", lib, [`${n} lignes >= ${LIMITE_LIGNES_IMPORT} : scinder en plusieurs imports.`]);
  return ok(11, "VOLUME", lib, [`${n} ligne(s).`]);
}

/**
 * Execute la batterie complete. Pur : meme entree => meme sortie.
 * ok = AUCUN echec. Les checks non executables (RGD absent, un seul GL) restent VISIBLES
 * en "non_execute" - jamais un vert menteur.
 */
export function executerBatterieCompta(d: DonneesBatterie): BatterieCompta {
  const checks = [
    check1(d), check2(d), check3(d), check4(d), check5(d), check6(d),
    check7(d), check8(d), check9(d), check10(d), check11(d),
  ];
  const nbEchecs = checks.filter((c) => c.statut === "echec").length;
  const nbNonExecutes = checks.filter((c) => c.statut === "non_execute").length;
  return { checks, ok: nbEchecs === 0, nbEchecs, nbNonExecutes };
}
