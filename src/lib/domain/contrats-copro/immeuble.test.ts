import { describe, expect, it } from "vitest";
import {
  appliquerCascades,
  batimentsAPrefiller,
  champsManquantsImmeuble,
  energiesPossibles,
  erreurBatiment,
  erreurFicheImmeuble,
  estImmeubleACompleter,
  lettreBatiment,
  repartirAscenseurs,
  resumeChauffage,
  resumeEcs,
  systemesChauffagePossibles,
  systemesEcsPossibles,
} from "./immeuble";
import type { Batiment, FicheImmeuble } from "./types";

function batiment(over: Partial<Batiment> = {}): Batiment {
  return { id: "b1", coproCode: "S0247", nom: "Bâtiment A", anneeConstruction: 1972, nombreEtages: 5, nombreAscenseurs: 1, etiquetteEnergie: "D", ...over };
}

function fiche(over: Partial<FicheImmeuble> = {}): FicheImmeuble {
  return {
    coproCode: "S0247",
    surfaceM2: 2400,
    anneeConstruction: 1972,
    periodeConstruction: "DE_1949_A_1974",
    nombreBatiments: 1,
    chauffageType: "COLLECTIF",
    chauffageEnergie: "GAZ",
    chauffageSysteme: "CHAUDIERE_CONDENSATION",
    ecsType: "COLLECTIF",
    ecsSysteme: null,
    ecsMemeQueChauffage: true,
    ventilationType: "COLLECTIF",
    ventilationSysteme: "MECANIQUE",
    bornesRechargeVE: "non",
    locauxVelos: "non_connue",
    dpeCollectifRealise: "oui",
    diagnosticStructureRealise: "non",
    pptInscritAG: null,
    pptVote: "oui",
    pptAdoptionISO: "2025-06-12",
    primeAssuranceActuelle: null,
    notes: null,
    batiments: [batiment()],
    ...over,
  };
}

describe("cascades du registre", () => {
  it("énergies : tout sans type, pas de réseau de chaleur en individuel, rien sans chauffage", () => {
    expect(energiesPossibles(null)).toHaveLength(8);
    expect(energiesPossibles("COLLECTIF")).toContain("RESEAU_CHALEUR");
    expect(energiesPossibles("INDIVIDUEL")).not.toContain("RESEAU_CHALEUR");
    expect(energiesPossibles("INDIVIDUEL")).toHaveLength(7);
    expect(energiesPossibles("SANS_CHAUFFAGE")).toEqual([]);
    expect(energiesPossibles("MIXTE_CHAUFFAGE_URBAIN")).toHaveLength(8);
  });

  it("systèmes de chauffage : la table du registre, famille par famille", () => {
    expect(systemesChauffagePossibles(null, "GAZ")).toHaveLength(13);
    expect(systemesChauffagePossibles("COLLECTIF", null)).toHaveLength(13);
    expect(systemesChauffagePossibles("COLLECTIF", "GAZ")).toEqual(["CHAUDIERE_STANDARD", "CHAUDIERE_BASSE_TEMPERATURE", "CHAUDIERE_CONDENSATION", "AUTRE"]);
    expect(systemesChauffagePossibles("COLLECTIF", "RESEAU_CHALEUR")).toEqual(["SOUS_STATION", "AUTRE"]);
    expect(systemesChauffagePossibles("COLLECTIF", "ELECTRICITE")).not.toContain("RADIATEURS_ELECTRIQUES");
    expect(systemesChauffagePossibles("INDIVIDUEL", "ELECTRICITE")).toContain("RADIATEURS_ELECTRIQUES");
    expect(systemesChauffagePossibles("INDIVIDUEL", "ELECTRICITE")).not.toContain("PAC_GEOTHERMIQUE");
    expect(systemesChauffagePossibles("MIXTE", "ELECTRICITE")).toHaveLength(7);
    expect(systemesChauffagePossibles("COLLECTIF_CHAUFFAGE_URBAIN", "BOIS")).toEqual(["CHAUDIERE_BIOMASSE", "AUTRE"]);
    expect(systemesChauffagePossibles("COLLECTIF", "AUTRE")).toHaveLength(13);
    expect(systemesChauffagePossibles("SANS_CHAUFFAGE", "GAZ")).toEqual([]);
  });

  it("systèmes d'ECS : individuel, collectif, mixte = union", () => {
    expect(systemesEcsPossibles(null)).toHaveLength(7);
    expect(systemesEcsPossibles("INDIVIDUEL")).toEqual(["CHAUFFE_EAU_THERMODYNAMIQUE", "BALLON_CUMULUS_ELECTRIQUE", "AUTRE"]);
    expect(systemesEcsPossibles("COLLECTIF")).toContain("RESEAU_CHAUFFAGE_URBAIN");
    expect(systemesEcsPossibles("COLLECTIF")).not.toContain("BALLON_CUMULUS_ELECTRIQUE");
    expect(systemesEcsPossibles("MIXTE")).toHaveLength(7);
  });
});

