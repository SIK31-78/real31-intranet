import { beforeEach, describe, expect, it, vi } from "vitest";

// Contacts du compositeur (REA-356, 19/10/2026) : pour une copro ESTALE, les copropriétaires
// viennent d'ESTALE ; ESTALE en panne, on retombe sur l'annuaire Crypto.

const etat = vi.hoisted(() => ({
  proprietaires: null as { id: string; nom: string; email: string }[] | null,
  panneEstale: false,
  referenceDemandee: "",
  lotsPrincipaux: 0 as number | null,
  cascadeCS: { source: "aucune", emails: [] } as { source: "estale" | "crypto" | "aucune"; emails: string[] },
  panneCS: false,
  referenceCS: "",
  appelsBinome: [] as unknown[][],
  brouillons: [] as Record<string, unknown>[],
  identites: [] as { cle: string; nom: string; emails: string[]; copros: { reference: string; qualite: string }[] }[],
}));

vi.mock("@/lib/domain/mail-gate", async (orig) => ({
  ...(await orig<typeof import("@/lib/domain/mail-gate")>()),
  mailModuleActif: () => true,
  envoiMailPour: () => false,
}));
vi.mock("./get-signature", () => ({ async getSignatureGestionnaire() { return null; } }));
vi.mock("./jeton-envoi", () => ({ DUREE_JETON_MS: 1000, scellerJeton: (j: unknown) => JSON.stringify(j) }));

vi.mock("@/lib/services/coproprietes/assistante-de-copro", () => ({
  async binomeEnCopie(...args: unknown[]) {
    etat.appelsBinome.push(args);
    return [{ nomComplet: "Julie Binôme", email: "julie@real31.fr" }];
  },
}));

vi.mock("@/lib/services/coproprietes/destinataires-conseil", () => ({
  async destinatairesConseilSyndical(code: string) {
    etat.referenceCS = code;
    if (etat.panneCS) throw new Error("liste indisponible");
    return etat.cascadeCS;
  },
}));

vi.mock("@/lib/services/estale/donnees-copro-estale", () => ({
  async donneesCoproEstale() {
    return { conseilSyndical: [{ nomComplet: "Mme PRÉSIDENTE", email: "presidente@x.fr" }] };
  },
}));
vi.mock("@/lib/adapters/router", () => ({
  getMailOutboundProvider: () => ({
    async creerBrouillonNeuf(b: Record<string, unknown>) {
      etat.brouillons.push(b);
      return { id: `d${etat.brouillons.length}` };
    },
    async supprimerBrouillon() {},
  }),
  getGestionnaireRepository: () => ({
    async listTous() {
      return [
        { id: "u1", nomComplet: "Elsa PEIXOTO", initiales: "EP", email: "Elsa.Peixoto@real31.fr" },
        { id: "u2", nomComplet: "Sans Adresse", initiales: "SA" },
      ];
    },
  }),
  // Houilles (HLS) a ses copros, et une S247 en double pour vérifier le dédoublonnage.
  getReferentielTriProvider: (agences: readonly string[]) => ({
    async charger() {
      if (agences.includes("HLS")) {
        return {
          copros: [
            { reference: "S300", nom: "Le Moulin", adresse: "", gestionnaire: null },
            { reference: "S0247", nom: "Doublon", adresse: "", gestionnaire: null },
            { reference: "S301", nom: "Fermée", adresse: "", gestionnaire: null, inactive: true },
          ],
        };
      }
      return { copros: [{ reference: "S247", nom: "Les Tilleuls", adresse: "", gestionnaire: null }] };
    },
  }),
  getCoproRepository: () => ({
    async findByCode(code: string) {
      if (etat.lotsPrincipaux === null) throw new Error("base indisponible");
      return { code, lotsPrincipaux: etat.lotsPrincipaux };
    },
  }),
  getContactsCoproProvider: () => ({
    async rechercherIdentites() {
      return etat.identites;
    },
    async listerParCopro() {
      return [
        { email: "ancien@x.fr", nom: "ANCIEN", qualite: "coproprietaire", personne: "crypto:1" },
        { email: "loc@x.fr", nom: "LOCATAIRE", qualite: "locataire" },
      ];
    },
  }),
  getCoproprietairesEstaleProvider: () => ({
    async listerJoignables(reference: string) {
      etat.referenceDemandee = reference;
      if (etat.panneEstale) throw new Error("ESTALE HTTP 503");
      return etat.proprietaires;
    },
  }),
}));

