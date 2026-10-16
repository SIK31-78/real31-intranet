import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContratCourant, NouvelleEntreeJournal, OffreGaz } from "@/lib/domain/contrats-copro";
import type { ModeleMailStocke } from "@/lib/domain/modeles-mail";
import type { SuiviCopro } from "./types";

// Le mail au conseil syndical : aperçu (modèle, repli, destinataires, avertissements) et envoi
// (refus, recomposition du HTML depuis le texte relu, journal).

const etat = vi.hoisted(() => ({
  modeles: [] as ModeleMailStocke[],
  modelesKo: false,
  conseil: { source: "estale" as "estale" | "crypto" | "aucune", emails: [] as string[] },
  suivi: null as SuiviCopro | null,
  perimetreRefuse: false,
  envois: [] as Record<string, unknown>[],
  journal: [] as NouvelleEntreeJournal[],
  signature: "<p>Sekou</p>" as string | null,
}));

vi.mock("@/lib/observabilite", () => ({ signalerException: () => undefined }));
vi.mock("./journal", () => ({
  journaliser: async (e: NouvelleEntreeJournal) => {
    etat.journal.push(e);
  },
}));
vi.mock("./lecture", () => ({ suiviDeCopro: async () => etat.suivi }));
vi.mock("@/lib/services/coproprietes/exiger-perimetre", () => ({
  exigerPerimetre: async () => {
    if (etat.perimetreRefuse) throw new Error("Copropriété hors du périmètre du gestionnaire.");
  },
}));
vi.mock("@/lib/services/coproprietes/perimetre-lecture", () => ({
  coproEnLecture: async (code: string) => (code === "S0247" ? { code, nom: "LES MARRONNIERS", managerId: "g1", assistantId: "g2" } : null),
}));
vi.mock("@/lib/services/coproprietes/destinataires-conseil", () => ({ destinatairesConseilSyndical: async () => etat.conseil }));
vi.mock("@/lib/adapters/router", () => ({
  getModeleMailRepository: () => ({
    listerTous: async () => {
      if (etat.modelesKo) throw new Error("PGRST205 table absente");
      return etat.modeles;
    },
  }),
  getGestionnaireRepository: () => ({
    findById: async (id: string) => ({ g1: { id, email: "gest@real31.fr" }, g2: { id, email: "assist@real31.fr" } })[id] ?? null,
  }),
  getSignatureProvider: () => ({ getSignatureHtml: async () => etat.signature }),
  getMailOutboundProvider: () => ({
    async envoyerNeuf(p: Record<string, unknown>) {
      etat.envois.push(p);
    },
  }),
}));

import { envoyerMailCs, preparerMailCs } from "./mail-cs";

const AUTEUR = { id: "u1", nom: "Sekou KOMA", email: "sekou@real31.fr" };
const NBSP = " ";

const CONTRAT: ContratCourant = {
  coproCode: "S0247",
  assurance: { compagnie: "AXA", numeroContrat: null, courtier: null, souscriptionISO: null, echeanceISO: "2027-03-01", prime: 4250 },
  gaz: { fournisseur: "ENGIE", typePrix: "fixe", montant: 12000, echeanceISO: "2026-12-31" },
  vmc: { societe: null, reference: null, dernierCtqISO: null },
  compteurs: { ascenseurs: 0, chaudieres: 1, vmcGaz: 0 },
  energieChauffage: "GAZ",
  immatriculation: { numero: null, nonApplicable: null },
  devisRetenu: { ctq_ascenseur: null, ctq_vmc: "d2" },
};

const offreGaz = (over: Partial<OffreGaz> = {}): OffreGaz => ({ id: "og1", cycleId: "cg", fournisseur: "TotalEnergies", typePrix: "variable", montant: 11000, dureeMois: 24, recueLeISO: "2026-05-02", ...over });

function cycleVue(id: string, sujet: "gaz" | "assurance" | "ctq_vmc", over: Record<string, unknown> = {}) {
  return {
    cycle: { id, sujet, coproCode: "S0247", statut: "en_cours", echeanceISO: "2026-12-31", etapes: {}, demarreManuellement: null, creeLeISO: "2026-01-01", ...over },
    niveau: "vert",
    progression: { franchies: 0, total: 3, etapeCourante: null },
    aDemarrer: false,
    joursSansAvancement: null,
  } as unknown as SuiviCopro["gaz"]["cycles"][number];
}

