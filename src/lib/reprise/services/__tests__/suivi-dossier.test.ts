import { beforeEach, describe, expect, it } from "vitest";
import { estArchive, ETAPES_REPRISE } from "@/lib/reprise/domain/dossier";
import { DossierRepositoryMemoire } from "@/lib/reprise/adapters/memoire/dossier-repository-memoire";
import { FicheRenseignementsRepositoryMemoire } from "@/lib/reprise/adapters/memoire/fiche-renseignements-repository-memoire";
import type { FicheRenseignement } from "@/lib/reprise/domain/fiche-renseignements";
import type { RecapPatrimoine } from "../orchestrateur-patrimoine";
import {
  ajouterAnomalie,
  ajouterEtapeAdHocAuDossier,
  ajouterJournal,
  assignerEtape,
  changerStatutEtape,
  dateIsoValide,
  definirCadrage,
  definirEquipe,
  fixerEcheance,
  noterEtape,
  supprimerEtapeAdHoc,
  appliquerRecap,
  appliquerResultatAnalyse,
  archiverDossier,
  corrigerJeuDossier,
  creerDossierSuivi,
  enregistrerComptaErreur,
  enregistrerComptaResume,
  enregistrerJeu,
  listerDossiers,
  majEtape,
  obtenirDossier,
  supprimerDossierEtFiches,
} from "../suivi-dossier";
import type { JeuDeDonnees } from "@/lib/reprise/domain/patrimoine";

let repo: DossierRepositoryMemoire;
beforeEach(() => {
  repo = new DossierRepositoryMemoire();
});

const sekou = { id: "u-sekou", nom: "Sekou" };
const marie = { id: "u-marie", nom: "Marie" };
const paul = { id: "u-paul", nom: "Paul" };
const ctx = { auteur: "Sekou", dateIso: "2026-09-09T10:00:00.000Z" };
const N = ETAPES_REPRISE.length;

