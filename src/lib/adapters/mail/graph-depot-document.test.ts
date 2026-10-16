// L'adaptateur de dépôt SharePoint : enchaînement des appels Graph (site, bibliothèques,
// dossiers, envoi) sur un faux fetch. Zéro réseau.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./graph-auth", () => ({
  jetonGraph: async () => "jeton",
  graphFetch: (url: string, init?: RequestInit) => fetch(url, init),
}));

import { GraphDepotDocumentProvider } from "./graph-depot-document";

const LIEN = "https://real31france.sharepoint.com/sites/copro/LGC/Bleuets%202%20bis/AG";
type Appel = { url: string; methode: string; corps?: unknown };
let appels: Appel[];

function repondre(statutDossier = 201, statutEnvoi = 201, statutSite = 200) {
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const methode = init?.method ?? "GET";
    appels.push({ url, methode, corps: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
    const json = (statut: number, corps: unknown) => new Response(JSON.stringify(corps), { status: statut });
    if (url.includes("/sites/real31france")) return json(statutSite, { id: "site-1" });
    if (url.endsWith("/drives?$select=id,webUrl")) {
      return json(200, { value: [{ id: "d-lgc", webUrl: "https://real31france.sharepoint.com/sites/copro/LGC" }] });
    }
    if (url.includes(":/children")) return json(statutDossier, {});
    if (methode === "PUT") {
      // Comme Graph en « rename » : un nom réel suffixé quand le conflit se règle en renommant.
      const renomme = url.includes("conflictBehavior=rename");
      return json(statutEnvoi, { id: "it-1", name: renomme ? "05 - contrat de syndic 1.pdf" : "05 - contrat de syndic.pdf", webUrl: "https://sp/fichier.pdf", parentReference: { driveId: "d-lgc" } });
    }
    return json(404, {});
  });
}

const depot = { dossierUrl: LIEN, sousDossiers: ["2026", "Docs pour convocation"], nomFichier: "05 - contrat de syndic.pdf", contenu: Buffer.from("%PDF") };

beforeEach(() => {
  appels = [];
});
afterEach(() => vi.unstubAllGlobals());

describe("GraphDepotDocumentProvider", () => {
  it("crée les dossiers manquants puis envoie le fichier au bon chemin", async () => {
    repondre();
    const r = await new GraphDepotDocumentProvider().deposer(depot);
    expect(r).toEqual({ depose: true, webUrl: "https://sp/fichier.pdf", driveId: "d-lgc", itemId: "it-1", nom: "05 - contrat de syndic.pdf" });
    const dossiers = appels.filter((a) => a.url.includes(":/children"));
    expect(dossiers.map((a) => a.url)).toEqual([
      "https://graph.microsoft.com/v1.0/drives/d-lgc/root:/Bleuets%202%20bis/AG:/children",
      "https://graph.microsoft.com/v1.0/drives/d-lgc/root:/Bleuets%202%20bis/AG/2026:/children",
    ]);
    expect(dossiers.map((a) => (a.corps as { name: string }).name)).toEqual(["2026", "Docs pour convocation"]);
    const envoi = appels.find((a) => a.methode === "PUT")!;
    expect(envoi.url).toBe(
      "https://graph.microsoft.com/v1.0/drives/d-lgc/root:/Bleuets%202%20bis/AG/2026/Docs%20pour%20convocation/05%20-%20contrat%20de%20syndic.pdf:/content",
    );
  });

  it("par défaut le PUT remplace (pas de conflictBehavior) ; en « renommer » il porte ?@microsoft.graph.conflictBehavior=rename et rend le nom réel", async () => {
    repondre();
    await new GraphDepotDocumentProvider().deposer(depot);
    expect(appels.find((a) => a.methode === "PUT")!.url.includes("conflictBehavior")).toBe(false);

    appels = [];
    const r = await new GraphDepotDocumentProvider().deposer({ ...depot, conflit: "renommer" });
    const envoi = appels.find((a) => a.methode === "PUT")!;
    expect(envoi.url).toBe(
      "https://graph.microsoft.com/v1.0/drives/d-lgc/root:/Bleuets%202%20bis/AG/2026/Docs%20pour%20convocation/05%20-%20contrat%20de%20syndic.pdf:/content?@microsoft.graph.conflictBehavior=rename",
    );
    expect(r).toMatchObject({ depose: true, nom: "05 - contrat de syndic 1.pdf", itemId: "it-1" });
  });

  it("un dossier déjà présent (409) n'empêche pas l'envoi", async () => {
    repondre(409);
    expect((await new GraphDepotDocumentProvider().deposer(depot)).depose).toBe(true);
  });

  it("sans droit SharePoint (403), la raison est lisible et rien ne lève", async () => {
    repondre(403);
    const r = await new GraphDepotDocumentProvider().deposer(depot);
    expect(r.depose).toBe(false);
    expect(r).toMatchObject({ raison: expect.stringContaining("pas le droit") });
  });

  it("dossier AG absent (404) : on le dit au lieu de créer une arborescence au hasard", async () => {
    repondre(404);
    const r = await new GraphDepotDocumentProvider().deposer(depot);
    expect(r).toMatchObject({ depose: false, raison: expect.stringContaining("n'existe pas") });
    expect(appels.some((a) => a.methode === "PUT")).toBe(false);
  });
});