function suivi(over: Partial<SuiviCopro> = {}): SuiviCopro {
  return {
    coproCode: "S0247",
    coproNom: "LES MARRONNIERS",
    contrat: CONTRAT,
    regles: {} as SuiviCopro["regles"],
    assurance: { concerne: true, courtierPartenaire: false, cycles: [], offres: [], documents: [] },
    gaz: { concerne: true, cycles: [cycleVue("cg", "gaz", { offreRetenueId: "og2" })], offres: [offreGaz(), offreGaz({ id: "og2", fournisseur: "Engie", typePrix: "fixe", montant: 10500 }), offreGaz({ id: "vieux", cycleId: "ancien", fournisseur: "Ancien cycle" })], documents: [] },
    ctqAscenseur: { concerne: false, appareils: [], devis: [], devisRetenuId: null, documents: [] },
    ctqVmc: {
      concerne: true,
      cycles: [cycleVue("cv", "ctq_vmc")],
      devis: [
        { id: "d1", coproCode: "S0247", sujet: "ctq_vmc", prestataire: "Dekra", montant: 600, recueLeISO: "2026-04-01" },
        { id: "d2", coproCode: "S0247", sujet: "ctq_vmc", prestataire: "Socotec", montant: 540, recueLeISO: "2026-04-03" },
      ],
      devisRetenuId: "d2",
      documents: [],
    },
    prestataires: [],
    journal: [],
    peutEcrire: true,
    depotActif: false,
    mailActif: true,
    niveauGlobal: "vert",
    ...over,
  };
}

const modele = (over: Partial<ModeleMailStocke> = {}): ModeleMailStocke => ({
  id: "m-gaz",
  titre: "Contrats : comparatif des offres gaz",
  sujet: "Renouvellement du contrat gaz - {{copro_nom}} ({{copro_code}}) - Comparatif des offres",
  corps: "Bonjour,\n\nContrat actuel\n- Fournisseur : {{contrat_actuel_fournisseur}}\n- Échéance : {{contrat_actuel_echeance}}\n\nOffres reçues\n{{offres}}\n\nNous restons à votre disposition.",
  agence: null,
  actif: true,
  ...over,
});