describe("suivi-dossier", () => {
  it("cree un dossier et refuse un doublon de ref", async () => {
    await creerDossierSuivi(repo, "S0302", "Gabriel Peri");
    await expect(creerDossierSuivi(repo, "S0302", "X")).rejects.toThrow(/deja existant/);
  });

  it("liste les dossiers tries par ref", async () => {
    await creerDossierSuivi(repo, "S0303", "B");
    await creerDossierSuivi(repo, "S0300", "A");
    expect((await listerDossiers(repo)).map((d) => d.ref)).toEqual(["S0300", "S0303"]);
  });

  it("met a jour le statut d'une etape par code (contrat historique, ctx optionnel)", async () => {
    await creerDossierSuivi(repo, "S0302", "X");
    const d = await majEtape(repo, "S0302", "PA2", "fait");
    expect(d.etapes.find((e) => e.code === "PA2")!.statut).toBe("fait");
    expect(d.etapes.find((e) => e.code === "PA2")!.majLe).toBeUndefined();
    const d2 = await majEtape(repo, "S0302", "PA3", "en_cours", { auteur: "Sekou", dateIso: "2026-09-09T10:00:00.000Z" });
    expect(d2.etapes.find((e) => e.code === "PA3")).toMatchObject({ statut: "en_cours", majLe: "2026-09-09T10:00:00.000Z", majPar: "Sekou" });
    expect(d2.journal).toHaveLength(0); // pas de journal automatique sur le contrat historique
  });

  it("rejette une etape inconnue et un dossier introuvable", async () => {
    await creerDossierSuivi(repo, "S0302", "X");
    await expect(majEtape(repo, "S0302", "ZZ", "fait")).rejects.toThrow(/Etape inconnue/);
    await expect(majEtape(repo, "S9999", "PA2", "fait")).rejects.toThrow(/introuvable/);
  });

  it("cree un dossier avec cadrage + equipe (etapes assignees par role) et refuse une date de bascule invalide", async () => {
    const d = await creerDossierSuivi(repo, "S0310", "Cadré", "2 rue Y", { sortant: "Nexity", dateBascule: "2026-01-01", equipe: { gestionnaire: marie } });
    expect(d.sortant).toBe("Nexity");
    expect(d.dateBascule).toBe("2026-01-01");
    expect(d.equipe).toEqual({ gestionnaire: marie });
    expect(d.etapes.find((e) => e.code === "CA1")!.assigneA).toEqual(marie);
    await expect(creerDossierSuivi(repo, "S0311", "X", undefined, { dateBascule: "2026-02-30" })).rejects.toThrow(/invalide/);
  });

  it("migre en douceur un dossier persiste a l'ancienne nomenclature (R* et P/V/C) sans crash ni perte", async () => {
    // Dossier stocke a l'ancienne (R1 fait, P3 fait) : la lecture doit le rehydrater sur la
    // checklist v3 (R1 -> DO2) et preserver l'etat coche de P3. Une etape canonique reste modifiable.
    const ancien = {
      ref: "S0400",
      nomUsuel: "Ancien",
      statut: "production" as const,
      etapes: [
        { code: "R1", phase: "PATRIMOINE" as const, libelle: "GL", statut: "fait" as const },
        { code: "P3", phase: "PATRIMOINE" as const, libelle: "Production", statut: "fait" as const },
        { code: "P1", phase: "PATRIMOINE" as const, libelle: "Preparation", statut: "a_faire" as const },
      ],
      compteurs: {},
      anomalies: [],
      journal: [],
    };
    await repo.sauver(ancien);

    const lu = await obtenirDossier(repo, "S0400");
    expect(lu!.etapes.map((e) => e.code).slice(0, ETAPES_REPRISE.length)).toEqual(ETAPES_REPRISE.map((e) => e.code));
    expect(lu!.etapes.find((e) => e.code === "DO2")!.statut).toBe("fait");
    expect(lu!.etapes.find((e) => e.code === "R1")).toBeUndefined();
    // P3 (coche) preserve ; P1 (a_faire, sans info) abandonne.
    expect(lu!.etapes.find((e) => e.code === "P3")!.statut).toBe("fait");
    expect(lu!.etapes.find((e) => e.code === "P1")).toBeUndefined();
    // Une etape canonique reste modifiable apres migration.
    const d = await majEtape(repo, "S0400", "CP1", "en_cours");
    expect(d.etapes.find((e) => e.code === "CP1")!.statut).toBe("en_cours");
  });

  it("ajoute anomalies (sans doublon) et journal", async () => {
    await creerDossierSuivi(repo, "S0302", "X");
    await ajouterAnomalie(repo, "S0302", "SCI sans K-bis");
    await ajouterAnomalie(repo, "S0302", "SCI sans K-bis");
    const d = await ajouterJournal(repo, "S0302", "Import fait", "2026-07-01", "Sekou");
    expect(d.anomalies).toEqual(["SCI sans K-bis"]);
    expect(d.journal).toEqual([{ date: "2026-07-01", texte: "Import fait", auteur: "Sekou" }]);
    // Sans auteur : pas de cle auteur (JSONB propre).
    const d2 = await ajouterJournal(repo, "S0302", "Sans auteur", "2026-07-02");
    expect(d2.journal[1]).toEqual({ date: "2026-07-02", texte: "Sans auteur" });
  });

  it("reporte les compteurs et anomalies d'un recap", async () => {
    await creerDossierSuivi(repo, "S0302", "X");
    const recap = {
      lots: { total: 12, parUsage: {} },
      cles: [{ code: "001", libelle: "CG", totalAttendu: 1000, sommeCalculee: 1000, nbLots: 12, ecart: 0 }],
      owners: { total: 8, sci: 1, couples: 2 },
      attributions: { total: 12, lotsOrphelins: 0 },
      fusionsProposees: 1,
      doublonsNonTranchables: 0,
      notes: ["K-bis a fournir"],
      checks: { ok: true, erreurs: [], warnings: [{ code: "OWNER_FUSION_A_VALIDER", niveau: "warning", message: "fusion X" }] },
      pretAProduire: true,
    } as unknown as RecapPatrimoine;

    const d = await appliquerRecap(repo, "S0302", recap);
    expect(d.compteurs.nbLots).toBe(12);
    expect(d.compteurs.nbCoproprietaires).toBe(8);
    expect(d.compteurs.nbAttributions).toBe(12);
    expect(d.compteurs.nbAnomalies).toBe(1); // 0 erreur + 1 warning
    expect(d.anomalies).toEqual(["K-bis a fournir", "fusion X"]);
  });
});

// --- appliquerResultatAnalyse (audit API 2026-07-16, P1-7 : ecriture groupee) ---------------

function recapDeTest(): RecapPatrimoine {
  return {
    lots: { total: 12, parUsage: {} },
    cles: [{ code: "001", libelle: "CG", totalAttendu: 1000, sommeCalculee: 1000, nbLots: 12, ecart: 0 }],
    owners: { total: 8, sci: 1, couples: 2 },
    attributions: { total: 12, lotsOrphelins: 0 },
    fusionsProposees: 1,
    doublonsNonTranchables: 0,
    notes: ["K-bis a fournir"],
    checks: { ok: true, erreurs: [], warnings: [{ code: "OWNER_FUSION_A_VALIDER", niveau: "warning", message: "fusion X" }] },
    pretAProduire: true,
  } as unknown as RecapPatrimoine;
}

