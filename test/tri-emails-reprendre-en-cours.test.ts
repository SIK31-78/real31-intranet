// Reprise des rangements interrompus (REA-420) : une ligne « en_cours » de plus de 2 min est
// tranchee d'apres la position du mail dans la boite. Dependances en memoire, zero reseau.

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/observabilite", () => ({ signalerException: vi.fn() }));

import { MockTriRepository } from "@/lib/adapters/mock/mock-tri-repository";
import { signalerException } from "@/lib/observabilite";
import type { PositionMail, RangementTriProvider } from "@/lib/ports/rangement-tri-provider";
import type { ReceptionIndex } from "@/lib/ports/reception-index";
import type { ReferentielTri } from "@/lib/domain/tri-emails";
import { rangerMail, type DepsRangement } from "@/lib/services/tri-emails/ranger";
import { reprendreEnCours } from "@/lib/services/tri-emails/reprendre-en-cours";

const BOITE = "syndic4@real31.fr";
const REF: ReferentielTri = {
  copros: [{ reference: "S0297", nom: "A", adresse: "", gestionnaire: { nomComplet: "Sandy", email: "sandy@real31.fr" }, assistant: null }],
  expediteurs: {},
};
const PLUS_TARD = () => Date.now() + 3 * 60_000;

/** Un rangement interrompu : deplace dans Graph, mais Supabase tombe a la confirmation. */
async function monter(position: PositionMail | null) {
  const repo = new MockTriRepository();
  const confirmer = repo.confirmerRangement.bind(repo);
  repo.confirmerRangement = async () => {
    throw new Error("Supabase indisponible");
  };
  const rangement: RangementTriProvider = {
    lireEnReception: async () => ({ internetMessageId: "<m1>", expediteur: "x@exemple.fr", objet: "Fuite" }),
    assurerDossier: async () => ({ folderId: "f-sc" }),
    deplacer: async (_b, id) => ({ messageId: id }),
    remettreEnReception: async (_b, id) => ({ messageId: id }),
    supprimer: async (_b, id) => ({ messageId: id }),
    etiqueter: async () => {},
    localiser: vi.fn(async () => position),
  };
  const index = { sortir: vi.fn(async () => {}), remettre: vi.fn(async () => {}) };
  const deps: DepsRangement = {
    boite: BOITE,
    simulation: false,
    rangement,
    referentiel: { charger: async () => REF },
    repo,
    initialesParEmail: async () => ({ "sandy@real31.fr": "SC" }),
    gestionnaires: async () => [],
    index: index as unknown as ReceptionIndex,
  };
  await expect(
    rangerMail(
      { messageId: "g1", internetMessageId: "<m1>", expediteur: "x@exemple.fr", objet: "Fuite", cible: { type: "copro", reference: "S0297" }, suggestion: null },
      "automatique",
      deps,
    ),
  ).rejects.toThrow(/pas pu être confirmé/);
  // Supabase revient.
  repo.confirmerRangement = confirmer;
  return { repo, deps, index, rangement };
}

describe("reprendreEnCours", () => {
  it("une ligne de moins de 2 min n'est pas reprise : le rangement est peut-etre en train de se faire", async () => {
    const { deps, rangement } = await monter({ messageId: "g1", folderId: "f-sc", enReception: false, categories: [] });
    expect(await reprendreEnCours(deps)).toEqual({ confirmees: 0, annulees: 0, introuvables: 0, echecs: 0 });
    expect(rangement.localiser).not.toHaveBeenCalled();
  });

  it("Supabase en panne apres le deplacement : la reprise trouve le mail dans son dossier et confirme la ligne", async () => {
    const { deps, repo, index } = await monter({ messageId: "g1-immuable", folderId: "f-sc", enReception: false, categories: ["S0297"] });
    expect(await reprendreEnCours(deps, PLUS_TARD)).toEqual({ confirmees: 1, annulees: 0, introuvables: 0, echecs: 0 });
    expect(await repo.entree("j-1")).toMatchObject({ etat: "fait", messageId: "g1-immuable", annuleLe: null });
    expect(index.sortir).toHaveBeenCalledWith(BOITE, ["<m1>"]);
    // Confirmee : elle compte de nouveau pour les lectures, et n'est plus a reprendre.
    expect(await repo.dejaRanges(BOITE, ["<m1>"], { reellesSeulement: true })).toEqual(new Set(["<m1>"]));
    expect(await reprendreEnCours(deps, PLUS_TARD)).toEqual({ confirmees: 0, annulees: 0, introuvables: 0, echecs: 0 });
  });

  it("le mail est encore en reception : ligne annulee par « systeme », mail remis dans l'index", async () => {
    const { deps, repo, index } = await monter({ messageId: "g1", folderId: "inbox", enReception: true, categories: [] });
    const annuler = vi.spyOn(repo, "marquerAnnule");
    expect(await reprendreEnCours(deps, PLUS_TARD)).toEqual({ confirmees: 0, annulees: 1, introuvables: 0, echecs: 0 });
    expect(annuler).toHaveBeenCalledWith("j-1", "systeme", expect.stringMatching(/réception/));
    expect((await repo.entree("j-1"))?.annuleLe).not.toBeNull();
    expect(index.remettre).toHaveBeenCalledWith(BOITE, "<m1>", "g1");
  });

  it("introuvable : ligne annulee et signalee", async () => {
    const { deps, repo } = await monter(null);
    expect(await reprendreEnCours(deps, PLUS_TARD)).toEqual({ confirmees: 0, annulees: 0, introuvables: 1, echecs: 0 });
    expect((await repo.entree("j-1"))?.annuleLe).not.toBeNull();
    expect(signalerException).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ source: "cron-tri-emails" }));
  });

  it("une relecture en echec est comptee, la ligne reste a reprendre", async () => {
    const { deps, repo } = await monter(null);
    deps.rangement.localiser = async () => {
      throw new Error("Graph 503");
    };
    expect(await reprendreEnCours(deps, PLUS_TARD)).toEqual({ confirmees: 0, annulees: 0, introuvables: 0, echecs: 1 });
    expect(await repo.entree("j-1")).toMatchObject({ etat: "en_cours", annuleLe: null });
  });

  it("rien en simulation", async () => {
    const { deps, rangement } = await monter(null);
    expect(await reprendreEnCours({ ...deps, simulation: true }, PLUS_TARD)).toEqual({ confirmees: 0, annulees: 0, introuvables: 0, echecs: 0 });
    expect(rangement.localiser).not.toHaveBeenCalled();
  });
});