const { listerContactsComposition, listerCoprosComposition, preparerComposition, rechercherDestinataires } = await import("./composer-mail");

const syndic2 = { boite: "syndic2@real31.fr", agences: ["LGC", "ASN"] };
const syndic4 = { boite: "syndic4@real31.fr", agences: ["HLS"] };

describe("listerContactsComposition", () => {
  beforeEach(() => {
    etat.proprietaires = null;
    etat.panneEstale = false;
    etat.lotsPrincipaux = 0;
    etat.cascadeCS = { source: "aucune", emails: [] };
    etat.panneCS = false;
  });

  it("copro ESTALE : les copropriétaires d'ESTALE remplacent ceux de Crypto", async () => {
    etat.proprietaires = [{ id: "o1", nom: "M. ACTUEL", email: "actuel@x.fr" }];
    const { contacts: r } = await listerContactsComposition("S0178");
    expect(etat.referenceDemandee).toBe("S178");
    expect(r.map((c) => [c.email, c.qualite])).toEqual([
      ["loc@x.fr", "locataire"],
      ["actuel@x.fr", "coproprietaire"],
      ["presidente@x.fr", "conseil_syndical"],
    ]);
  });

  it("copro hors ESTALE : l'annuaire Crypto, complété du conseil syndical", async () => {
    const { contacts: r } = await listerContactsComposition("S178");
    expect(r.map((c) => c.email)).toEqual(["ancien@x.fr", "loc@x.fr", "presidente@x.fr"]);
  });

  it("ESTALE en panne : repli sur l'annuaire Crypto, noté dans les logs", async () => {
    etat.panneEstale = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { contacts: r } = await listerContactsComposition("S178");
    expect(r.map((c) => c.email)).toContain("ancien@x.fr");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("repli sur l'annuaire Crypto"), "ESTALE HTTP 503");
    warn.mockRestore();
  });

  it("joint le nombre de lots principaux s'il est connu, null sinon (0 ou lecture ratée)", async () => {
    etat.lotsPrincipaux = 42;
    expect((await listerContactsComposition("S178")).lotsPrincipaux).toBe(42);
    etat.lotsPrincipaux = 0;
    expect((await listerContactsComposition("S178")).lotsPrincipaux).toBeNull();
    etat.lotsPrincipaux = null;
    expect((await listerContactsComposition("S178")).lotsPrincipaux).toBeNull();
  });

  it("conseil syndical : la cascade du mail de date d'AG, pas les fiches de l'annuaire cochées CS", async () => {
    etat.cascadeCS = { source: "crypto", emails: ["Ancien@x.fr", "membre@x.fr"] };
    const { conseil } = await listerContactsComposition("S0178");
    expect(etat.referenceCS).toBe("S178");
    expect(conseil.source).toBe("crypto");
    // Le nom vient des contacts quand l'adresse y figure.
    expect(conseil.membres).toEqual([
      { email: "ancien@x.fr", nom: "ANCIEN", qualite: "conseil_syndical" },
      { email: "membre@x.fr", nom: "", qualite: "conseil_syndical" },
    ]);
    // La présidente ESTALE garde sa casquette dans les contacts, mais n'est pas dans la liste.
    expect(conseil.membres.map((m) => m.email)).not.toContain("presidente@x.fr");
  });

  it("copie du binôme (28/10/2026) : demandée pour la personne connectée, rien sans elle", async () => {
    etat.appelsBinome = [];
    etat.lotsPrincipaux = 12;
    const r = await listerContactsComposition("S178", "gaelle@real31.fr");
    expect(r.copieBinome).toEqual([{ nomComplet: "Julie Binôme", email: "julie@real31.fr" }]);
    const [copro, envoyeur] = etat.appelsBinome[0]!;
    expect((copro as { code: string }).code).toBe("S178");
    expect(envoyeur).toBe("gaelle@real31.fr");
    expect((await listerContactsComposition("S178")).copieBinome).toEqual([]);
    expect(etat.appelsBinome).toHaveLength(1);
  });

  it("conseil syndical illisible : rien de proposé, saisie à la main", async () => {
    etat.panneCS = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { conseil, contacts } = await listerContactsComposition("S178");
    expect(conseil).toEqual({ source: "aucune", membres: [] });
    expect(contacts.length).toBeGreaterThan(0);
    warn.mockRestore();
  });
});