/** Repo qui COMPTE les lectures/ecritures (verifie le "1 obtenir + 1 sauver" du chemin groupe). */
class RepoCompteur extends DossierRepositoryMemoire {
  lectures = 0;
  ecritures = 0;
  override async obtenir(ref: string) {
    this.lectures++;
    return super.obtenir(ref);
  }
  override async sauver(d: Parameters<DossierRepositoryMemoire["sauver"]>[0]) {
    this.ecritures++;
    return super.sauver(d);
  }
}

describe("appliquerResultatAnalyse (ecriture groupee)", () => {
  const compta = { equilibre: true, ecart: 0, nbComptes: 42, nbEcritures: 800 };
  const comptaEnCours = { equilibre: false, ecart: 12.5, nbComptes: 40, nbEcritures: 300 };

  it("persiste tout le resultat d'analyse en UNE lecture + UNE ecriture", async () => {
    const compteur = new RepoCompteur();
    await creerDossierSuivi(compteur, "S0302", "X");
    compteur.lectures = 0;
    compteur.ecritures = 0;

    await appliquerResultatAnalyse(compteur, "S0302", {
      recap: recapDeTest(),
      jeu: jeuAvecEcart(),
      compta,
      comptaEnCours,
      raccordement: undefined,
      grandLivreJoint: true,
      comptaErreur: undefined,
      nowISO: "2026-07-16T10:00:00.000Z",
      journalTexte: "Analyse des documents : 12 lot(s).",
    });

    expect(compteur.lectures).toBe(1); // plus les 5 cycles obtenir()/sauver() d'avant
    expect(compteur.ecritures).toBe(1);

    const d = await obtenirDossier(compteur, "S0302");
    expect(d!.compteurs.nbLots).toBe(12);
    expect(d!.compteurs.compta).toEqual(compta);
    expect(d!.compteurs.comptaEnCours).toEqual(comptaEnCours);
    expect(d!.anomalies).toEqual(["K-bis a fournir", "fusion X"]);
    expect(d!.jeu!.lots).toHaveLength(2);
    expect(d!.journal.at(-1)!.texte).toBe("Analyse des documents : 12 lot(s).");
  });

  it("produit EXACTEMENT le meme dossier que l'ancienne sequence de helpers unitaires", async () => {
    // Ancienne sequence (celle de la route avant regroupement) sur un dossier temoin.
    await creerDossierSuivi(repo, "S0400", "Temoin");
    await appliquerRecap(repo, "S0400", recapDeTest());
    await enregistrerComptaResume(repo, "S0400", compta, comptaEnCours, undefined);
    await enregistrerComptaErreur(repo, "S0400", undefined);
    await enregistrerJeu(repo, "S0400", jeuAvecEcart());
    await ajouterJournal(repo, "S0400", "Analyse.", "2026-07-16T10:00:00.000Z");

    // Chemin groupe sur un second dossier.
    await creerDossierSuivi(repo, "S0401", "Temoin");
    await appliquerResultatAnalyse(repo, "S0401", {
      recap: recapDeTest(),
      jeu: jeuAvecEcart(),
      compta,
      comptaEnCours,
      raccordement: undefined,
      grandLivreJoint: true,
      comptaErreur: undefined,
      nowISO: "2026-07-16T10:00:00.000Z",
      journalTexte: "Analyse.",
    });

    const ancien = await obtenirDossier(repo, "S0400");
    const groupe = await obtenirDossier(repo, "S0401");
    expect({ ...groupe!, ref: "X" }).toEqual({ ...ancien!, ref: "X" }); // identiques hors ref
  });

  it("ne touche pas a comptaErreur quand aucun grand livre n'etait joint", async () => {
    await creerDossierSuivi(repo, "S0302", "X");
    // Une erreur GL preexistante (analyse precedente avec GL scanne).
    await enregistrerComptaErreur(repo, "S0302", "GL scanne, couche texte impossible");

    await appliquerResultatAnalyse(repo, "S0302", {
      recap: recapDeTest(),
      jeu: jeuAvecEcart(),
      grandLivreJoint: false, // re-analyse SANS grand livre : l'erreur precedente reste
      nowISO: "2026-07-16T11:00:00.000Z",
      journalTexte: "Analyse.",
    });

    const d = await obtenirDossier(repo, "S0302");
    expect(d!.compteurs.comptaErreur).toBe("GL scanne, couche texte impossible");
    expect(d!.compteurs.compta).toBeUndefined(); // pas de compta fournie -> pas touchee
  });
});