describe("appliquerCascades", () => {
  it("passer en individuel vide un réseau de chaleur et sa sous-station", () => {
    const actuelle = fiche({ chauffageEnergie: "RESEAU_CHALEUR", chauffageSysteme: "SOUS_STATION" });
    expect(appliquerCascades({ chauffageType: "INDIVIDUEL" }, actuelle)).toEqual({ chauffageType: "INDIVIDUEL", chauffageEnergie: null, chauffageSysteme: null });
  });

  it("changer l'énergie vide un système qui ne lui correspond plus, garde celui qui tient", () => {
    expect(appliquerCascades({ chauffageEnergie: "ELECTRICITE" }, fiche())).toEqual({ chauffageEnergie: "ELECTRICITE", chauffageSysteme: null });
    expect(appliquerCascades({ chauffageEnergie: "FIOUL" }, fiche())).toEqual({ chauffageEnergie: "FIOUL" });
  });

  it("sans chauffage : ni énergie ni système, et rien n'est ajouté si déjà vides", () => {
    expect(appliquerCascades({ chauffageType: "SANS_CHAUFFAGE" }, fiche())).toEqual({ chauffageType: "SANS_CHAUFFAGE", chauffageEnergie: null, chauffageSysteme: null });
    expect(appliquerCascades({ chauffageType: "SANS_CHAUFFAGE" }, fiche({ chauffageEnergie: null, chauffageSysteme: null }))).toEqual({ chauffageType: "SANS_CHAUFFAGE" });
  });

  it("un patch qui pose énergie et système incohérents ensemble est nettoyé", () => {
    expect(appliquerCascades({ chauffageType: "COLLECTIF", chauffageEnergie: "GAZ", chauffageSysteme: "RADIATEURS_ELECTRIQUES" }, null)).toEqual({
      chauffageType: "COLLECTIF",
      chauffageEnergie: "GAZ",
      chauffageSysteme: null,
    });
  });

  it("sans fiche existante, un patch cohérent passe tel quel", () => {
    const patch = { chauffageType: "INDIVIDUEL", chauffageEnergie: "ELECTRICITE", chauffageSysteme: "RADIATEURS_ELECTRIQUES", ecsType: "INDIVIDUEL", ecsSysteme: "BALLON_CUMULUS_ELECTRIQUE", ecsMemeQueChauffage: false, pptVote: "non" as const, pptInscritAG: "oui" as const };
    expect(appliquerCascades(patch, null)).toEqual(patch);
  });

  it("ECS identique au chauffage vide le système d'ECS ; un type d'ECS qui change vide un système étranger", () => {
    expect(appliquerCascades({ ecsMemeQueChauffage: true }, fiche({ ecsMemeQueChauffage: false, ecsSysteme: "CHAUDIERE" }))).toEqual({ ecsMemeQueChauffage: true, ecsSysteme: null });
    expect(appliquerCascades({ ecsType: "INDIVIDUEL" }, fiche({ ecsMemeQueChauffage: false, ecsSysteme: "CHAUDIERE" }))).toEqual({ ecsType: "INDIVIDUEL", ecsSysteme: null });
    expect(appliquerCascades({ ecsType: "MIXTE" }, fiche({ ecsMemeQueChauffage: false, ecsSysteme: "CHAUDIERE" }))).toEqual({ ecsType: "MIXTE" });
  });

  it("PPT : la date d'adoption tombe dès que le PPT n'est plus voté, la question AG ne vit que s'il ne l'est pas", () => {
    expect(appliquerCascades({ pptVote: "non" }, fiche())).toEqual({ pptVote: "non", pptAdoptionISO: null });
    expect(appliquerCascades({ pptVote: null }, fiche())).toEqual({ pptVote: null, pptAdoptionISO: null });
    expect(appliquerCascades({ pptVote: "oui", pptAdoptionISO: "2026-03-01" }, fiche({ pptVote: "non", pptAdoptionISO: null, pptInscritAG: "oui" }))).toEqual({ pptVote: "oui", pptAdoptionISO: "2026-03-01", pptInscritAG: null });
    // Une date envoyée avec un PPT non voté est ignorée (null), pas stockée.
    expect(appliquerCascades({ pptVote: "non", pptAdoptionISO: "2026-03-01" }, null)).toEqual({ pptVote: "non", pptAdoptionISO: null });
  });

  it("ne touche pas aux champs sans rapport", () => {
    expect(appliquerCascades({ surfaceM2: 1200, notes: "RDC commercial" }, fiche())).toEqual({ surfaceM2: 1200, notes: "RDC commercial" });
  });
});

