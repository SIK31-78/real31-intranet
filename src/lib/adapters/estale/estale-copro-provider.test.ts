// Test de l'adapter eStale des copros : mapping me.agency.condos -> domaine (agence depuis
// establishment.name, equipe depuis les emails resolus, managerId = 1er GESTIONNAIRE, code
// normalise) + cache module (2 appels = 1 seule requete eStale). estaleGql et les repos
// injectes sont des fakes : zero reseau, zero DB.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { EstaleCoproProvider, _resetCacheCoprosEstale } from "./estale-copro-provider";
import { estaleGql } from "./client";
import type { GestionnaireRepository } from "@/lib/ports/gestionnaire-repository";
import type { AgenceRepository } from "@/lib/ports/agence-repository";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";

vi.mock("./client", () => ({ estaleGql: vi.fn() }));
const gql = vi.mocked(estaleGql);

const AGENCES = [
  { id: "ag-hls", code: "HLS" },
  { id: "ag-lgc", code: "LGC" },
  { id: "ag-ml", code: "ML" },
];

// Annuaire de test : email -> {id, role}. Reproduit la vraie data (Mahaut GESTIONNAIRE,
// Elsa/Romain COMPTABLE, Galiano ASSISTANT, Emmanuel ADMIN = hors equipe).
const USERS: Record<string, Gestionnaire> = {
  "mahaut.carton@real31.fr": { id: "u-mahaut", nomComplet: "Mahaut CARTON", initiales: "MC", role: "GESTIONNAIRE" },
  "elsa.peixoto@real31.fr": { id: "u-elsa", nomComplet: "Elsa PEIXOTO", initiales: "EP", role: "COMPTABLE" },
  "romain.gobert@real31.fr": { id: "u-romain", nomComplet: "Romain GOBERT", initiales: "RG", role: "COMPTABLE" },
  "galiano.guaetta@real31.fr": { id: "u-galiano", nomComplet: "Galiano GUAETTA", initiales: "GG", role: "ASSISTANT" },
  "emmanuel.lopes@real31.fr": { id: "u-manu", nomComplet: "Emmanuel LOPES", initiales: "EL", role: "ADMIN" },
};

let findByEmailCount = 0;
const fakeGestionnaires: GestionnaireRepository = {
  async list() { return []; },
  async listImpersonables() { return []; },
  async findById() { return null; },
  async findByEmail(email: string) {
    findByEmailCount += 1;
    return USERS[email.toLowerCase()] ?? null;
  },
};
const fakeAgences: AgenceRepository = { async listerAgences() { return AGENCES; } };

const CONDOS = [
  {
    id: "condo-300",
    reference: "S0300",
    name: "BEZONS71CA",
    address: { housenumber: "71", street: "rue de Bezons", addressL2: null, addressL3: null, postcode: "95870", city: "Bezons" },
    establishment: { name: "REAL 31 - HLS" },
    collaborators: [
      { id: "x", fullname: "Mahaut CARTON", email: "mahaut.carton@real31.fr" },
      { id: "x", fullname: "Elsa PEIXOTO", email: "elsa.peixoto@real31.fr" },
      { id: "x", fullname: "Romain GOBERT", email: "romain.gobert@real31.fr" },
    ],
  },
  {
    id: "condo-297",
    reference: "S0297",
    name: "Les Pleiades",
    address: { housenumber: "11", street: "rue Georges", addressL2: null, addressL3: null, postcode: "95870", city: "Bezons" },
    establishment: { name: "REAL 31 - LGC" },
    // Aucun GESTIONNAIRE : Romain (COMPTABLE), Galiano (ASSISTANT), Emmanuel (ADMIN), support externe.
    collaborators: [
      { id: "x", fullname: "Romain GOBERT", email: "romain.gobert@real31.fr" },
      { id: "x", fullname: "Galiano GUAETTA", email: "galiano.guaetta@real31.fr" },
      { id: "x", fullname: "Emmanuel LOPES", email: "emmanuel.lopes@real31.fr" },
      { id: "x", fullname: "Support", email: "support+123@estale.fr" },
    ],
  },
];

beforeEach(() => {
  _resetCacheCoprosEstale();
  findByEmailCount = 0;
  gql.mockReset();
  gql.mockResolvedValue({ me: { agency: { condos: CONDOS } } } as never);
});

