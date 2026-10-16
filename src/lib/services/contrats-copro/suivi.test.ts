import { beforeEach, describe, expect, it, vi } from "vitest";

// Les gestes de suivi (REA-333) : terminale refusée hors clôture, effacement interdit sur la
// terminale, clôture gaz sans offre refusée, héritage sur le contrat, re-clôture qui ajuste le
// suivant, assurance sans offre, courtier partenaire qui archive, journal en panne sans effet.

import { AUTEUR, FausseBaseContrats } from "./fausse-base.test-util";

const etat = vi.hoisted(() => ({ base: null as unknown as { [k: string]: unknown }, partenaires: ["Areas", "Dissoubray"] as string[] }));

vi.mock("@/lib/observabilite", () => ({ signalerException: () => undefined }));
vi.mock("@/lib/services/coproprietes/exiger-perimetre", () => ({ exigerPerimetre: async () => undefined }));
vi.mock("@/lib/adapters/router", () => ({ getContratsCoproRepository: () => etat.base }));
// La liste des partenaires est doublée ; la comparaison par nom normalisé reste la vraie.
vi.mock("./lecture", async (importOriginal) => ({ ...(await importOriginal<typeof import("./lecture")>()), courtiersPartenaires: async () => etat.partenaires }));

import { cloturerCycle, corrigerContrat, creerAppareil, daterEtape, daterEtapeGroupee, definirEcheance, demarrerSuivi, modifierAppareil } from "./suivi";

const AUJOURDHUI = "2026-10-16";
let base: FausseBaseContrats;