describe("archivage / suppression", () => {
  it("archive puis desarchive (flag JSONB, reversible) + journalise", async () => {
    await creerDossierSuivi(repo, "S0302", "X");
    const arch = await archiverDossier(repo, "S0302", true, "2026-07-16T09:00:00.000Z");
    expect(estArchive(arch)).toBe(true);
    expect(arch.compteurs.archive).toBe(true);
    expect(arch.journal.at(-1)!.texte).toMatch(/archive/i);

    const des = await archiverDossier(repo, "S0302", false, "2026-07-16T09:05:00.000Z");
    expect(estArchive(des)).toBe(false);
    // Efface (undefined) au desarchivage pour garder le JSONB propre.
    expect(des.compteurs.archive).toBeUndefined();
    expect(des.journal.at(-1)!.texte).toMatch(/desarchive/i);
  });

  it("supprime le dossier ET ses fiches liees, en renvoyant le compte de fiches parties", async () => {
    const fichesRepo = new FicheRenseignementsRepositoryMemoire();
    await creerDossierSuivi(repo, "S0302", "X");
    // Deux fiches sur S0302, une sur un autre dossier (ne doit PAS partir).
    await fichesRepo.sauver(ficheMinimale("S0302", "o1"));
    await fichesRepo.sauver(ficheMinimale("S0302", "o2"));
    await fichesRepo.sauver(ficheMinimale("S0303", "o1"));

    const { fichesSupprimees } = await supprimerDossierEtFiches(repo, fichesRepo, "S0302");
    expect(fichesSupprimees).toBe(2);
    expect(await obtenirDossier(repo, "S0302")).toBeNull();
    expect(await fichesRepo.listerParDossier("S0302")).toHaveLength(0);
    // Les fiches d'un autre dossier sont intactes.
    expect(await fichesRepo.listerParDossier("S0303")).toHaveLength(1);
  });
});

function ficheMinimale(coproCode: string, ownerId: string): FicheRenseignement {
  return {
    coproCode,
    ownerId,
    tokenHash: `tok-${coproCode}-${ownerId}`,
    codeHash: `code-${coproCode}-${ownerId}`,
    statut: "courrier_genere",
    connues: { civilite: "m", nom: "X", pro: false },
    courrierGenereAt: "2026-07-16T00:00:00.000Z",
    expiresAt: "2026-12-31T00:00:00.000Z",
  };
}

// Jeu minimal COHERENT (passe verifierTout) sauf un tantieme faux qui casse la cle 100.
function jeuAvecEcart(): JeuDeDonnees {
  return {
    lots: [
      { numero: 1, type: "Appartement", usage: "residential", commentaire: "L1" },
      { numero: 2, type: "Appartement", usage: "residential", commentaire: "L2" },
    ],
    cles: [
      { code: "001", libelle: "Charges generales", totalAttendu: 1000, defaut: true },
      { code: "100", libelle: "Ascenseur", totalAttendu: 500 },
    ],
    tantiemes: [
      { cleCode: "001", lot: 1, valeur: 600 },
      { cleCode: "001", lot: 2, valeur: 400 },
      { cleCode: "100", lot: 1, valeur: 250 },
      { cleCode: "100", lot: 2, valeur: 200 }, // faux : Σ=450 != 500 -> ecart bloquant
    ],
    owners: [
      { id: "o1", civilite: "m", nom: "MARTIN", prenom: "Paul", pro: false },
      { id: "o2", civilite: "mme", nom: "NOVAK", prenom: "Elena", pro: false },
    ],
    attributions: [
      { ownerId: "o1", lot: 1 },
      { ownerId: "o2", lot: 2 },
    ],
  };
}