describe("rechercherDestinataires : collègues d'abord (décision 14)", () => {
  it("propose le collègue en tête et marque la fiche cliente du même nom", async () => {
    etat.identites = [{ cle: "crypto:9", nom: "PEIXOTO Elsa", emails: ["elsa.p@gmail.com"], copros: [{ reference: "S247", qualite: "coproprietaire" }] }];
    const l = await rechercherDestinataires("elsa", [syndic2]);
    expect(l.map((d) => [d.nom, d.genre, d.emails[0]])).toEqual([
      ["Elsa PEIXOTO", "collegue", "elsa.peixoto@real31.fr"],
      ["PEIXOTO Elsa", "client", "elsa.p@gmail.com"],
    ]);
  });
});

describe("preparerComposition : envoi séparé (décision 10)", () => {
  const g = { id: "g1", nomComplet: "Moi", initiales: "MO", email: "moi@real31.fr" };
  const config = { boite: "syndic2@real31.fr", agences: ["LGC"] } as never;
  beforeEach(() => {
    etat.brouillons = [];
  });
  it("un brouillon par destinataire, chacun ne porte que ses adresses, un jeton chacun", async () => {
    const r = await preparerComposition(
      { objet: "S247 · Les Tilleuls - Devis", corps: "Bonjour", a: ["a@x.fr", "a2@x.fr", "b@y.fr"], cc: [], envois: [["a@x.fr", "a2@x.fr"], ["b@y.fr"]] },
      g,
      config,
    );
    expect(etat.brouillons.map((b) => [b.a, b.cc, b.cci])).toEqual([
      [["a@x.fr", "a2@x.fr"], undefined, undefined],
      [["b@y.fr"], undefined, undefined],
    ]);
    expect(r.mails).toBe(2);
    expect(r.jetons).toHaveLength(2);
  });
  it("sans envoi séparé : un seul brouillon à tous", async () => {
    await preparerComposition({ objet: "x", corps: "y", a: ["a@x.fr", "b@y.fr"], cc: [] }, g, config);
    expect(etat.brouillons.map((b) => b.a)).toEqual([["a@x.fr", "b@y.fr"]]);
  });
});

describe("« De » au choix (29/10/2026)", () => {
  const g = { id: "g1", nomComplet: "Moi", initiales: "MO", email: "moi@real31.fr" };
  beforeEach(() => {
    etat.brouillons = [];
  });

  it("les copros de toutes les boîtes proposées, chacune marquée de sa boîte, sans doublon ni inactive", async () => {
    const l = await listerCoprosComposition([syndic2, syndic4]);
    expect(l.map((c) => [c.reference, c.boite])).toEqual([
      ["S247", "syndic2@real31.fr"],
      ["S300", "syndic4@real31.fr"],
    ]);
    expect(await listerCoprosComposition([])).toEqual([]);
  });

  it("depuis la boîte perso : le brouillon est créé dans la boîte perso et part (comme une réponse)", async () => {
    const r = await preparerComposition({ objet: "x", corps: "y", a: ["a@x.fr"], cc: [] }, g, { boite: "moi@real31.fr", personnelle: true });
    expect(etat.brouillons.map((b) => b.boite)).toEqual(["moi@real31.fr"]);
    expect(r).toMatchObject({ simulation: false, boite: "moi@real31.fr", envoi: true });
    // Le jeton scelle la boîte réellement utilisée et le mode.
    expect(JSON.parse(r.jetons![0]!)).toMatchObject({ nature: "neuf", boite: "moi@real31.fr", mode: "envoyer" });
  });

  it("depuis une boîte partagée dont l'envoi est coupé : brouillon Outlook, boîte scellée", async () => {
    const r = await preparerComposition({ objet: "x", corps: "y", a: ["a@x.fr"], cc: [] }, g, syndic4 as never);
    expect(etat.brouillons.map((b) => b.boite)).toEqual(["syndic4@real31.fr"]);
    expect(JSON.parse(r.jetons![0]!)).toMatchObject({ boite: "syndic4@real31.fr", mode: "brouillon" });
  });

  it("toute la copropriété ne part pas de la boîte perso", async () => {
    await expect(
      preparerComposition({ objet: "x", corps: "y", a: [], cc: [], cci: ["c1@x.fr"] }, g, { boite: "moi@real31.fr", personnelle: true }),
    ).rejects.toThrow("boîte partagée");
    expect(etat.brouillons).toEqual([]);
  });
});
