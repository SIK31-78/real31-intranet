import { describe, expect, it } from "vitest";
import { calculerACompleter, estEcheanceAberrante, type ContexteACompleter, type ItemACompleter } from "./a-completer";
import type { Ascenseur, ContratCourant, Cycle } from "./types";

const AUJ = "2026-05-17";
const PARTENAIRES = ["Areas", "Dissoubray"];

function contrat(over: Partial<ContratCourant> = {}): ContratCourant {
  return {
    coproCode: "S0247",
    assurance: { compagnie: "AXA", numeroContrat: "123", courtier: "Courtier Dupont", souscriptionISO: "2020-03-01", echeanceISO: "2027-03-01", prime: 4250 },
    gaz: { fournisseur: "Engie", typePrix: "fixe", montant: 12_000, echeanceISO: "2027-01-01" },
    vmc: { societe: null, reference: null, dernierCtqISO: null },
    compteurs: { ascenseurs: 0, chaudieres: 0, vmcGaz: 0 },
    energieChauffage: "ELECTRICITE",
    devisRetenu: { ctq_ascenseur: null, ctq_vmc: null },
    ...over,
  };
}

function cycle(over: Partial<Cycle> = {}): Cycle {
  return { id: "c1", sujet: "assurance", coproCode: "S0247", statut: "en_cours", echeanceISO: "2027-03-01", etapes: {}, demarreManuellement: null, creeLeISO: "2026-01-01", ...over };
}

function ascenseur(over: Partial<Ascenseur> = {}): Ascenseur {
  return { id: "asc1", coproCode: "S0247", identifiant: "A1", dernierCtqISO: "2024-06-01", ...over };
}

function ctx(over: Partial<ContexteACompleter> = {}): ContexteACompleter {
  return {
    copro: { code: "S0247", nom: "LES MARRONNIERS", immatriculation: "AB1234567" },
    contrat: contrat(),
    cycles: [cycle()],
    ascenseurs: [],
    partenaires: PARTENAIRES,
    csAdresseConnue: true,
    aujourdhuiISO: AUJ,
    ...over,
  };
}

function cles(items: ItemACompleter[]): string[] {
  return items.map((i) => `${i.rubrique}/${i.champ}`);
}

