// Tache planifiee du tri (REA-420) : verrou par boite. Services mockes, zero reseau.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { repo, etapes } = vi.hoisted(() => ({
  repo: { prendreVerrou: vi.fn(), libererVerrou: vi.fn(async () => {}) },
  etapes: {
    lecture: vi.fn(async () => ({ indexDisponible: false, ajoutes: 0, retires: 0, pages: 0, complet: true, nonRevus: 0, debut: "", presents: new Map(), sortis: [] })),
    reprise: vi.fn(async () => ({ confirmees: 0, annulees: 0, introuvables: 0, echecs: 0 })),
    reconciliation: vi.fn(async () => ({ verifies: 0, remisEnFile: 0, deplaces: 0, echecs: 0 })),
    automatique: vi.fn(async () => ({ actif: false })),
  },
}));

vi.mock("@/lib/observabilite", () => ({ signalerException: vi.fn() }));
vi.mock("@/lib/services/tri-emails/ranger", () => ({ depsParDefaut: (config: { boite: string }) => ({ boite: config.boite, simulation: false, repo }) }));
vi.mock("@/lib/services/tri-emails/synchroniser-reception", () => ({
  BUDGET_SYNCHRO_CRON_MS: 20_000,
  synchroniserReception: etapes.lecture,
  purgerSortis: vi.fn(async () => 0),
}));
vi.mock("@/lib/services/tri-emails/reprendre-en-cours", () => ({ reprendreEnCours: etapes.reprise }));
vi.mock("@/lib/services/tri-emails/reconcilier", () => ({ reconcilierRangements: etapes.reconciliation }));
vi.mock("@/lib/services/tri-emails/ranger-auto", () => ({ rangerAutomatiquement: etapes.automatique }));

import { executerTachePlanifiee } from "./tache";

const BOITE = "syndic4@real31.fr";
const requete = () => new Request("https://intranet/api/cron/tri-emails", { headers: { authorization: "Bearer secret-test" } });

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "secret-test");
  vi.stubEnv("MAIL_TRI_BOITES", JSON.stringify([{ boite: BOITE, agences: ["HLS"], ecriture: true, automatique: true, envoi: false }]));
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllEnvs());

describe("tache planifiee : verrou par boite", () => {
  it("verrou occupe : 200 { verrou: occupe }, aucune etape ne tourne", async () => {
    repo.prendreVerrou.mockResolvedValueOnce(false);
    const r = await executerTachePlanifiee(requete(), null);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ boite: BOITE, verrou: "occupe" });
    for (const etape of Object.values(etapes)) expect(etape).not.toHaveBeenCalled();
    expect(repo.libererVerrou).not.toHaveBeenCalled();
  });

  it("verrou pris pour 55 s : les etapes tournent (reprise comprise), puis le verrou est rendu", async () => {
    repo.prendreVerrou.mockResolvedValueOnce(true);
    const r = await executerTachePlanifiee(requete(), null);
    expect(r.status).toBe(200);
    const corps = (await r.json()) as Record<string, unknown>;
    expect(corps).toMatchObject({ boite: BOITE, reprises: { confirmees: 0, annulees: 0, introuvables: 0, echecs: 0 } });
    expect(repo.prendreVerrou).toHaveBeenCalledWith(BOITE, expect.stringMatching(/^cron:/), 55);
    for (const etape of Object.values(etapes)) expect(etape).toHaveBeenCalledTimes(1);
    const par = repo.prendreVerrou.mock.calls[0]![1];
    expect(repo.libererVerrou).toHaveBeenCalledWith(BOITE, par);
  });

  it("verrou indisponible (SQL pas passe) : la tache tourne sans, comme avant", async () => {
    repo.prendreVerrou.mockResolvedValueOnce(null);
    const r = await executerTachePlanifiee(requete(), null);
    expect(r.status).toBe(200);
    expect(etapes.automatique).toHaveBeenCalledTimes(1);
    expect(repo.libererVerrou).not.toHaveBeenCalled();
  });

  it("le verrou est rendu meme si une etape plante", async () => {
    repo.prendreVerrou.mockResolvedValueOnce(true);
    etapes.reconciliation.mockRejectedValueOnce(new Error("Graph 503"));
    etapes.automatique.mockRejectedValueOnce(new Error("Graph 503"));
    const r = await executerTachePlanifiee(requete(), null);
    expect(r.status).toBe(500);
    expect(repo.libererVerrou).toHaveBeenCalledTimes(1);
  });
});

describe("tache planifiee : une boite « destination seulement » (tri:false) n'est jamais traitee", () => {
  it("/api/cron/tri-emails/syndic1@real31.fr : ignoree, ni verrou ni etape", async () => {
    vi.stubEnv(
      "MAIL_TRI_BOITES",
      JSON.stringify([
        { boite: BOITE, agences: ["HLS"], ecriture: true, automatique: true, envoi: false },
        { boite: "syndic1@real31.fr", agences: ["ML"], tri: false, ecriture: true },
      ]),
    );
    const r = await executerTachePlanifiee(requete(), "syndic1@real31.fr");
    expect(await r.json()).toEqual({ boite: "syndic1@real31.fr", ignoree: "boîte absente de la config du tri" });
    expect(repo.prendreVerrou).not.toHaveBeenCalled();
    expect(etapes.lecture).not.toHaveBeenCalled();
    expect(etapes.reprise).not.toHaveBeenCalled();
    expect(etapes.automatique).not.toHaveBeenCalled();
  });
});