describe("corrigerJeuDossier", () => {
  it("corrige un tantieme faux, repasse les auto-checks et met le dossier pret a produire", async () => {
    await creerDossierSuivi(repo, "S0302", "X");
    await enregistrerJeu(repo, "S0302", jeuAvecEcart());

    const res = await corrigerJeuDossier(
      repo,
      "S0302",
      [{ type: "tantieme.modifier", cleCode: "100", lot: 2, valeur: 250 }],
      "2026-07-16T10:00:00.000Z",
    );

    expect(res.recap.pretAProduire).toBe(true);
    expect(res.recap.checks.ok).toBe(true);
    // Persistance : le jeu corrige est relu, compteurs a jour, journal alimente.
    const d = await obtenirDossier(repo, "S0302");
    expect(d!.jeu!.tantiemes.find((t) => t.cleCode === "100" && t.lot === 2)!.valeur).toBe(250);
    expect(d!.compteurs.nbAnomalies).toBe(0);
    expect(d!.journal.at(-1)!.texte).toContain("Correction manuelle");
    expect(d!.journal.at(-1)!.texte).toContain("1 tantieme(s)");
  });

  it("fusionne deux owners et journalise le detail (PII-free)", async () => {
    await creerDossierSuivi(repo, "S0302", "X");
    const jeu = jeuAvecEcart();
    jeu.owners.push({ id: "o2bis", civilite: "mme", nom: "NOVAK", prenom: "Elena", pro: false });
    jeu.attributions.push({ ownerId: "o2bis", lot: 2 });
    await enregistrerJeu(repo, "S0302", jeu);

    const res = await corrigerJeuDossier(
      repo,
      "S0302",
      [{ type: "owner.fusionner", survivantId: "o2", absorbeId: "o2bis" }],
      "2026-07-16T10:05:00.000Z",
    );
    expect(res.recap.owners.total).toBe(2);
    const d = await obtenirDossier(repo, "S0302");
    expect(d!.jeu!.owners.some((o) => o.id === "o2bis")).toBe(false);
    expect(d!.journal.at(-1)!.texte).toContain("fusion");
  });

  it("rejette (sans persister) une correction referencant une entite inconnue", async () => {
    await creerDossierSuivi(repo, "S0302", "X");
    await enregistrerJeu(repo, "S0302", jeuAvecEcart());
    await expect(
      corrigerJeuDossier(repo, "S0302", [{ type: "tantieme.modifier", cleCode: "999", lot: 1, valeur: 1 }], "2026-07-16T10:10:00.000Z"),
    ).rejects.toThrow(/introuvable/);
    // Le jeu n'a pas bouge (le tantieme faux est toujours la).
    const d = await obtenirDossier(repo, "S0302");
    expect(d!.jeu!.tantiemes.find((t) => t.cleCode === "100" && t.lot === 2)!.valeur).toBe(200);
  });

  it("leve si aucun jeu n'a ete analyse", async () => {
    await creerDossierSuivi(repo, "S0302", "X");
    await expect(
      corrigerJeuDossier(repo, "S0302", [{ type: "tantieme.modifier", cleCode: "001", lot: 1, valeur: 1 }], "2026-07-16T10:15:00.000Z"),
    ).rejects.toThrow(/Aucun jeu/);
  });
});

// --- Suivi d'equipe (ADR-037) -----------------------------------------------------------------

function estErreur(x: unknown): x is { erreur: string } {
  return typeof x === "object" && x !== null && "erreur" in x;
}

describe("suivi d'equipe : changerStatutEtape", () => {
  it("bloque sans motif -> { erreur } sans rien persister", async () => {
    await creerDossierSuivi(repo, "S0302", "X");
    const r = await changerStatutEtape(repo, "S0302", "CA4", "bloque", ctx);
    expect(r).toEqual({ erreur: expect.stringMatching(/motif/i) });
    const r2 = await changerStatutEtape(repo, "S0302", "CA4", "bloque", ctx, "   ");
    expect(estErreur(r2)).toBe(true);
    const d = await obtenirDossier(repo, "S0302");
    expect(d!.etapes.find((e) => e.code === "CA4")!.statut).toBe("a_faire");
    expect(d!.journal).toHaveLength(0);
  });

  it("bloque avec motif : note = motif, majLe/majPar, journal automatique avec auteur", async () => {
    await creerDossierSuivi(repo, "S0302", "X");
    const r = await changerStatutEtape(repo, "S0302", "CA4", "bloque", ctx, " La banque ne répond pas ");
    expect(estErreur(r)).toBe(false);
    const d = await obtenirDossier(repo, "S0302");
    expect(d!.etapes.find((e) => e.code === "CA4")).toMatchObject({
      statut: "bloque",
      note: "La banque ne répond pas",
      majLe: ctx.dateIso,
      majPar: "Sekou",
    });
    expect(d!.journal).toEqual([{ date: ctx.dateIso, auteur: "Sekou", texte: "CA4 → bloquée : La banque ne répond pas" }]);
  });

  it("fait / en cours / ignorée / à faire : journal accorde, note conservee", async () => {
    await creerDossierSuivi(repo, "S0302", "X");
    await noterEtape(repo, "S0302", "BA2", "IBAN demandé le 1er", ctx);
    await changerStatutEtape(repo, "S0302", "BA2", "fait", ctx);
    await changerStatutEtape(repo, "S0302", "BA3", "en_cours", ctx);
    await changerStatutEtape(repo, "S0302", "BA4", "ignore", ctx, "Pas de fonds travaux");
    const r = await changerStatutEtape(repo, "S0302", "BA3", "a_faire", ctx);
    if (estErreur(r)) throw new Error(r.erreur);
    expect(r.etapes.find((e) => e.code === "BA2")!.note).toBe("IBAN demandé le 1er");
    expect(r.etapes.find((e) => e.code === "BA4")!.note).toBe("Pas de fonds travaux");
    expect(r.journal.map((j) => j.texte)).toEqual([
      "BA2 → faite",
      "BA3 → en cours",
      "BA4 → ignorée : Pas de fonds travaux",
      "BA3 → à faire",
    ]);
    expect(r.journal.every((j) => j.auteur === "Sekou")).toBe(true);
  });

  it("dossier introuvable, code inconnu, statut inconnu -> { erreur }, jamais d'exception", async () => {
    await creerDossierSuivi(repo, "S0302", "X");
    expect(await changerStatutEtape(repo, "S9999", "CA1", "fait", ctx)).toEqual({ erreur: expect.stringMatching(/introuvable/) });
    expect(await changerStatutEtape(repo, "S0302", "ZZ9", "fait", ctx)).toEqual({ erreur: expect.stringMatching(/inconnue/) });
    expect(await changerStatutEtape(repo, "S0302", "CA1", "termine" as never, ctx)).toEqual({ erreur: expect.stringMatching(/Statut/) });
  });
});