describe("calculerACompleter", () => {
  it("une copro complète ne remonte rien", () => {
    expect(calculerACompleter(ctx())).toEqual([]);
  });

  it("assurance : échéance du cycle en cours et les quatre champs du contrat", () => {
    const items = calculerACompleter(
      ctx({
        contrat: contrat({ assurance: { compagnie: null, numeroContrat: null, courtier: null, souscriptionISO: null, echeanceISO: null, prime: null } }),
        cycles: [cycle({ echeanceISO: null })],
      }),
    );
    expect(cles(items)).toEqual(["assurance/echeanceISO", "assurance/compagnie", "assurance/numeroContrat", "assurance/souscriptionISO", "assurance/courtier"]);
    expect(items[0]).toMatchObject({ coproCode: "S0247", coproNom: "LES MARRONNIERS", sujet: "assurance", cycleId: "c1" });
  });

  it("assurance chez un courtier partenaire : rien à compléter, il s'en charge", () => {
    const items = calculerACompleter(
      ctx({
        contrat: contrat({ assurance: { compagnie: null, numeroContrat: null, courtier: "Areas", souscriptionISO: null, echeanceISO: null, prime: null } }),
        cycles: [cycle({ statut: "archive", echeanceISO: null })],
      }),
    );
    expect(items.filter((i) => i.rubrique === "assurance")).toEqual([]);
  });

  it("appareils : identifiant et date de dernier contrôle, fantômes ignorés sauf ascenseurs déclarés", () => {
    const base = ctx({ contrat: contrat({ compteurs: { ascenseurs: 2, chaudieres: 0, vmcGaz: 0 } }) });
    const items = calculerACompleter({
      ...base,
      ascenseurs: [ascenseur({ id: "a1", identifiant: null }), ascenseur({ id: "a2", dernierCtqISO: null })],
      cycles: [cycle(), cycle({ id: "k1", sujet: "ctq_ascenseur", ascenseurId: "a1", echeanceISO: "2029-06-01" }), cycle({ id: "k2", sujet: "ctq_ascenseur", ascenseurId: "a2", echeanceISO: null })],
    });
    expect(cles(items)).toEqual(["appareil/identifiant", "appareil/dernierCtqISO"]);
    expect(items[0]?.ascenseurId).toBe("a1");
    expect(items[1]?.ascenseurId).toBe("a2");
    expect(items[1]?.libelle).toContain("(A1)");

    // fiche totalement vide sur une copro qui ne déclare aucun ascenseur : un fantôme, pas une ligne
    const fantome = calculerACompleter(ctx({ ascenseurs: [ascenseur({ identifiant: null, dernierCtqISO: null })], cycles: [cycle()] }));
    expect(fantome.filter((i) => i.rubrique === "appareil")).toEqual([]);
  });

  it("VMC : un cycle en cours sans échéance", () => {
    const items = calculerACompleter(ctx({ contrat: contrat({ compteurs: { ascenseurs: 0, chaudieres: 0, vmcGaz: 1 } }), cycles: [cycle(), cycle({ id: "v1", sujet: "ctq_vmc", echeanceISO: null })] }));
    expect(cles(items)).toEqual(["ctq_vmc/echeanceISO"]);
    expect(items[0]?.cycleId).toBe("v1");
  });

  it("gaz : champs du contrat courant et échéance manquante ou dépassée, seulement avec un cycle gaz en cours", () => {
    const gazCtx = ctx({ contrat: contrat({ compteurs: { ascenseurs: 0, chaudieres: 1, vmcGaz: 0 }, energieChauffage: "GAZ", gaz: { fournisseur: null, typePrix: null, montant: null, echeanceISO: null } }) });
    expect(cles(calculerACompleter({ ...gazCtx, cycles: [cycle(), cycle({ id: "g1", sujet: "gaz", echeanceISO: null })] }))).toEqual([
      "gaz/fournisseur",
      "gaz/typePrix",
      "gaz/montant",
      "gaz/echeanceISO",
    ]);
    // contrat gaz complet, seule l'échéance du cycle est dépassée
    const depassee = calculerACompleter({
      ...gazCtx,
      contrat: contrat({ compteurs: { ascenseurs: 0, chaudieres: 1, vmcGaz: 0 }, energieChauffage: "GAZ" }),
      cycles: [cycle(), cycle({ id: "g1", sujet: "gaz", echeanceISO: "2026-01-15" })],
    });
    expect(depassee.filter((i) => i.rubrique === "gaz")).toEqual([expect.objectContaining({ champ: "echeanceISO", valeurActuelle: "2026-01-15", libelle: expect.stringContaining("dépassée (15/01/2026)") })]);
    // sans cycle gaz en cours : pas de ligne « gaz », mais « à démarrer »
    expect(cles(calculerACompleter({ ...gazCtx, cycles: [cycle()] }))).toEqual(["a_demarrer/demarrer"]);
  });

  it("compteurs : jamais renseignés (null), pas 0 ; et les incohérences", () => {
    const items = calculerACompleter(ctx({ contrat: contrat({ compteurs: { ascenseurs: null, chaudieres: 0, vmcGaz: null } }), ascenseurs: [ascenseur()] }));
    expect(cles(items)).toEqual(["compteur/ascenseurs", "compteur/vmcGaz", "compteur/ascenseurs", "a_demarrer/demarrer"]);
    expect(items[2]?.libelle).toMatch(/sans ascenseur mais 1 appareil est suivi/);
    expect(items[3]).toMatchObject({ sujet: "ctq_ascenseur", ascenseurId: "asc1" });
  });

  it("immatriculation : absente et pas « sans objet » ; conseil syndical sans adresse", () => {
    expect(cles(calculerACompleter(ctx({ copro: { code: "S0247", nom: "X" } })))).toEqual(["immatriculation/immatriculation"]);
    expect(cles(calculerACompleter(ctx({ copro: { code: "S0247", nom: "X", immatriculationNonApplicable: true } })))).toEqual([]);
    expect(cles(calculerACompleter(ctx({ csAdresseConnue: false })))).toEqual(["conseil_syndical/adresseCS"]);
  });

  it("à démarrer : sujet concerné sans cycle en cours, l'assurance exceptée", () => {
    const items = calculerACompleter(
      ctx({
        contrat: contrat({ compteurs: { ascenseurs: 1, chaudieres: 1, vmcGaz: 1 }, energieChauffage: "GAZ" }),
        cycles: [], // même pas d'assurance : pas de ligne « à démarrer » pour elle
        ascenseurs: [],
      }),
    );
    expect(items.filter((i) => i.rubrique === "a_demarrer").map((i) => i.sujet)).toEqual(["gaz", "ctq_vmc", "ctq_ascenseur"]);
    expect(items.find((i) => i.sujet === "ctq_ascenseur")?.libelle).toMatch(/aucun appareil créé/);
    expect(items.some((i) => i.rubrique === "a_demarrer" && i.sujet === "assurance")).toBe(false);
  });

  it("échéances aberrantes : avant deux ans en arrière ou après quinze ans en avant", () => {
    const items = calculerACompleter(
      ctx({
        cycles: [
          cycle({ id: "a", echeanceISO: "1930-01-01" }),
          cycle({ id: "b", sujet: "gaz", echeanceISO: "2045-01-01" }),
          cycle({ id: "c", sujet: "ctq_vmc", echeanceISO: "2024-06-01" }),
          cycle({ id: "d", sujet: "ctq_vmc", statut: "clos", echeanceISO: "1906-01-01" }),
        ],
        contrat: contrat({ compteurs: { ascenseurs: 0, chaudieres: 1, vmcGaz: 1 }, energieChauffage: "GAZ" }),
      }),
    );
    const aberrantes = items.filter((i) => i.rubrique === "echeance_aberrante");
    expect(aberrantes.map((i) => i.cycleId)).toEqual(["a", "b"]);
    expect(aberrantes[0]?.libelle).toContain("Assurance : échéance 01/01/1930");
    expect(aberrantes[0]?.valeurActuelle).toBe("1930-01-01");
  });
});

describe("estEcheanceAberrante", () => {
  it("bornes : aujourd'hui moins deux ans et plus quinze ans, inclusives", () => {
    expect(estEcheanceAberrante("2024-05-17", AUJ)).toBe(false);
    expect(estEcheanceAberrante("2024-05-16", AUJ)).toBe(true);
    expect(estEcheanceAberrante("2041-05-17", AUJ)).toBe(false);
    expect(estEcheanceAberrante("2041-05-18", AUJ)).toBe(true);
    expect(estEcheanceAberrante("n'importe quoi", AUJ)).toBe(true);
  });
});