beforeEach(() => {
  etat.modeles = [];
  etat.modelesKo = false;
  etat.conseil = { source: "estale", emails: ["pres@gmail.com", "gest@real31.fr"] };
  etat.suivi = suivi();
  etat.perimetreRefuse = false;
  etat.envois = [];
  etat.journal = [];
  etat.signature = "<p>Sekou</p>";
  vi.stubEnv("MAIL_SOURCE", "graph");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("preparerMailCs", () => {
  it("sans modèle en base -> texte de secours, marqueur gardé, avertissement « modèle à créer »", async () => {
    const a = await preparerMailCs({ coproCode: "S0247", sujet: "gaz", variante: "comparatif" }, AUTEUR);
    expect(a.modeleId).toBeNull();
    expect(a.modeles).toEqual([]);
    expect(a.objet).toBe("LES MARRONNIERS (S0247) - Comparatif des offres gaz");
    expect(a.corpsTexte).toContain("{{offres}}");
    expect(a.corpsHtml).toContain("<table");
    expect(a.corpsHtml).toContain("Engie (retenue)");
    expect(a.avertissements).toContainEqual("Modèle « Contrats : comparatif des offres gaz » absent : texte de secours utilisé, modèle à créer dans /admin/modeles-mail.");
  });

  it("table des modèles absente (SQL pas passé) -> même repli, pas de plantage", async () => {
    etat.modelesKo = true;
    const a = await preparerMailCs({ coproCode: "S0247", sujet: "gaz", variante: "comparatif" }, AUTEUR);
    expect(a.modeleId).toBeNull();
    expect(a.avertissements.some((x) => x.includes("texte de secours"))).toBe(true);
  });

  it("avec le modèle du seed : variables remplies, tableau du cycle en cours seulement, destinataires et signature", async () => {
    etat.modeles = [modele(), modele({ id: "autre", titre: "Relance du conseil syndical" }), modele({ id: "inactif", titre: "Contrats : devis VMC gaz", actif: false })];
    const a = await preparerMailCs({ coproCode: "S0247", sujet: "gaz", variante: "comparatif" }, AUTEUR);
    expect(a.modeleId).toBe("m-gaz");
    expect(a.modeles).toEqual([{ id: "m-gaz", titre: "Contrats : comparatif des offres gaz" }]);
    expect(a.objet).toBe("Renouvellement du contrat gaz - LES MARRONNIERS (S0247) - Comparatif des offres");
    expect(a.corpsTexte).toContain("- Fournisseur : ENGIE");
    expect(a.corpsTexte).toContain("- Échéance : 31/12/2026");
    expect(a.corpsHtml).toContain("TotalEnergies");
    expect(a.corpsHtml).not.toContain("Ancien cycle");
    expect(a.tableauTexte).toContain(`- Engie (retenue) : type de prix Fixe, montant 10${NBSP}500${NBSP}€`);
    expect(a.a).toEqual(["pres@gmail.com"]);
    expect(a.cc).toEqual(["gest@real31.fr", "assist@real31.fr"]);
    expect(a.sourceDestinataires).toBe("estale");
    expect(a.signatureHtml).toBe("<p>Sekou</p>");
    expect(a.avertissements).toEqual([]);
  });

  it("modèle demandé explicitement -> il prime sur le titre attendu", async () => {
    etat.modeles = [modele(), modele({ id: "perso", titre: "Contrats : ma variante gaz", sujet: "Objet perso", corps: "Perso {{offres}}" })];
    const a = await preparerMailCs({ coproCode: "S0247", sujet: "gaz", variante: "comparatif", modeleId: "perso" }, AUTEUR);
    expect(a.modeleId).toBe("perso");
    expect(a.objet).toBe("Objet perso");
  });

  it("devis unique VMC : le devis retenu dans les variables, pas de tableau", async () => {
    etat.modeles = [modele({ id: "m-vmc", titre: "Contrats : devis VMC gaz", sujet: "{{copro_nom}} - VMC", corps: "Prestataire : {{devis_prestataire}}\nMontant : {{devis_montant}}" })];
    const a = await preparerMailCs({ coproCode: "S0247", sujet: "ctq_vmc", variante: "devis_unique" }, AUTEUR);
    expect(a.corpsTexte).toBe(`Prestataire : Socotec\nMontant : 540${NBSP}€`);
    expect(a.corpsHtml).not.toContain("<table");
    expect(a.tableauTexte).toBeNull();
  });

  it("aucune adresse de conseil, aucune offre, pas de signature -> avertissements, jamais un refus", async () => {
    etat.modeles = [modele()];
    etat.conseil = { source: "aucune", emails: [] };
    etat.signature = null;
    etat.suivi = suivi({ gaz: { concerne: true, cycles: [cycleVue("cg", "gaz")], offres: [], documents: [] } });
    const a = await preparerMailCs({ coproCode: "S0247", sujet: "gaz", variante: "comparatif" }, AUTEUR);
    expect(a.a).toEqual([]);
    expect(a.cc).toEqual(["gest@real31.fr", "assist@real31.fr"]);
    expect(a.corpsHtml).toContain("Aucune proposition reçue à ce jour.");
    expect(a.avertissements).toEqual([
      "Aucune offre à comparer : le tableau dira « Aucune proposition reçue à ce jour. »",
      "Aucune adresse de conseil syndical connue : saisis les destinataires à la main.",
      "Signature Signitic indisponible : le mail partira sans signature.",
    ]);
  });

  it("refus : module mail coupé, hors périmètre, copro inconnue", async () => {
    vi.stubEnv("MAIL_SOURCE", "noop");
    await expect(preparerMailCs({ coproCode: "S0247", sujet: "gaz", variante: "comparatif" }, AUTEUR)).rejects.toThrow("L'envoi de mail n'est pas activé sur cet environnement.");
    vi.stubEnv("MAIL_SOURCE", "graph");
    etat.perimetreRefuse = true;
    await expect(preparerMailCs({ coproCode: "S0247", sujet: "gaz", variante: "comparatif" }, AUTEUR)).rejects.toThrow(/périmètre/);
    etat.perimetreRefuse = false;
    etat.suivi = null;
    await expect(preparerMailCs({ coproCode: "S0247", sujet: "gaz", variante: "comparatif" }, AUTEUR)).rejects.toThrow("Copropriété inconnue du référentiel.");
  });
});

describe("envoyerMailCs", () => {
  const base = {
    coproCode: "S0247",
    sujet: "gaz" as const,
    variante: "comparatif" as const,
    objet: "  Renouvellement   gaz ",
    corpsTexte: "Bonjour,\n\nOffres reçues\n{{offres}}\n\nÀ bientôt & merci.",
    a: ["pres@gmail.com", "PRES@gmail.com"],
    cc: ["gest@real31.fr", "pres@gmail.com"],
    tableauInclus: true,
  };

  it("refusé sans destinataire, avec une adresse invalide, module coupé, sans e-mail d'auteur : rien ne part", async () => {
    await expect(envoyerMailCs({ ...base, a: [] }, AUTEUR)).rejects.toThrow("Aucun destinataire : ajoute au moins une adresse du conseil syndical.");
    await expect(envoyerMailCs({ ...base, a: ["pas une adresse"] }, AUTEUR)).rejects.toThrow("Adresse invalide : pas une adresse");
    await expect(envoyerMailCs({ ...base, cc: ["mylène.pin@orange.fr"] }, AUTEUR)).rejects.toThrow("Adresse invalide : mylène.pin@orange.fr");
    await expect(envoyerMailCs(base, { id: "u1", nom: "Sans mail" })).rejects.toThrow(/adresse e-mail/);
    vi.stubEnv("MAIL_SOURCE", "noop");
    await expect(envoyerMailCs(base, AUTEUR)).rejects.toThrow("L'envoi de mail n'est pas activé sur cet environnement.");
    expect(etat.envois).toHaveLength(0);
    expect(etat.journal).toHaveLength(0);
  });

  it("envoie depuis la boîte de l'auteur, HTML recomposé depuis le texte relu, tableau à la place du marqueur, journal mail_cs_envoye", async () => {
    const r = await envoyerMailCs(base, AUTEUR);
    expect(r).toEqual({ a: ["pres@gmail.com"], cc: ["gest@real31.fr"] });
    expect(etat.envois).toHaveLength(1);
    const m = etat.envois[0];
    expect(m.boite).toBe("sekou@real31.fr");
    expect(m.a).toEqual(["pres@gmail.com"]);
    expect(m.cc).toEqual(["gest@real31.fr"]);
    expect(m.cci).toEqual([]);
    expect(m.sujet).toBe("Renouvellement gaz");
    expect(m.signatureHtml).toBe("<p>Sekou</p>");
    expect(String(m.corpsHtml)).toContain("<table");
    expect(String(m.corpsHtml)).toContain("Engie (retenue)");
    expect(String(m.corpsHtml)).toContain("À bientôt &amp; merci.");
    expect(String(m.corpsHtml)).not.toContain("{{offres}}");
    expect(String(m.corps)).toContain("- Engie (retenue)");
    expect(String(m.corps)).not.toContain("{{offres}}");
    expect(etat.journal).toHaveLength(1);
    expect(etat.journal[0]).toMatchObject({
      coproCode: "S0247",
      sujet: "gaz",
      cycleId: "cg",
      type: "mail_cs_envoye",
      parUserId: "u1",
      parNom: "Sekou KOMA",
      details: { objet: "Renouvellement gaz", a: ["pres@gmail.com"], cc: ["gest@real31.fr"], variante: "comparatif" },
    });
  });

  it("tableau exclu -> le marqueur disparaît, pas de table dans le HTML ni de lignes dans le texte", async () => {
    await envoyerMailCs({ ...base, tableauInclus: false }, AUTEUR);
    const m = etat.envois[0];
    expect(String(m.corpsHtml)).not.toContain("<table");
    expect(String(m.corpsHtml)).not.toContain("{{offres}}");
    expect(String(m.corps)).toBe("Bonjour,\n\nOffres reçues\n\nÀ bientôt & merci.");
  });

  it("sans signature disponible, le champ n'est pas envoyé", async () => {
    etat.signature = null;
    await envoyerMailCs(base, AUTEUR);
    expect("signatureHtml" in etat.envois[0]).toBe(false);
  });
});