describe("champsManquantsImmeuble", () => {
  it("une fiche complète ne manque de rien", () => {
    expect(champsManquantsImmeuble(fiche())).toEqual([]);
    expect(estImmeubleACompleter(fiche())).toBe(false);
  });

  it("sans fiche, tout manque (bâtiments compris), avec les libellés français", () => {
    const m = champsManquantsImmeuble(null);
    expect(m).toContain("Surface");
    expect(m).toContain("Type de chauffage");
    expect(m).toContain("Énergie de chauffage");
    expect(m).toContain("Bâtiments");
    expect(m).not.toContain("Notes");
    expect(m).not.toContain("Date d'adoption du PPT");
    expect(m).not.toContain("PPT inscrit à l'AG");
    expect(estImmeubleACompleter(null)).toBe(true);
  });

  it("respecte les masquages : sans chauffage, ECS identique, PPT voté ou non", () => {
    expect(champsManquantsImmeuble(fiche({ chauffageType: "SANS_CHAUFFAGE", chauffageEnergie: null, chauffageSysteme: null }))).toEqual([]);
    expect(champsManquantsImmeuble(fiche({ chauffageType: "COLLECTIF", chauffageSysteme: null }))).toEqual(["Système de chauffage"]);
    expect(champsManquantsImmeuble(fiche({ ecsMemeQueChauffage: false, ecsSysteme: null }))).toEqual(["Système d'ECS"]);
    expect(champsManquantsImmeuble(fiche({ ecsMemeQueChauffage: null }))).toEqual(["ECS identique au chauffage", "Système d'ECS"]);
    expect(champsManquantsImmeuble(fiche({ pptVote: "oui", pptAdoptionISO: null }))).toEqual(["Date d'adoption du PPT"]);
    expect(champsManquantsImmeuble(fiche({ pptVote: "non", pptAdoptionISO: null, pptInscritAG: null }))).toEqual(["PPT inscrit à l'AG"]);
    expect(champsManquantsImmeuble(fiche({ pptVote: "non", pptAdoptionISO: null, pptInscritAG: "non" }))).toEqual([]);
  });

  it("bâtiments : aucun, moins qu'annoncé, ou un incomplet", () => {
    expect(champsManquantsImmeuble(fiche({ batiments: [] }))).toEqual(["Bâtiments"]);
    expect(champsManquantsImmeuble(fiche({ nombreBatiments: 2 }))).toEqual(["Bâtiments"]);
    expect(champsManquantsImmeuble(fiche({ batiments: [batiment({ etiquetteEnergie: null })] }))).toEqual(["Bâtiments"]);
    expect(champsManquantsImmeuble(fiche({ nombreBatiments: null, batiments: [batiment()] }))).toEqual(["Nombre de bâtiments"]);
  });
});