describe("EstaleCoproProvider.listerCoprosEstale", () => {
  it("mappe l'identite + code normalise (S0300 -> S300)", async () => {
    const p = new EstaleCoproProvider(fakeGestionnaires, fakeAgences);
    const copros = await p.listerCoprosEstale();
    expect(copros.map((c) => c.code).sort()).toEqual(["S297", "S300"]);
    const s300 = copros.find((c) => c.code === "S300")!;
    expect(s300.source).toBe("estale");
    expect(s300.nom).toBe("BEZONS71CA");
    expect(s300.adresse).toEqual({ ligne1: "71 rue de Bezons", codePostal: "95870", ville: "Bezons" });
  });

  it("agence depuis establishment.name (REAL 31 - HLS -> id ag-hls)", async () => {
    const p = new EstaleCoproProvider(fakeGestionnaires, fakeAgences);
    const copros = await p.listerCoprosEstale();
    expect(copros.find((c) => c.code === "S300")?.agenceId).toBe("ag-hls");
    expect(copros.find((c) => c.code === "S297")?.agenceId).toBe("ag-lgc");
  });

  it("equipe = gestionnaire/assistant/comptable ; managerId = 1er GESTIONNAIRE", async () => {
    const p = new EstaleCoproProvider(fakeGestionnaires, fakeAgences);
    const s300 = (await p.listerCoprosEstale()).find((c) => c.code === "S300")!;
    expect(s300.managerId).toBe("u-mahaut");
    expect(s300.equipe.map((m) => `${m.nomComplet}:${m.role}`)).toEqual([
      "Mahaut CARTON:gestionnaire",
      "Elsa PEIXOTO:comptable",
      "Romain GOBERT:comptable",
    ]);
  });

  it("copro orpheline : aucun GESTIONNAIRE -> managerId absent ; ADMIN/externe exclus de l'equipe", async () => {
    const p = new EstaleCoproProvider(fakeGestionnaires, fakeAgences);
    const s297 = (await p.listerCoprosEstale()).find((c) => c.code === "S297")!;
    expect(s297.managerId).toBeUndefined();
    // Romain (comptable) + Galiano (assistant) ; Emmanuel (ADMIN) et le support externe exclus.
    expect(s297.equipe.map((m) => m.role).sort()).toEqual(["assistant", "comptable"]);
  });

  it("cache module : 2 appels = 1 seule requete eStale", async () => {
    const p = new EstaleCoproProvider(fakeGestionnaires, fakeAgences);
    await p.listerCoprosEstale();
    const apres1 = findByEmailCount;
    await p.listerCoprosEstale();
    expect(gql).toHaveBeenCalledTimes(1);
    expect(findByEmailCount).toBe(apres1); // pas de re-resolution d'equipe
  });

  it("cache negatif : un echec est memorise -> le 2e appel rejette SANS refetch eStale", async () => {
    gql.mockReset();
    gql.mockRejectedValueOnce(new Error("eStale KO"));
    const p = new EstaleCoproProvider(fakeGestionnaires, fakeAgences);
    await expect(p.listerCoprosEstale()).rejects.toThrow("eStale KO");
    // 2e appel immediat : rejette encore, mais SANS rappeler eStale (fenetre negative chaude).
    await expect(p.listerCoprosEstale()).rejects.toThrow("eStale KO");
    expect(gql).toHaveBeenCalledTimes(1);
  });

  it("dedup in-flight : 2 appels concurrents = 1 seule requete eStale", async () => {
    const p = new EstaleCoproProvider(fakeGestionnaires, fakeAgences);
    const [a, b] = await Promise.all([p.listerCoprosEstale(), p.listerCoprosEstale()]);
    expect(gql).toHaveBeenCalledTimes(1);
    expect(a).toBe(b); // promesse partagee -> meme resultat
  });

  it("getCoproEstale resout par reference normalisee", async () => {
    const p = new EstaleCoproProvider(fakeGestionnaires, fakeAgences);
    expect((await p.getCoproEstale("S0300"))?.code).toBe("S300");
    expect((await p.getCoproEstale("S300"))?.code).toBe("S300");
    expect(await p.getCoproEstale("S999")).toBeNull();
  });
});
