import { describe, expect, it, vi } from "vitest";

// « Pour BPO » (02/11/2026) : le dossier recalculé côté serveur, jamais un dossier créé, jamais
// un sous-dossier inventé, une copro ESTALE confirmée, l'écriture coupée sans le droit.

vi.mock("@/lib/adapters/router", () => ({
  getDepotBpoProvider: () => null,
  getMailboxProvider: () => null,
  getReferentielTriProvider: () => null,
}));

const { cibleBpo, deposerPourBpo, depotBpoActif } = await import("./depot-bpo");

// L'arborescence lue dans SharePoint, le lundi 02/11/2026 à 15 h (Paris).
const ARBRE: Record<string, string[]> = {
  "Compta/LGC/2026": ["10-octobre", "11-novembre", "12-décembre"],
  "Compta/LGC/2026/11-novembre": ["02-11 BPO OK le 03-11", "04-11", "06-11"],
  "Compta/LGC/2026/11-novembre/04-11": ["CB", "MA", "NP"],
  "Compta/LGC/2026/12-décembre": ["02-12"],
  "Compta/ML/2026": ["11-novembre"],
  "Compta/ML/2026/11-novembre": ["02-11"],
  "Compta/ML/2026/11-novembre/02-11": ["DM", "TG"],
};

function deps(o: { ecriture?: boolean; copro?: { agence?: string; estale: boolean } | null } = {}) {
  const deposes: { chemin: string[]; nomFichier: string; contenu: Buffer }[] = [];
  return {
    deposes,
    deps: {
      depot: {
        ecritureActive: o.ecriture ?? true,
        async listerDossiers(chemin: string[]) {
          return ARBRE[chemin.join("/")] ?? null;
        },
        async deposer(p: { chemin: string[]; nomFichier: string; contenu: Buffer }) {
          deposes.push(p);
          return { depose: true as const, webUrl: "https://sp/x", nom: p.nomFichier };
        },
      },
      copro: async () => (o.copro === undefined ? { agence: "HLS", estale: false } : o.copro),
      maintenant: () => new Date("2026-11-02T14:00:00Z"),
      lirePiece: async (id: string) => ({ nom: `Facture ${id}.pdf`, type: "application/pdf", base64: Buffer.from("pdf").toString("base64") }),
    },
  };
}

const demande = { boite: "julie@real31.fr", internetMessageId: "<m@x>", pjIds: ["a1"], sousDossier: "MA", coproCode: "S247", agencePersonne: "ML", initiales: "MA", confirmeEstale: false };

describe("cibleBpo", () => {
  it("HLS passe par LGC ; le 02-11 est collecté, on prend le prochain (04-11) ; initiales trouvées", async () => {
    const r = await cibleBpo({ coproCode: "S247", agencePersonne: "ML", initiales: "ma" }, deps().deps);
    expect(r).toEqual({
      ok: true,
      cible: { dossier: "Compta/LGC/2026/11-novembre/04-11", jour: "04-11", duJour: false, sousDossiers: ["CB", "MA", "NP"], parDefaut: "MA", estale: false, ecritureActive: true },
    });
  });
  it("copro inconnue : l'agence de la personne ; dossier du jour", async () => {
    const r = await cibleBpo({ coproCode: "", agencePersonne: "ML", initiales: "XX" }, deps({ copro: null }).deps);
    expect(r).toMatchObject({ ok: true, cible: { dossier: "Compta/ML/2026/11-novembre/02-11", duJour: true, parDefaut: null } });
  });
  it("agence sans dépôt : refus lisible", async () => {
    expect(await cibleBpo({ coproCode: "S1", agencePersonne: "ASN", initiales: "MA" }, deps({ copro: { agence: "ASN", estale: false } }).deps)).toMatchObject({ ok: false });
  });
});

describe("deposerPourBpo", () => {
  it("dépose dans le sous-dossier choisi du dossier recalculé", async () => {
    const { deps: d, deposes } = deps();
    const r = await deposerPourBpo({ ...demande, pjIds: ["a1", "a2"] }, d);
    expect(r).toMatchObject({ ok: true, dossier: "Compta/LGC/2026/11-novembre/04-11/MA" });
    expect(deposes.map((x) => [x.chemin.join("/"), x.nomFichier])).toEqual([
      ["Compta/LGC/2026/11-novembre/04-11/MA", "Facture a1.pdf"],
      ["Compta/LGC/2026/11-novembre/04-11/MA", "Facture a2.pdf"],
    ]);
  });
  it("refuse un sous-dossier qui n'existe pas (jamais créé)", async () => {
    const { deps: d, deposes } = deps();
    expect(await deposerPourBpo({ ...demande, sousDossier: "ZZ" }, d)).toMatchObject({ ok: false });
    expect(await deposerPourBpo({ ...demande, sousDossier: "../../Autre" }, d)).toMatchObject({ ok: false });
    expect(deposes).toHaveLength(0);
  });
  it("copro ESTALE : refus sans confirmation, dépôt après", async () => {
    const { deps: d, deposes } = deps({ copro: { agence: "LGC", estale: true } });
    expect(await deposerPourBpo(demande, d)).toEqual({ ok: false, motif: "Cette copropriété est dans ESTALE : ses factures vont dans ESTALE, pas chez BPO." });
    expect(deposes).toHaveLength(0);
    expect(await deposerPourBpo({ ...demande, confirmeEstale: true }, d)).toMatchObject({ ok: true });
  });
  it("écriture coupée : rien n'est tenté", async () => {
    const { deps: d, deposes } = deps({ ecriture: false });
    expect(await deposerPourBpo(demande, d)).toMatchObject({ ok: false });
    expect(deposes).toHaveLength(0);
  });
});

// 02/11/2026 (décision Sekou) : le lien « Pour BPO » n'est proposé que si l'écriture est ouverte.
describe("depotBpoActif", () => {
  it("suit l'écriture du port (SHAREPOINT_DEPOT_ACTIF)", () => {
    expect(depotBpoActif(deps({ ecriture: false }).deps.depot)).toBe(false);
    expect(depotBpoActif(deps({ ecriture: true }).deps.depot)).toBe(true);
  });
});