describe("validation", () => {
  it("fiche : surface positive, année entre 1600 et l'année courante, bâtiments de 0 à 50", () => {
    expect(erreurFicheImmeuble({ surfaceM2: 0 }, 2026)).toMatch(/surface/i);
    expect(erreurFicheImmeuble({ anneeConstruction: 1599 }, 2026)).toMatch(/1600 à 2026/);
    expect(erreurFicheImmeuble({ anneeConstruction: 2027 }, 2026)).toMatch(/1600 à 2026/);
    expect(erreurFicheImmeuble({ anneeConstruction: 2026 }, 2026)).toBeNull();
    expect(erreurFicheImmeuble({ nombreBatiments: 51 }, 2026)).toMatch(/0 à 50/);
    expect(erreurFicheImmeuble({ surfaceM2: null, anneeConstruction: null }, 2026)).toBeNull();
  });

  it("bâtiment : nom obligatoire, étages 0 à 60", () => {
    expect(erreurBatiment({ nom: "  ", anneeConstruction: null, nombreEtages: null, nombreAscenseurs: null }, 2026)).toMatch(/nom/);
    expect(erreurBatiment({ nom: "A", anneeConstruction: null, nombreEtages: 61, nombreAscenseurs: null }, 2026)).toMatch(/0 à 60/);
    expect(erreurBatiment({ nom: "A", anneeConstruction: null, nombreEtages: -1, nombreAscenseurs: null }, 2026)).toMatch(/0 à 60/);
    expect(erreurBatiment({ nom: "A", anneeConstruction: 1850, nombreEtages: 60, nombreAscenseurs: 0 }, 2026)).toBeNull();
  });
});

describe("pré-remplissage des bâtiments", () => {
  it("lettres façon tableur", () => {
    expect([0, 1, 25, 26, 27, 51, 52].map(lettreBatiment)).toEqual(["A", "B", "Z", "AA", "AB", "AZ", "BA"]);
  });

  it("répartition des ascenseurs, les premiers servis", () => {
    expect(repartirAscenseurs(2, 1)).toEqual([2]);
    expect(repartirAscenseurs(2, 2)).toEqual([1, 1]);
    expect(repartirAscenseurs(3, 2)).toEqual([2, 1]);
    expect(repartirAscenseurs(0, 3)).toEqual([0, 0, 0]);
  });

  it("complète jusqu'au nombre annoncé, par position, sans toucher aux existants", () => {
    const nouveaux = batimentsAPrefiller({ coproCode: "S0247", nombreBatiments: 3, existants: 1, anneeConstruction: 1972, totalAscenseurs: 3 });
    expect(nouveaux.map((b) => b.nom)).toEqual(["Bâtiment B", "Bâtiment C"]);
    expect(nouveaux.map((b) => b.anneeConstruction)).toEqual([1972, 1972]);
    expect(nouveaux.map((b) => b.nombreAscenseurs)).toEqual([1, 1]);
    expect(batimentsAPrefiller({ coproCode: "S0247", nombreBatiments: null, existants: 0, anneeConstruction: null, totalAscenseurs: null })).toEqual([]);
    expect(batimentsAPrefiller({ coproCode: "S0247", nombreBatiments: 1, existants: 1, anneeConstruction: null, totalAscenseurs: null })).toEqual([]);
    expect(batimentsAPrefiller({ coproCode: "S0247", nombreBatiments: 1, existants: 0, anneeConstruction: null, totalAscenseurs: null })[0]).toMatchObject({ nom: "Bâtiment A", anneeConstruction: null, nombreAscenseurs: null });
  });
});

describe("résumés", () => {
  it("chauffage en une ligne", () => {
    expect(resumeChauffage(fiche())).toBe("Collectif, gaz naturel, chaudière à condensation");
    expect(resumeChauffage(fiche({ chauffageEnergie: "GPL", chauffageSysteme: null }))).toBe("Collectif, GPL propane ou butane");
    expect(resumeChauffage(fiche({ chauffageType: "SANS_CHAUFFAGE" }))).toBe("Sans chauffage");
    expect(resumeChauffage(fiche({ chauffageType: null, chauffageEnergie: null, chauffageSysteme: null }))).toBeNull();
  });

  it("ECS en une ligne", () => {
    expect(resumeEcs(fiche())).toBe("Collectif, identique au chauffage");
    expect(resumeEcs(fiche({ ecsMemeQueChauffage: false, ecsSysteme: "CHAUDIERE" }))).toBe("Collectif, chaudière");
  });
});
