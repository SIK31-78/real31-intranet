import { describe, expect, it } from "vitest";
import { MockTriRepository } from "@/lib/adapters/mock/mock-tri-repository";
import type { RangementTriProvider } from "@/lib/ports/rangement-tri-provider";
import type { ReferentielTri } from "@/lib/domain/tri-emails";
import { annulerRangement, corrigerCopro, rangerMail, type DemandeRangement, type DepsRangement } from "@/lib/services/tri-emails/ranger";

const BOITE = "syndic2@real31.fr";

const REF: ReferentielTri = {
  copros: [
    {
      reference: "S0297",
      nom: "La Pléiade",
      adresse: "",
      gestionnaire: { nomComplet: "Sandy", email: "sandy@real31.fr" },
      assistant: null,
    },
    { reference: "S0305", nom: "4 Gaultier", adresse: "", gestionnaire: null, assistant: null },
  ],
  expediteurs: {},
};

/** Faux Graph qui enregistre ce qu'on lui demande. */
function fauxGraph(enReception = true) {
  const appels: string[] = [];
  const g: RangementTriProvider = {
    async lireEnReception(_b, id) {
      appels.push(`lire ${id}`);
      return enReception ? { internetMessageId: `<${id}>`, expediteur: "x@exemple.fr", objet: "Objet réel" } : null;
    },
    async assurerDossier(_b, p) {
      appels.push(`dossier ${p.nom} (connu: ${p.folderIdConnu ?? "non"})`);
      return { folderId: p.folderIdConnu ?? `f-${p.nom}` };
    },
    async deplacer(_b, id, folderId) {
      appels.push(`deplacer ${id} -> ${folderId}`);
      return { messageId: `${id}-deplace` };
    },
    async remettreEnReception(_b, id) {
      appels.push(`remettre ${id}`);
      return { messageId: `${id}-remis` };
    },
    async supprimer(_b, id) {
      appels.push(`supprimer ${id}`);
      return { messageId: `${id}-corbeille` };
    },
    async etiqueter(_b, id, p) {
      appels.push(`etiqueter ${id} +${(p.ajouter ?? []).join(",")} -${(p.retirer ?? []).join(",")}`);
    },
    async localiser(_b, imid) {
      appels.push(`localiser ${imid}`);
      return { messageId: "m1-deplace", folderId: "f-SC-JB", enReception: false, categories: ["S0297"] };
    },
  };
  return { g, appels };
}

function deps(p: Partial<DepsRangement> & { rangement: RangementTriProvider }): DepsRangement {
  return {
    boite: BOITE,
    simulation: false,
    referentiel: { charger: async () => REF },
    repo: new MockTriRepository({
      binomes: [{ id: "b1", gestionnaireEmail: "sandy@real31.fr", assistant: { nomComplet: "Julie", email: "julie@real31.fr" }, principal: true }],
      parCopro: {},
    }),
    initialesParEmail: async () => ({ "sandy@real31.fr": "SC", "julie@real31.fr": "JB", "oceane@real31.fr": "OR" }),
    gestionnaires: async () => [{ nomComplet: "Océane", email: "oceane@real31.fr" }],
    ...p,
  };
}

const demande = (p: Partial<DemandeRangement> = {}): DemandeRangement => ({
  messageId: "m1",
  internetMessageId: "<m1>",
  expediteur: "x@exemple.fr",
  objet: "Objet",
  cible: { type: "copro", reference: "S0297" },
  suggestion: { nature: "sure", candidats: ["S0297"] },
  ...p,
});