beforeEach(() => {
  base = new FausseBaseContrats();
  etat.base = base as unknown as { [k: string]: unknown };
  etat.partenaires = ["Areas", "Dissoubray"];
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("daterEtape", () => {
  it("date une intermédiaire et journalise etape_datee", async () => {
    const c = base.ajouterCycle({ sujet: "assurance", coproCode: "S104", echeanceISO: "2027-03-01" });
    const r = await daterEtape({ coproCode: "S104", sujet: "assurance", cycleId: c.id, etape: "offres_demandees", dateISO: "2026-10-10", aujourdhuiISO: AUJOURDHUI }, AUTEUR);
    expect(r.etapes.offres_demandees).toBe("2026-10-10");
    expect(base.cycles[0].etapes.offres_demandees).toBe("2026-10-10");
    expect(base.journal.map((e) => e.type)).toEqual(["etape_datee"]);
    expect(base.journal[0].details).toEqual({ etape: "offres_demandees", dateISO: "2026-10-10" });
    expect(base.journal[0].parUserId).toBe("user-1");
  });

  it("refuse la terminale : c'est Clôturer qui la date", async () => {
    const c = base.ajouterCycle({ sujet: "gaz", coproCode: "S104" });
    await expect(daterEtape({ coproCode: "S104", sujet: "gaz", cycleId: c.id, etape: "validee", dateISO: "2026-10-10", aujourdhuiISO: AUJOURDHUI }, AUTEUR)).rejects.toThrow(/Clôturer/);
    expect(base.journal).toHaveLength(0);
  });

  it("refuse d'effacer la terminale, accepte d'effacer une intermédiaire", async () => {
    const c = base.ajouterCycle({ sujet: "ctq_vmc", coproCode: "S104", statut: "clos", etapes: { devis_demande: "2026-01-05", ctq_realise: "2026-02-01" } });
    await expect(daterEtape({ coproCode: "S104", sujet: "ctq_vmc", cycleId: c.id, etape: "ctq_realise", dateISO: null, aujourdhuiISO: AUJOURDHUI }, AUTEUR)).rejects.toThrow();
    const r = await daterEtape({ coproCode: "S104", sujet: "ctq_vmc", cycleId: c.id, etape: "devis_demande", dateISO: null, aujourdhuiISO: AUJOURDHUI }, AUTEUR);
    expect(r.etapes.devis_demande).toBeUndefined();
    expect(r.statut).toBe("clos"); // D9 : un cycle clos reste éditable sur ses intermédiaires
    expect(base.journal.at(-1)).toMatchObject({ type: "etape_effacee", details: { etape: "devis_demande", ancienneDateISO: "2026-01-05" } });
  });

  it("refuse une date future et un cycle d'une autre copro", async () => {
    const c = base.ajouterCycle({ sujet: "assurance", coproCode: "S104" });
    await expect(daterEtape({ coproCode: "S104", sujet: "assurance", cycleId: c.id, etape: "offres_recues", dateISO: "2026-10-17", aujourdhuiISO: AUJOURDHUI }, AUTEUR)).rejects.toThrow(/futur/);
    await expect(daterEtape({ coproCode: "S088", sujet: "assurance", cycleId: c.id, etape: "offres_recues", dateISO: "2026-10-10", aujourdhuiISO: AUJOURDHUI }, AUTEUR)).rejects.toThrow(/n'appartient pas/);
  });

  it("journal en panne : le geste est quand même écrit", async () => {
    const c = base.ajouterCycle({ sujet: "assurance", coproCode: "S104" });
    base.journalEnPanne = true;
    const r = await daterEtape({ coproCode: "S104", sujet: "assurance", cycleId: c.id, etape: "offres_recues", dateISO: "2026-10-10", aujourdhuiISO: AUJOURDHUI }, AUTEUR);
    expect(r.etapes.offres_recues).toBe("2026-10-10");
    expect(base.cycles[0].etapes.offres_recues).toBe("2026-10-10");
    expect(console.warn).toHaveBeenCalled();
  });
});

describe("daterEtapeGroupee", () => {
  it("date tous les CTQ ascenseur en cours, une ligne de journal par appareil", async () => {
    base.ajouterCycle({ sujet: "ctq_ascenseur", coproCode: "S104", ascenseurId: "a1" });
    base.ajouterCycle({ sujet: "ctq_ascenseur", coproCode: "S104", ascenseurId: "a2" });
    base.ajouterCycle({ sujet: "ctq_ascenseur", coproCode: "S104", ascenseurId: "a3", statut: "clos" });
    base.ajouterCycle({ sujet: "ctq_ascenseur", coproCode: "S088", ascenseurId: "b1" });
    const r = await daterEtapeGroupee({ coproCode: "S104", etape: "devis_demande", dateISO: "2026-10-01", aujourdhuiISO: AUJOURDHUI }, AUTEUR);
    expect(r.cycles.map((c) => c.ascenseurId)).toEqual(["a1", "a2"]);
    expect(base.journal).toHaveLength(2);
  });

  it("refuse la terminale et une copro sans contrôle en cours", async () => {
    await expect(daterEtapeGroupee({ coproCode: "S104", etape: "ctq_realise", dateISO: "2026-10-01", aujourdhuiISO: AUJOURDHUI }, AUTEUR)).rejects.toThrow(/Clôturer/);
    await expect(daterEtapeGroupee({ coproCode: "S104", etape: "devis_demande", dateISO: "2026-10-01", aujourdhuiISO: AUJOURDHUI }, AUTEUR)).rejects.toThrow(/Aucun contrôle/);
  });
});

describe("demarrerSuivi", () => {
  it("sort un cycle d'amorçage de l'état replié", async () => {
    const c = base.ajouterCycle({ sujet: "gaz", coproCode: "S104", demarreManuellement: null });
    const r = await demarrerSuivi({ coproCode: "S104", sujet: "gaz", cycleId: c.id }, AUTEUR);
    expect(r.demarreManuellement).toBe(true);
    expect(base.journal[0].type).toBe("suivi_demarre");
  });

  it("crée le premier cycle d'un sujet, refuse un second en cours", async () => {
    const r = await demarrerSuivi({ coproCode: "S104", sujet: "assurance", echeanceISO: "2027-01-01" }, AUTEUR);
    expect(r).toMatchObject({ sujet: "assurance", statut: "en_cours", echeanceISO: "2027-01-01", demarreManuellement: true });
    await expect(demarrerSuivi({ coproCode: "S104", sujet: "assurance" }, AUTEUR)).rejects.toThrow(/déjà en cours/);
  });

  it("CTQ ascenseur : appareil obligatoire, échéance déduite du dernier CTQ", async () => {
    await expect(demarrerSuivi({ coproCode: "S104", sujet: "ctq_ascenseur" }, AUTEUR)).rejects.toThrow(/appareil/);
    const a = await base.creerAscenseur({ coproCode: "S104", identifiant: "A", dernierCtqISO: "2023-06-15" });
    const r = await demarrerSuivi({ coproCode: "S104", sujet: "ctq_ascenseur", ascenseurId: a.id }, AUTEUR);
    expect(r.ascenseurId).toBe(a.id);
    expect(r.echeanceISO).toBe("2028-06-15");
  });
});

describe("definirEcheance", () => {
  it("assurance : l'échéance va sur le cycle ET sur le contrat courant", async () => {
    base.ajouterContrat("S104");
    const c = base.ajouterCycle({ sujet: "assurance", coproCode: "S104" });
    await definirEcheance({ coproCode: "S104", sujet: "assurance", cycleId: c.id, echeanceISO: "2027-04-01" }, AUTEUR);
    expect(base.cycles[0].echeanceISO).toBe("2027-04-01");
    expect(base.contrats.get("S104")?.assurance.echeanceISO).toBe("2027-04-01");
    expect(base.journal[0]).toMatchObject({ type: "contrat_corrige", details: { champ: "echeance", avant: null, apres: "2027-04-01" } });
  });

  it("CTQ : le contrat courant n'est pas touché", async () => {
    const c = base.ajouterCycle({ sujet: "ctq_vmc", coproCode: "S104" });
    await definirEcheance({ coproCode: "S104", sujet: "ctq_vmc", cycleId: c.id, echeanceISO: "2029-01-01" }, AUTEUR);
    expect(base.contrats.size).toBe(0);
  });
});

describe("cloturerCycle", () => {
  it("gaz sans offre : refusé, rien n'est écrit", async () => {
    base.ajouterContrat("S104");
    const c = base.ajouterCycle({ sujet: "gaz", coproCode: "S104" });
    await expect(cloturerCycle({ coproCode: "S104", sujet: "gaz", cycleId: c.id, dateTerminaleISO: "2026-10-01", aujourdhuiISO: AUJOURDHUI }, AUTEUR)).rejects.toThrow(/offre retenue/);
    expect(base.cycles[0].statut).toBe("en_cours");
    expect(base.journal).toHaveLength(0);
  });

  it("gaz avec offre : cycle clos, suivant à validation + durée, contrat hérité, deux lignes de journal", async () => {
    base.ajouterContrat("S104");
    const c = base.ajouterCycle({ sujet: "gaz", coproCode: "S104", etapes: { devis_demande: "2026-08-01" } });
    const o = await base.creerOffreGaz({ cycleId: c.id, fournisseur: "Engie", typePrix: "fixe", montant: 12_000, dureeMois: 24, recueLeISO: null });
    const r = await cloturerCycle({ coproCode: "S104", sujet: "gaz", cycleId: c.id, dateTerminaleISO: "2026-10-01", aujourdhuiISO: AUJOURDHUI, offreRetenueId: o.id }, AUTEUR);
    expect(r.clos).toMatchObject({ statut: "clos", offreRetenueId: o.id, etapes: { devis_demande: "2026-08-01", validee: "2026-10-01" } });
    expect(r.suivant).toMatchObject({ statut: "en_cours", echeanceISO: "2028-10-01", etapes: {} });
    expect(base.contrats.get("S104")?.gaz).toEqual({ fournisseur: "Engie", typePrix: "fixe", montant: 12_000, echeanceISO: "2028-10-01" });
    expect(base.journal.map((e) => e.type)).toEqual(["cycle_clos", "offre_retenue"]);
    expect(base.journal[0].details).toEqual({ dateTerminaleISO: "2026-10-01", echeanceSuivanteISO: "2028-10-01", offre: "Engie" });
  });

  it("re-clôture : le suivant existant n'est qu'ajusté, aucun doublon", async () => {
    base.ajouterContrat("S104");
    const c = base.ajouterCycle({ sujet: "gaz", coproCode: "S104", statut: "clos", etapes: { validee: "2026-09-01" }, offreRetenueId: "x" });
    const suivant = base.ajouterCycle({ sujet: "gaz", coproCode: "S104", echeanceISO: "2027-09-01", etapes: { devis_demande: "2026-09-20" } });
    const o = await base.creerOffreGaz({ cycleId: c.id, fournisseur: "TotalEnergies", typePrix: "variable", montant: 9_000, dureeMois: 12, recueLeISO: null });
    const r = await cloturerCycle({ coproCode: "S104", sujet: "gaz", cycleId: c.id, dateTerminaleISO: "2026-10-01", aujourdhuiISO: AUJOURDHUI, offreRetenueId: o.id }, AUTEUR);
    expect(base.cycles).toHaveLength(2);
    expect(r.suivant?.id).toBe(suivant.id);
    expect(r.suivant?.echeanceISO).toBe("2027-10-01");
    expect(r.suivant?.etapes).toEqual({ devis_demande: "2026-09-20" }); // D4 : ses étapes sont des faits
    expect(base.journal[0].type).toBe("cycle_recloture");
  });

  it("re-clôture refusée sur un cycle clos plus ancien quand un clos plus récent existe", async () => {
    base.ajouterContrat("S104");
    const vieux = base.ajouterCycle({ sujet: "ctq_vmc", coproCode: "S104", statut: "clos", etapes: { ctq_realise: "2016-06-01" } });
    const recent = base.ajouterCycle({ sujet: "ctq_vmc", coproCode: "S104", statut: "clos", etapes: { ctq_realise: "2021-06-01" } });
    const enCours = base.ajouterCycle({ sujet: "ctq_vmc", coproCode: "S104", echeanceISO: "2026-06-01" });
    await expect(cloturerCycle({ coproCode: "S104", sujet: "ctq_vmc", cycleId: vieux.id, dateTerminaleISO: "2016-06-15", aujourdhuiISO: AUJOURDHUI }, AUTEUR)).rejects.toThrow("Seul le dernier cycle clos peut être re-clôturé.");
    expect(base.cycles.find((c) => c.id === enCours.id)?.echeanceISO).toBe("2026-06-01");
    expect(base.journal).toHaveLength(0);
    // Le dernier clos, lui, se re-clôture : l'échéance du cycle en cours suit.
    const r = await cloturerCycle({ coproCode: "S104", sujet: "ctq_vmc", cycleId: recent.id, dateTerminaleISO: "2021-07-01", aujourdhuiISO: AUJOURDHUI }, AUTEUR);
    expect(r.suivant?.id).toBe(enCours.id);
    expect(r.suivant?.echeanceISO).toBe("2026-07-01");
    expect(base.cycles).toHaveLength(3);
  });

  it("re-clôture refusée quand le cycle clos n'a aucun suivant créé après lui (incohérence), un en cours antérieur n'est pas pris pour suivant", async () => {
    base.ajouterContrat("S104");
    const anterieur = base.ajouterCycle({ sujet: "ctq_vmc", coproCode: "S104", echeanceISO: "2027-01-01" });
    const clos = base.ajouterCycle({ sujet: "ctq_vmc", coproCode: "S104", statut: "clos", etapes: { ctq_realise: "2021-06-01" } });
    await expect(cloturerCycle({ coproCode: "S104", sujet: "ctq_vmc", cycleId: clos.id, dateTerminaleISO: "2021-07-01", aujourdhuiISO: AUJOURDHUI }, AUTEUR)).rejects.toThrow(/incohérent/);
    expect(base.cycles).toHaveLength(2);
    expect(base.cycles.find((c) => c.id === anterieur.id)?.echeanceISO).toBe("2027-01-01");
    expect(base.journal).toHaveLength(0);
  });

  it("CTQ ascenseur : la re-clôture ne regarde que les cycles du MÊME appareil", async () => {
    const a = await base.creerAscenseur({ coproCode: "S104", identifiant: "A", dernierCtqISO: "2021-05-01" });
    const b = await base.creerAscenseur({ coproCode: "S104", identifiant: "B", dernierCtqISO: "2023-05-01" });
    const closA = base.ajouterCycle({ sujet: "ctq_ascenseur", coproCode: "S104", ascenseurId: a.id, statut: "clos", etapes: { ctq_realise: "2021-05-01" } });
    const suivantA = base.ajouterCycle({ sujet: "ctq_ascenseur", coproCode: "S104", ascenseurId: a.id, echeanceISO: "2026-05-01" });
    base.ajouterCycle({ sujet: "ctq_ascenseur", coproCode: "S104", ascenseurId: b.id, statut: "clos", etapes: { ctq_realise: "2023-05-01" } });
    base.ajouterCycle({ sujet: "ctq_ascenseur", coproCode: "S104", ascenseurId: b.id, echeanceISO: "2028-05-01" });
    const r = await cloturerCycle({ coproCode: "S104", sujet: "ctq_ascenseur", cycleId: closA.id, dateTerminaleISO: "2021-06-01", aujourdhuiISO: AUJOURDHUI }, AUTEUR);
    expect(r.suivant?.id).toBe(suivantA.id);
    expect(r.suivant?.echeanceISO).toBe("2026-06-01");
    expect(base.ascenseurs.find((x) => x.id === a.id)?.dernierCtqISO).toBe("2021-06-01");
  });

  it("assurance sans offre : reconduction, l'échéance saisie va sur la copro, compagnie inchangée", async () => {
    base.ajouterContrat("S104", { assurance: { compagnie: "AXA", numeroContrat: "N-1" } });
    const c = base.ajouterCycle({ sujet: "assurance", coproCode: "S104" });
    await expect(cloturerCycle({ coproCode: "S104", sujet: "assurance", cycleId: c.id, dateTerminaleISO: "2026-10-01", aujourdhuiISO: AUJOURDHUI }, AUTEUR)).rejects.toThrow(/échéance/);
    const r = await cloturerCycle({ coproCode: "S104", sujet: "assurance", cycleId: c.id, dateTerminaleISO: "2026-10-01", aujourdhuiISO: AUJOURDHUI, echeanceSaisieISO: "2027-10-01" }, AUTEUR);
    expect(r.clos.offreRetenueId).toBeNull();
    expect(r.suivant?.echeanceISO).toBe("2027-10-01");
    expect(base.contrats.get("S104")?.assurance).toMatchObject({ compagnie: "AXA", numeroContrat: "N-1", echeanceISO: "2027-10-01" });
    expect(base.journal.map((e) => e.type)).toEqual(["cycle_clos"]);
  });

  it("assurance avec offre et numéro : la compagnie et le numéro suivent", async () => {
    base.ajouterContrat("S104", { assurance: { compagnie: "AXA" } });
    const c = base.ajouterCycle({ sujet: "assurance", coproCode: "S104" });
    const o = await base.creerOffreAssurance({ cycleId: c.id, assureur: "Allianz", prime: 4_250, franchise: 500, garanties: null, recueLeISO: null });
    await cloturerCycle({ coproCode: "S104", sujet: "assurance", cycleId: c.id, dateTerminaleISO: "2026-10-01", aujourdhuiISO: AUJOURDHUI, echeanceSaisieISO: "2027-10-01", offreRetenueId: o.id, numeroContrat: " P-77 " }, AUTEUR);
    expect(base.contrats.get("S104")?.assurance).toMatchObject({ compagnie: "Allianz", numeroContrat: "P-77", echeanceISO: "2027-10-01" });
    expect(base.cycles[0].offreRetenueId).toBe(o.id);
    expect(base.journal.at(-1)).toMatchObject({ type: "offre_retenue", details: { fournisseur: "Allianz", montant: 4_250 } });
  });

  it("CTQ ascenseur : l'appareil reçoit la date du contrôle, le suivant est à cinq ans", async () => {
    const a = await base.creerAscenseur({ coproCode: "S104", identifiant: "A", dernierCtqISO: "2021-05-01" });
    const c = base.ajouterCycle({ sujet: "ctq_ascenseur", coproCode: "S104", ascenseurId: a.id, echeanceISO: "2026-05-01" });
    const r = await cloturerCycle({ coproCode: "S104", sujet: "ctq_ascenseur", cycleId: c.id, dateTerminaleISO: "2026-06-10", aujourdhuiISO: AUJOURDHUI }, AUTEUR);
    expect(r.suivant).toMatchObject({ ascenseurId: a.id, echeanceISO: "2031-06-10" });
    expect(base.ascenseurs[0].dernierCtqISO).toBe("2026-06-10");
  });

  it("CTQ VMC : la date du contrôle est reportée sur la copro", async () => {
    base.ajouterContrat("S104");
    const c = base.ajouterCycle({ sujet: "ctq_vmc", coproCode: "S104" });
    await cloturerCycle({ coproCode: "S104", sujet: "ctq_vmc", cycleId: c.id, dateTerminaleISO: "2026-06-10", aujourdhuiISO: AUJOURDHUI }, AUTEUR);
    expect(base.contrats.get("S104")?.vmc.dernierCtqISO).toBe("2026-06-10");
  });
});

describe("corrigerContrat", () => {
  it("journalise champ par champ, avec avant / après, et ignore ce qui ne change pas", async () => {
    base.ajouterContrat("S104", { gaz: { fournisseur: "Engie" }, compteurs: { ascenseurs: 2 } });
    await corrigerContrat({ coproCode: "S104", patch: { gaz: { fournisseur: "Engie", montant: 8_000 }, compteurs: { ascenseurs: 3 } } }, AUTEUR);
    expect(base.contrats.get("S104")?.gaz.montant).toBe(8_000);
    expect(base.journal.map((e) => e.details)).toEqual([
      { champ: "montant du contrat gaz", avant: null, apres: 8_000 },
      { champ: "nombre d'ascenseurs", avant: 2, apres: 3 },
    ]);
  });

  it("courtier partenaire : le cycle assurance en cours est archivé (sauf démarré à la main)", async () => {
    base.ajouterContrat("S104");
    const amorce = base.ajouterCycle({ sujet: "assurance", coproCode: "S104", demarreManuellement: null });
    const manuel = base.ajouterCycle({ sujet: "assurance", coproCode: "S088", demarreManuellement: true });
    await corrigerContrat({ coproCode: "S104", patch: { assurance: { courtier: "Areas" } } }, AUTEUR);
    expect(base.cycles.find((c) => c.id === amorce.id)?.statut).toBe("archive");
    expect(base.cycles.find((c) => c.id === manuel.id)?.statut).toBe("en_cours");
    expect(base.journal.map((e) => e.type)).toEqual(["contrat_corrige", "suivi_archive"]);
    expect(base.journal[1].details).toEqual({ raison: "courtier partenaire (Areas)" });
  });

  it("courtier libre : rien n'est archivé", async () => {
    base.ajouterContrat("S104");
    base.ajouterCycle({ sujet: "assurance", coproCode: "S104" });
    await corrigerContrat({ coproCode: "S104", patch: { assurance: { courtier: "Cabinet Dupont" } } }, AUTEUR);
    expect(base.cycles[0].statut).toBe("en_cours");
  });

  it("courtier partenaire par nom normalisé : « AREAS » archive quand le partenaire s'écrit « Areas »", async () => {
    base.ajouterContrat("S104");
    const amorce = base.ajouterCycle({ sujet: "assurance", coproCode: "S104" });
    await corrigerContrat({ coproCode: "S104", patch: { assurance: { courtier: " AREAS " } } }, AUTEUR);
    expect(base.cycles.find((c) => c.id === amorce.id)?.statut).toBe("archive");
    expect(base.journal.map((e) => e.type)).toEqual(["contrat_corrige", "suivi_archive"]);
    expect(base.journal[1].details).toEqual({ raison: "courtier partenaire (AREAS)" });
  });

  it("refuse une souscription d'assurance ou un dernier contrôle VMC dans le futur ; une échéance future reste permise", async () => {
    base.ajouterContrat("S104");
    await expect(corrigerContrat({ coproCode: "S104", patch: { assurance: { souscriptionISO: "2026-10-17" } }, aujourdhuiISO: AUJOURDHUI }, AUTEUR)).rejects.toThrow(/souscription.*futur/);
    await expect(corrigerContrat({ coproCode: "S104", patch: { vmc: { dernierCtqISO: "2027-01-01" } }, aujourdhuiISO: AUJOURDHUI }, AUTEUR)).rejects.toThrow(/contrôle VMC.*futur/);
    expect(base.journal).toHaveLength(0);
    await corrigerContrat({ coproCode: "S104", patch: { assurance: { souscriptionISO: "2026-10-16", echeanceISO: "2027-10-16" }, vmc: { dernierCtqISO: "2026-10-01" } }, aujourdhuiISO: AUJOURDHUI }, AUTEUR);
    expect(base.contrats.get("S104")?.assurance).toMatchObject({ souscriptionISO: "2026-10-16", echeanceISO: "2027-10-16" });
    expect(base.contrats.get("S104")?.vmc.dernierCtqISO).toBe("2026-10-01");
  });
});

describe("appareils", () => {
  it("créer un appareil ouvre son cycle CTQ à dernier CTQ + 5 ans", async () => {
    const a = await creerAppareil({ coproCode: "S104", identifiant: " ASC-1 ", dernierCtqISO: "2024-03-31" }, AUTEUR);
    expect(a.identifiant).toBe("ASC-1");
    expect(base.cycles).toHaveLength(1);
    expect(base.cycles[0]).toMatchObject({ sujet: "ctq_ascenseur", ascenseurId: a.id, echeanceISO: "2029-03-31", demarreManuellement: true });
    expect(base.journal[0]).toMatchObject({ type: "appareil_cree", details: { identifiant: "ASC-1" } });
  });

  it("modifier le dernier CTQ recalcule l'échéance d'un cycle vierge, pas d'un cycle entamé", async () => {
    const a = await creerAppareil({ coproCode: "S104", dernierCtqISO: "2024-03-31" }, AUTEUR);
    await modifierAppareil({ coproCode: "S104", ascenseurId: a.id, dernierCtqISO: "2025-01-15" }, AUTEUR);
    expect(base.cycles[0].echeanceISO).toBe("2030-01-15");
    base.cycles[0].etapes = { devis_demande: "2026-01-01" };
    await modifierAppareil({ coproCode: "S104", ascenseurId: a.id, dernierCtqISO: "2025-06-01" }, AUTEUR);
    expect(base.cycles[0].echeanceISO).toBe("2030-01-15");
    expect(base.ascenseurs[0].dernierCtqISO).toBe("2025-06-01");
    expect(base.journal.filter((e) => e.type === "appareil_modifie")).toHaveLength(2);
  });

  it("refuse un dernier CTQ dans le futur (un contrôle est un fait passé)", async () => {
    const a = await creerAppareil({ coproCode: "S104", dernierCtqISO: "2024-03-31" }, AUTEUR);
    await expect(modifierAppareil({ coproCode: "S104", ascenseurId: a.id, dernierCtqISO: "2026-10-17", aujourdhuiISO: AUJOURDHUI }, AUTEUR)).rejects.toThrow(/futur/);
    expect(base.ascenseurs[0].dernierCtqISO).toBe("2024-03-31");
    await modifierAppareil({ coproCode: "S104", ascenseurId: a.id, dernierCtqISO: "2026-10-16", aujourdhuiISO: AUJOURDHUI }, AUTEUR);
    expect(base.ascenseurs[0].dernierCtqISO).toBe("2026-10-16");
  });
});
