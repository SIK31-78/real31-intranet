import { describe, expect, it, vi } from "vitest";
import { MockTriRepository } from "@/lib/adapters/mock/mock-tri-repository";
import type { PositionMail, RangementTriProvider } from "@/lib/ports/rangement-tri-provider";
import type { ReferentielTri } from "@/lib/domain/tri-emails";
import type { DepsRangement } from "@/lib/services/tri-emails/ranger";
import { reconcilierRangements } from "@/lib/services/tri-emails/reconcilier";

const BOITE = "copro2@real31.fr";
const gest = (email: string) => ({ nomComplet: email, email });
const REF: ReferentielTri = {
  copros: [
    { reference: "S0297", nom: "A", adresse: "", gestionnaire: gest("sandy@real31.fr"), assistant: null },
    { reference: "S0305", nom: "B", adresse: "", gestionnaire: gest("oceane@real31.fr"), assistant: null },
    { reference: "S0303", nom: "C", adresse: "", gestionnaire: gest("charlotte@real31.fr"), assistant: null },
    { reference: "S0304", nom: "D", adresse: "", gestionnaire: gest("charlotte@real31.fr"), assistant: null },
  ],
  expediteurs: {},
};

async function monter(position: PositionMail | null) {
  const repo = new MockTriRepository();
  await repo.enregistrerDossier(BOITE, "binome:sandy@real31.fr", { folderId: "f-sc", nom: "SC" });
  await repo.enregistrerDossier(BOITE, "binome:oceane@real31.fr", { folderId: "f-or", nom: "OR" });
  await repo.enregistrerDossier(BOITE, "binome:charlotte@real31.fr", { folderId: "f-cl", nom: "CL" });
  const id = await repo.journaliser({
    boite: BOITE,
    internetMessageId: "<m1>",
    messageId: "m1",
    expediteur: "x@exemple.fr",
    objet: "Objet",
    coproReference: "S0297",
    copros: ["S0297"],
    dossierNom: "SC",
    dossierCle: "binome:sandy@real31.fr",
    signal: "sure",
    candidats: ["S0297"],
    simulation: false,
    par: "sekou",
  });
  const appels: string[] = [];
  const rangement: RangementTriProvider = {
    lireEnReception: async () => null,
    assurerDossier: async () => ({ folderId: "x" }),
    deplacer: async () => ({ messageId: "x" }),
    remettreEnReception: async () => ({ messageId: "x" }),
    supprimer: async () => ({ messageId: "x" }),
    etiqueter: async (_b, mid, p) => {
      appels.push(`${mid} +${(p.ajouter ?? []).join(",")} -${(p.retirer ?? []).join(",")}`);
    },
    localiser: async () => position,
  };
  const deps: DepsRangement = {
    boite: BOITE,
    simulation: false,
    rangement,
    referentiel: { charger: async () => REF },
    repo,
    initialesParEmail: async () => ({ "sandy@real31.fr": "SC", "oceane@real31.fr": "OR", "charlotte@real31.fr": "CL" }),
    gestionnaires: async () => [],
  };
  return { repo, deps, id, appels };
}

const ici = (folderId: string, enReception = false): PositionMail => ({ messageId: "m1-bis", folderId, enReception, categories: ["S0297"] });