describe("suivi d'equipe : assigner / noter / echeance", () => {
  it("assigne puis desassigne, avec journal", async () => {
    await creerDossierSuivi(repo, "S0302", "X");
    const r = await assignerEtape(repo, "S0302", "BA2", { id: "u-marie", nom: " Marie " }, ctx);
    expect(estErreur(r)).toBe(false);
    let d = await obtenirDossier(repo, "S0302");
    expect(d!.etapes.find((e) => e.code === "BA2")).toMatchObject({ assigneA: marie, majPar: "Sekou" });
    expect(d!.journal.at(-1)!.texte).toBe("BA2 assignée à Marie");

    await assignerEtape(repo, "S0302", "BA2", null, ctx);
    d = await obtenirDossier(repo, "S0302");
    expect(d!.etapes.find((e) => e.code === "BA2")!.assigneA).toBeUndefined();
    expect(d!.journal.at(-1)!.texte).toBe("BA2 désassignée");
  });

  it("personne invalide / etape inconnue -> { erreur }", async () => {
    await creerDossierSuivi(repo, "S0302", "X");
    expect(estErreur(await assignerEtape(repo, "S0302", "BA2", { id: "", nom: "X" }, ctx))).toBe(true);
    expect(estErreur(await assignerEtape(repo, "S0302", "BA2", { id: "u", nom: " " }, ctx))).toBe(true);
    expect(estErreur(await assignerEtape(repo, "S0302", "ZZ", marie, ctx))).toBe(true);
  });

  it("noterEtape pose, remplace et efface (vide) la note, sans journal", async () => {
    await creerDossierSuivi(repo, "S0302", "X");
    await noterEtape(repo, "S0302", "CA1", "  RDV le 12  ", ctx);
    let d = await obtenirDossier(repo, "S0302");
    expect(d!.etapes.find((e) => e.code === "CA1")).toMatchObject({ note: "RDV le 12", majLe: ctx.dateIso });
    await noterEtape(repo, "S0302", "CA1", "   ", ctx);
    d = await obtenirDossier(repo, "S0302");
    expect("note" in d!.etapes.find((e) => e.code === "CA1")!).toBe(false);
    expect(d!.journal).toHaveLength(0);
    expect(estErreur(await noterEtape(repo, "S0302", "ZZ", "x", ctx))).toBe(true);
  });

  it("fixerEcheance accepte AAAA-MM-JJ valide ou null, refuse le reste", async () => {
    await creerDossierSuivi(repo, "S0302", "X");
    expect(estErreur(await fixerEcheance(repo, "S0302", "CA1", "2026-09-15", ctx))).toBe(false);
    let d = await obtenirDossier(repo, "S0302");
    expect(d!.etapes.find((e) => e.code === "CA1")!.echeance).toBe("2026-09-15");
    for (const mauvaise of ["15/09/2026", "2026-9-15", "2026-02-30", "2026-13-01", "2026-09-15T00:00:00Z", ""]) {
      expect(await fixerEcheance(repo, "S0302", "CA1", mauvaise, ctx)).toEqual({ erreur: expect.stringMatching(/invalide/) });
    }
    expect(estErreur(await fixerEcheance(repo, "S0302", "CA1", null, ctx))).toBe(false);
    d = await obtenirDossier(repo, "S0302");
    expect(d!.etapes.find((e) => e.code === "CA1")!.echeance).toBeUndefined();
  });

  it("dateIsoValide : format ET calendrier", () => {
    expect(dateIsoValide("2026-09-09")).toBe(true);
    expect(dateIsoValide("2024-02-29")).toBe(true);
    expect(dateIsoValide("2026-02-29")).toBe(false);
    expect(dateIsoValide("2026-9-9")).toBe(false);
  });
});

