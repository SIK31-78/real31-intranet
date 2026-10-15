import { describe, expect, it, vi } from "vitest";
import { AUCUN_BINOME, type EntreeJournalTri } from "@/lib/domain/tri-emails";
import type { DepsRangement } from "./ranger";
import { envoyerABonneCopro, rendreAuTri } from "./reaffecter";

const BOITE = "syndic4@real31.fr";

const entree = (o: Partial<EntreeJournalTri> = {}): EntreeJournalTri => ({
  id: "j1",
  boite: BOITE,
  internetMessageId: "<m1@x>",
  messageId: "g1",
  expediteur: "x@y.fr",
  objet: "Fuite",
  coproReference: "S0178",
  copros: ["S0178"],
  dossierNom: "NP-MP",
  dossierCle: "binome:nicolas.peloquin@real31.fr",
  signal: null,
  candidats: [],
  simulation: true,
  par: "tri",
  faitLe: "2026-10-15T08:00:00Z",
  annuleLe: null,
  ...o,
});

function deps(journal: EntreeJournalTri[]) {
  const repo = {
    journalDepuis: vi.fn(async () => journal),
    entree: vi.fn(async (id: string) => journal.find((e) => e.id === id) ?? null),
    marquerAnnule: vi.fn(async () => {}),
    dejaRanges: vi.fn(async () => new Set<string>()),
    dossier: vi.fn(async () => null),
    enregistrerDossier: vi.fn(async () => {}),
    journaliser: vi.fn(async () => "j2"),
    binomes: vi.fn(async () => AUCUN_BINOME),
  };
  const rangement = {
    lireEnReception: vi.fn(async () => ({ internetMessageId: "<m1@x>", expediteur: "x@y.fr", objet: "Fuite" })),
    assurerDossier: vi.fn(async () => ({ folderId: "f-mac" })),
    deplacer: vi.fn(async () => ({ messageId: "g2" })),
    etiqueter: vi.fn(async () => {}),
    localiser: vi.fn(async () => null),
    remettreEnReception: vi.fn(async () => ({ messageId: "g1" })),
  };
  const d = {
    boite: BOITE,
    simulation: true,
    rangement,
    repo,
    referentiel: {
      charger: async () => ({
        copros: [
          { reference: "S0109", nom: "STMARTIN", adresse: "Bezons", gestionnaire: { nomComplet: "Mahaut CARTON", email: "mahaut.carton@real31.fr" }, assistant: null },
        ],
        expediteurs: {},
      }),
    },
    initialesParEmail: async () => ({ "mahaut.carton@real31.fr": "MAC" }),
    gestionnaires: async () => [],
  } as unknown as DepsRangement;
  return { d, repo, rangement };
}

describe("« Pas pour moi » : un mail rangé chez le mauvais binôme", () => {
  it("rendre au tri annule le rangement en cours", async () => {
    const { d, repo } = deps([entree()]);
    await rendreAuTri(BOITE, "<m1@x>", "mylene.pin@real31.fr", d);
    expect(repo.marquerAnnule).toHaveBeenCalledWith("j1", "mylene.pin@real31.fr");
  });

  it("un mail jamais rangé par le tri ne peut pas être rendu", async () => {
    const { d } = deps([entree({ annuleLe: "2026-10-15T09:00:00Z" })]);
    await expect(rendreAuTri(BOITE, "<m1@x>", "mp", d)).rejects.toThrow(/pas été rangé/);
  });

  it("envoyer à la bonne copro : annule, puis range chez le binôme de cette copro", async () => {
    const { d, repo } = deps([entree()]);
    const r = await envoyerABonneCopro(BOITE, "<m1@x>", "S0109", "mylene.pin@real31.fr", d);
    expect(repo.marquerAnnule).toHaveBeenCalledWith("j1", "mylene.pin@real31.fr");
    expect(repo.journaliser).toHaveBeenCalledWith(expect.objectContaining({ coproReference: "S0109", par: "mylene.pin@real31.fr" }));
    expect(r.dossierNom).toContain("MAC");
  });

  it("une copro inconnue est refusée avant de toucher au mail", async () => {
    const { d, repo } = deps([entree()]);
    await expect(envoyerABonneCopro(BOITE, "<m1@x>", "S0999", "mp", d)).rejects.toThrow(/pas dans ESTALE/);
    expect(repo.marquerAnnule).not.toHaveBeenCalled();
  });
});