describe("reconcilierRangements", () => {
  it("laisse en paix un mail reste a sa place", async () => {
    const { deps, appels } = await monter(ici("f-sc"));
    expect(await reconcilierRangements(deps)).toEqual({ verifies: 1, remisEnFile: 0, deplaces: 0, echecs: 0 });
    expect(appels).toEqual([]);
  });

  it("remis dans la generique : retire l'etiquette et rend le mail a la file", async () => {
    const { deps, repo, id, appels } = await monter(ici("inbox", true));
    expect((await reconcilierRangements(deps)).remisEnFile).toBe(1);
    expect(appels).toEqual(["m1-bis + -S0297"]);
    expect((await repo.entree(id))?.annuleLe).not.toBeNull();
    expect((await repo.dejaRanges(BOITE, ["<m1>"], { reellesSeulement: true })).size).toBe(0);
  });

  it("glisse vers un binome a copro unique : corrige l'etiquette", async () => {
    const { deps, repo, appels } = await monter(ici("f-or"));
    expect((await reconcilierRangements(deps)).deplaces).toBe(1);
    expect(appels).toEqual(["m1-bis + -S0297", "m1-bis +S0305 -"]);
    const actives = await repo.journalDepuis(BOITE, "2000-01-01");
    expect(actives).toHaveLength(1);
    expect(actives[0]).toMatchObject({ coproReference: "S0305", dossierNom: "OR", par: "outlook" });
  });

  it("glisse vers un binome a plusieurs copros : copro a preciser", async () => {
    const { deps, repo } = await monter(ici("f-cl"));
    await reconcilierRangements(deps);
    expect((await repo.journalDepuis(BOITE, "2000-01-01"))[0]).toMatchObject({ coproReference: null, dossierNom: "CL" });
  });

  it("deux passages simultanes (tache planifiee + ecran) ne traitent le mail qu'une fois", async () => {
    const { deps, repo, appels } = await monter(ici("f-or"));
    const [a, b] = await Promise.all([reconcilierRangements(deps), reconcilierRangements(deps)]);
    expect(a.deplaces + b.deplaces).toBe(1);
    expect(appels).toEqual(["m1-bis + -S0297", "m1-bis +S0305 -"]);
    expect(await repo.journalDepuis(BOITE, "2000-01-01")).toHaveLength(1);
  });

  it("une etiquette en echec ne laisse pas le mail orphelin : la ligne « glisse dans Outlook » est ecrite", async () => {
    const { deps, repo } = await monter(ici("f-or"));
    deps.rangement.etiqueter = async () => {
      throw new Error("Graph : 503");
    };
    const silence = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await reconcilierRangements(deps)).toMatchObject({ deplaces: 1, echecs: 0 });
    const actives = await repo.journalDepuis(BOITE, "2000-01-01");
    expect(actives).toHaveLength(1);
    expect(actives[0]).toMatchObject({ coproReference: "S0305", dossierNom: "OR", par: "outlook" });
    silence.mockRestore();
  });

  it("un mail dont la relecture echoue est compte en echec, les autres sont traites", async () => {
    const { deps, repo } = await monter(ici("f-or"));
    await repo.journaliser({
      boite: BOITE, internetMessageId: "<m2>", messageId: "m2", expediteur: "y@exemple.fr", objet: "Deux", coproReference: "S0297",
      copros: ["S0297"], dossierNom: "SC", dossierCle: "binome:sandy@real31.fr", signal: "sure", candidats: ["S0297"], simulation: false, par: "sekou",
    });
    deps.rangement.localiser = async (_b, imid) => {
      if (imid === "<m2>") throw new Error("Graph : 429");
      return ici("f-or");
    };
    const silence = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await reconcilierRangements(deps)).toMatchObject({ verifies: 2, deplaces: 1, echecs: 1 });
    silence.mockRestore();
  });

  it("s'arrete au budget de temps : les lots suivants attendent le prochain passage", async () => {
    const { deps, repo } = await monter(ici("f-sc"));
    for (const n of [2, 3, 4, 5, 6]) {
      await repo.journaliser({
        boite: BOITE, internetMessageId: `<m${n}>`, messageId: `m${n}`, expediteur: "y@exemple.fr", objet: "N", coproReference: "S0297",
        copros: ["S0297"], dossierNom: "SC", dossierCle: "binome:sandy@real31.fr", signal: "sure", candidats: ["S0297"], simulation: false, par: "sekou",
      });
    }
    // Chaque lecture de l'horloge avance de 10 s : le budget de 15 s laisse passer un lot de 4.
    let t = 0;
    expect((await reconcilierRangements(deps, () => (t += 10_000))).verifies).toBe(4);
  });

  it("ne touche a rien si le mail est introuvable ou en simulation", async () => {
    const perdu = await monter(null);
    await reconcilierRangements(perdu.deps);
    expect(perdu.appels).toEqual([]);
    const simule = await monter(ici("inbox", true));
    expect(await reconcilierRangements({ ...simule.deps, simulation: true })).toEqual({ verifies: 0, remisEnFile: 0, deplaces: 0, echecs: 0 });
  });
});