describe("suivi d'equipe : etapes ad hoc", () => {
  it("ajoute une etape ad hoc (X-1) apres son apresCode, assignee, avec journal", async () => {
    await creerDossierSuivi(repo, "S0302", "X");
    const r = await ajouterEtapeAdHocAuDossier(
      repo,
      "S0302",
      { phase: "BANQUE", libelle: " Relancer la banque ", apresCode: "BA2", assigneA: marie, echeance: "2026-09-20" },
      ctx,
    );
    expect(estErreur(r)).toBe(false);
    const d = await obtenirDossier(repo, "S0302");
    expect(d!.etapes).toHaveLength(N + 1);
    const idx = d!.etapes.findIndex((e) => e.code === "X-1");
    expect(d!.etapes[idx - 1]!.code).toBe("BA2");
    expect(d!.etapes[idx]).toMatchObject({
      libelle: "Relancer la banque",
      phase: "BANQUE",
      statut: "a_faire",
      adHoc: true,
      apresCode: "BA2",
      assigneA: marie,
      echeance: "2026-09-20",
      majPar: "Sekou",
    });
    expect(d!.journal.at(-1)).toEqual({ date: ctx.dateIso, auteur: "Sekou", texte: "Étape ajoutée X-1 : « Relancer la banque »" });
    // Elle survit a une relecture (reconciliation) et se pilote comme une canonique.
    const r2 = await changerStatutEtape(repo, "S0302", "X-1", "fait", ctx);
    expect(estErreur(r2)).toBe(false);
    expect((await obtenirDossier(repo, "S0302"))!.etapes.find((e) => e.code === "X-1")!.statut).toBe("fait");
  });

  it("refuse libelle trop court / trop long, phase inconnue, apresCode inconnu, echeance invalide, dossier introuvable", async () => {
    await creerDossierSuivi(repo, "S0302", "X");
    expect(estErreur(await ajouterEtapeAdHocAuDossier(repo, "S0302", { phase: "BANQUE", libelle: "ab" }, ctx))).toBe(true);
    expect(estErreur(await ajouterEtapeAdHocAuDossier(repo, "S0302", { phase: "BANQUE", libelle: "x".repeat(201) }, ctx))).toBe(true);
    expect(estErreur(await ajouterEtapeAdHocAuDossier(repo, "S0302", { phase: "NOPE" as never, libelle: "Valide" }, ctx))).toBe(true);
    expect(estErreur(await ajouterEtapeAdHocAuDossier(repo, "S0302", { phase: "BANQUE", libelle: "Valide", apresCode: "ZZ" }, ctx))).toBe(true);
    expect(estErreur(await ajouterEtapeAdHocAuDossier(repo, "S0302", { phase: "BANQUE", libelle: "Valide", echeance: "hier" }, ctx))).toBe(true);
    expect(estErreur(await ajouterEtapeAdHocAuDossier(repo, "S9999", { phase: "BANQUE", libelle: "Valide" }, ctx))).toBe(true);
    expect((await obtenirDossier(repo, "S0302"))!.etapes).toHaveLength(N);
  });

  it("supprime une ad hoc (journal) mais refuse une canonique", async () => {
    await creerDossierSuivi(repo, "S0302", "X");
    await ajouterEtapeAdHocAuDossier(repo, "S0302", { phase: "BANQUE", libelle: "Ad hoc" }, ctx);
    const refus = await supprimerEtapeAdHoc(repo, "S0302", "BA2", ctx);
    expect(refus).toEqual({ erreur: expect.stringMatching(/canonique/) });
    expect(estErreur(await supprimerEtapeAdHoc(repo, "S0302", "ZZ", ctx))).toBe(true);
    const ok = await supprimerEtapeAdHoc(repo, "S0302", "X-1", ctx);
    expect(estErreur(ok)).toBe(false);
    const d = await obtenirDossier(repo, "S0302");
    expect(d!.etapes).toHaveLength(N);
    expect(d!.journal.at(-1)!.texte).toBe("Étape supprimée X-1 : « Ad hoc »");
    // Le numero continue apres le plus haut code PRESENT : supprimer une ad hoc qui n'est pas la
    // derniere ne libere pas son numero. NB : le domaine ne garde pas de compteur ; si la DERNIERE
    // ad hoc est supprimee (liste vide ici), son numero est reattribue (X-1).
    await ajouterEtapeAdHocAuDossier(repo, "S0302", { phase: "BANQUE", libelle: "Deuxième" }, ctx);
    await ajouterEtapeAdHocAuDossier(repo, "S0302", { phase: "BANQUE", libelle: "Troisième" }, ctx);
    await supprimerEtapeAdHoc(repo, "S0302", "X-1", ctx);
    await ajouterEtapeAdHocAuDossier(repo, "S0302", { phase: "BANQUE", libelle: "Encore" }, ctx);
    const codes = (await obtenirDossier(repo, "S0302"))!.etapes.filter((e) => e.adHoc).map((e) => e.code);
    expect(codes).toEqual(["X-2", "X-3"]);
  });
});