describe("rangerMail", () => {
  it("range dans le dossier du binome et journalise le signal", async () => {
    const { g, appels } = fauxGraph();
    const d = deps({ rangement: g });
    const r = await rangerMail(demande(), "sekou@real31.fr", d);
    expect(r).toMatchObject({ dossierNom: "SC-JB", simulation: false });
    expect(appels).toEqual(["lire m1", "dossier SC-JB (connu: non)", "deplacer m1 -> f-SC-JB", "etiqueter m1-deplace +S0297 -"]);
    const e = await d.repo.entree(r.journalId);
    expect(e).toMatchObject({ coproReference: "S0297", signal: "sure", candidats: ["S0297"], messageId: "m1-deplace", objet: "Objet réel" });
  });

  it("reprend le dossier deja cree au rangement suivant", async () => {
    const { g, appels } = fauxGraph();
    const d = deps({ rangement: g });
    await rangerMail(demande(), "a", d);
    await rangerMail(demande({ messageId: "m2", internetMessageId: "<m2>" }), "a", d);
    expect(appels).toContain("dossier SC-JB (connu: f-SC-JB)");
  });

  it("range dans Comptabilité sans copro, donc sans etiquette", async () => {
    const { g, appels } = fauxGraph();
    const r = await rangerMail(demande({ cible: { type: "comptabilite" } }), "a", deps({ rangement: g }));
    expect(r.dossierNom).toBe("Comptabilité");
    expect(appels.some((x) => x.startsWith("etiqueter"))).toBe(false);
  });

  it("range dans un dossier choisi, sans etiquette (invitation d'un prestataire)", async () => {
    const { g, appels } = fauxGraph();
    const r = await rangerMail(demande({ cible: { type: "dossier", cle: "binome:oceane@real31.fr", copros: [] } }), "a", deps({ rangement: g }));
    expect(r.dossierNom).toBe("OR");
    expect(appels.some((x) => x.startsWith("etiqueter"))).toBe(false);
  });

  it("range dans un dossier choisi avec plusieurs etiquettes (factures pour plusieurs copros)", async () => {
    const { g, appels } = fauxGraph();
    const d = deps({ rangement: g });
    const r = await rangerMail(
      demande({ cible: { type: "dossier", cle: "binome:sandy@real31.fr", copros: ["S0297", "S0305"] } }),
      "a",
      d,
    );
    expect(r.dossierNom).toBe("SC-JB");
    expect(appels).toContain("etiqueter m1-deplace +S0297,S0305 -");
    expect(await d.repo.entree(r.journalId)).toMatchObject({ coproReference: "S0297", copros: ["S0297", "S0305"] });
  });

  it("refuse un dossier inconnu ou une etiquette hors ESTALE", async () => {
    const { g } = fauxGraph();
    await expect(
      rangerMail(demande({ cible: { type: "dossier", cle: "binome:personne@real31.fr", copros: [] } }), "a", deps({ rangement: g })),
    ).rejects.toThrow(/n'existe pas/);
    await expect(
      rangerMail(demande({ cible: { type: "dossier", cle: "binome:oceane@real31.fr", copros: ["S0142"] } }), "a", deps({ rangement: g })),
    ).rejects.toThrow(/pas dans ESTALE/);
  });

  it("un echec d'etiquette ne defait pas le rangement", async () => {
    const { g } = fauxGraph();
    g.etiqueter = async () => {
      throw new Error("Graph etiquette 500");
    };
    const r = await rangerMail(demande(), "a", deps({ rangement: g }));
    expect(r).toMatchObject({ dossierNom: "SC-JB", etiquetteNonPosee: true });
  });

  it("refuse un mail qui n'est plus en reception", async () => {
    const { g } = fauxGraph(false);
    await expect(rangerMail(demande(), "a", deps({ rangement: g }))).rejects.toThrow(/plus dans la boîte de réception/);
  });

  it("refuse de ranger deux fois le meme mail", async () => {
    const { g } = fauxGraph();
    const d = deps({ rangement: g });
    await rangerMail(demande(), "a", d);
    await expect(rangerMail(demande(), "a", d)).rejects.toThrow(/déjà été rangé/);
  });

  it("refuse une copro sans gestionnaire au mandat", async () => {
    const { g } = fauxGraph();
    await expect(
      rangerMail(demande({ cible: { type: "copro", reference: "S0305" } }), "a", deps({ rangement: g })),
    ).rejects.toThrow(/pas de gestionnaire/);
  });

  it("en simulation, ne retient pas l'id de dossier simule", async () => {
    const { g } = fauxGraph();
    const d = deps({ rangement: g, simulation: true });
    const r = await rangerMail(demande(), "a", d);
    expect(r.simulation).toBe(true);
    expect(await d.repo.dossier(BOITE, "binome:sandy@real31.fr")).toBeNull();
  });
});

describe("annulerRangement", () => {
  it("remet le mail en reception et marque la ligne", async () => {
    const { g, appels } = fauxGraph();
    const d = deps({ rangement: g });
    const r = await rangerMail(demande(), "a", d);
    await annulerRangement(r.journalId, "a", d);
    expect(appels.slice(-3)).toEqual(["localiser <m1>", "remettre m1-deplace", "etiqueter m1-deplace-remis + -S0297"]);
    expect((await d.repo.entree(r.journalId))?.annuleLe).not.toBeNull();
    await expect(annulerRangement(r.journalId, "a", d)).rejects.toThrow(/déjà été annulé/);
  });

  it("n'annule pas un vrai rangement quand l'ecriture est coupee", async () => {
    const { g } = fauxGraph();
    const repo = new MockTriRepository();
    const r = await rangerMail(demande({ cible: { type: "divers" } }), "a", deps({ rangement: g, repo }));
    await expect(annulerRangement(r.journalId, "a", deps({ rangement: g, repo, simulation: true }))).rejects.toThrow(/coupée/);
  });
});

describe("corrigerCopro (changement de copro depuis « E-mails »)", () => {
  const REF_OCEANE: ReferentielTri = {
    ...REF,
    copros: [
      ...REF.copros,
      { reference: "S0310", nom: "Les Tilleuls", adresse: "", gestionnaire: { nomComplet: "Océane", email: "oceane@real31.fr" }, assistant: null },
    ],
  };

  it("met le journal à jour, déplace l'étiquette, et signale un autre dossier de binôme sans déplacer le mail", async () => {
    const { g, appels } = fauxGraph();
    const d = deps({ rangement: g, referentiel: { charger: async () => REF_OCEANE } });
    await rangerMail(demande(), "a", d);
    appels.length = 0;

    const r = await corrigerCopro(BOITE, "<m1>", "S310", d);

    expect(r.corrige).toBe(true);
    expect(r.autreDossier).toBe("OR");
    const [e] = await d.repo.journalDepuis(BOITE, "2000-01-01");
    expect(e?.coproReference).toBe("S0310");
    expect(e?.copros).toEqual(["S0310"]);
    expect(appels).toEqual(["localiser <m1>", "etiqueter m1-deplace +S0310 -S0297"]);
    expect(appels.some((a) => a.startsWith("deplacer"))).toBe(false);
  });

  it("retire la copro (code vide) et ne touche pas la boîte en simulation", async () => {
    const { g, appels } = fauxGraph();
    const d = deps({ rangement: g, simulation: true });
    await rangerMail(demande(), "a", d);
    appels.length = 0;

    expect(await corrigerCopro(BOITE, "<m1>", "", d)).toEqual({ corrige: true });
    const [e] = await d.repo.journalDepuis(BOITE, "2000-01-01");
    expect(e?.coproReference).toBeNull();
    expect(e?.copros).toEqual([]);
    expect(appels).toEqual([]);
  });

  it("ne fait rien si la copro ne change pas ou si le mail n'est pas au journal ; refuse une copro inconnue", async () => {
    const { g } = fauxGraph();
    const d = deps({ rangement: g });
    await rangerMail(demande(), "a", d);
    expect(await corrigerCopro(BOITE, "<m1>", "S297", d)).toEqual({ corrige: false });
    expect(await corrigerCopro(BOITE, "<absent>", "S305", d)).toEqual({ corrige: false });
    await expect(corrigerCopro(BOITE, "<m1>", "S999", d)).rejects.toThrow("pas dans ESTALE");
  });
});