describe("suivi d'equipe : definirEquipe / definirCadrage", () => {
  it("definirEquipe pose l'equipe, assigne par role les etapes libres, journalise", async () => {
    await creerDossierSuivi(repo, "S0302", "X");
    await assignerEtape(repo, "S0302", "CA1", sekou, ctx); // explicite, doit survivre sans forcer
    const d = await definirEquipe(repo, "S0302", { gestionnaire: marie, comptable: paul }, ctx);
    expect(d.equipe).toEqual({ gestionnaire: marie, comptable: paul });
    expect(d.etapes.find((e) => e.code === "CA1")!.assigneA).toEqual(sekou);
    expect(d.etapes.find((e) => e.code === "CA2")).toMatchObject({ assigneA: marie, majPar: "Sekou" });
    expect(d.etapes.find((e) => e.code === "BA7")!.assigneA).toEqual(paul);
    expect(d.etapes.find((e) => e.code === "CA6")!.assigneA).toBeUndefined(); // referent absent
    expect(d.journal.at(-1)!.texte).toBe("Équipe définie — Gestionnaire : Marie, Comptable : Paul");
    // Persiste.
    expect((await obtenirDossier(repo, "S0302"))!.equipe).toEqual({ gestionnaire: marie, comptable: paul });
  });

  it("definirEquipe avec forcer ecrase les assignations explicites ; personne invalide -> leve", async () => {
    await creerDossierSuivi(repo, "S0302", "X");
    await assignerEtape(repo, "S0302", "CA1", sekou, ctx);
    const d = await definirEquipe(repo, "S0302", { gestionnaire: marie }, ctx, { forcer: true });
    expect(d.etapes.find((e) => e.code === "CA1")!.assigneA).toEqual(marie);
    await expect(definirEquipe(repo, "S0302", { gestionnaire: { id: "", nom: "X" } }, ctx)).rejects.toThrow(/invalide/);
    await expect(definirEquipe(repo, "S9999", {}, ctx)).rejects.toThrow(/introuvable/);
  });

  it("definirCadrage : pose, efface (chaine vide), ignore undefined, refuse une date invalide", async () => {
    await creerDossierSuivi(repo, "S0302", "X", "1 rue A");
    let d = await definirCadrage(repo, "S0302", { sortant: " Foncia ", dateBascule: "2026-01-01" }, ctx);
    expect(d.sortant).toBe("Foncia");
    expect(d.dateBascule).toBe("2026-01-01");
    expect(d.adresse).toBe("1 rue A"); // undefined = intact
    expect(d.journal.at(-1)!.texte).toBe("Cadrage mis à jour : syndic sortant, date de bascule");

    d = await definirCadrage(repo, "S0302", { sortant: "", dateBascule: "", adresse: "2 rue B", nomUsuel: "  " }, ctx);
    expect("sortant" in d).toBe(false);
    expect("dateBascule" in d).toBe(false);
    expect(d.adresse).toBe("2 rue B");
    expect(d.nomUsuel).toBe("X"); // nom vide ignore

    await expect(definirCadrage(repo, "S0302", { dateBascule: "01/01/2026" }, ctx)).rejects.toThrow(/invalide/);
    // Aucun journal si rien n'est touche.
    const avant = (await obtenirDossier(repo, "S0302"))!.journal.length;
    await definirCadrage(repo, "S0302", {}, ctx);
    expect((await obtenirDossier(repo, "S0302"))!.journal).toHaveLength(avant);
  });
});
