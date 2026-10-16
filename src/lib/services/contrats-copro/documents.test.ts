import { beforeEach, describe, expect, it, vi } from "vitest";

// Documents (REA-333) : refus sans sharepointUrl, dépôt inactif, MIME et taille, chemin par
// segments (« Ascenseurs » puis « CTQ »), pointeur enregistré avec driveId / itemId, retrait.

import { AUTEUR, FausseBaseContrats } from "./fausse-base.test-util";

const etat = vi.hoisted(() => ({
  base: null as unknown as { [k: string]: unknown },
  sharepointUrl: "https://real31.sharepoint.com/sites/copro/HLS/S104 - LE CYRANO/AG" as string | undefined,
  depotActif: true,
  depots: [] as { dossierUrl: string; sousDossiers: string[]; nomFichier: string; contentType?: string; taille: number }[],
  reponseDepot: { depose: true, webUrl: "https://sp/x", driveId: "drv", itemId: "itm" } as Record<string, unknown>,
}));

vi.mock("@/lib/observabilite", () => ({ signalerException: () => undefined }));
vi.mock("@/lib/services/coproprietes/exiger-perimetre", () => ({ exigerPerimetre: async () => undefined }));
vi.mock("@/lib/adapters/router", () => ({
  getContratsCoproRepository: () => etat.base,
  getCoproRepository: () => ({ findByCode: async (code: string) => ({ code, nom: "Copro", sharepointUrl: etat.sharepointUrl }) }),
  getDepotDocumentProvider: () => ({
    actif: etat.depotActif,
    async deposer(p: { dossierUrl: string; sousDossiers: string[]; nomFichier: string; contenu: Buffer; contentType?: string }) {
      etat.depots.push({ dossierUrl: p.dossierUrl, sousDossiers: p.sousDossiers, nomFichier: p.nomFichier, contentType: p.contentType, taille: p.contenu.length });
      return etat.reponseDepot;
    },
  }),
}));

import { deposerDocument, documentsDepotActif, nomFichierStocke, retirerDocument, slugifier } from "./documents";

let base: FausseBaseContrats;
const PDF = Buffer.from("%PDF-1.4 contenu de test").toString("base64");

function entree(extra: Partial<Parameters<typeof deposerDocument>[0]> = {}): Parameters<typeof deposerDocument>[0] {
  return {
    coproCode: "S104",
    sujet: "ctq_ascenseur",
    typeDocument: "rapport_ctq",
    rattachement: { type: "copro", coproCode: "S104" },
    nomFichier: "Rapport CTQ ascenseur A.pdf",
    mime: "application/pdf",
    tailleOctets: 24,
    contenuBase64: PDF,
    aujourdhuiISO: "2026-10-16",
    ...extra,
  };
}

beforeEach(() => {
  base = new FausseBaseContrats();
  etat.base = base as unknown as { [k: string]: unknown };
  etat.sharepointUrl = "https://real31.sharepoint.com/sites/copro/HLS/S104 - LE CYRANO/AG";
  etat.depotActif = true;
  etat.depots = [];
  etat.reponseDepot = { depose: true, webUrl: "https://sp/x", driveId: "drv", itemId: "itm" };
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("nommage", () => {
  it("slugifie accents, apostrophes et caractères interdits", () => {
    expect(slugifier("Relevé d'une Société : Été/2026 ?")).toBe("Releve_dune_Societe_Ete2026");
  });
  it("nom stocké <code>_<TYPE>[_<fournisseur>]_<jour>.<ext>", () => {
    expect(nomFichierStocke({ coproCode: "S104", typeDocument: "offre", fournisseur: "Allianz France", jourISO: "2026-10-16", mime: "application/pdf" })).toBe("S104_OFFRE_Allianz_France_2026-10-16.pdf");
    expect(nomFichierStocke({ coproCode: "S104", typeDocument: "rapport_ctq", jourISO: "2026-10-16", mime: "image/jpeg" })).toBe("S104_RAPPORT_CTQ_2026-10-16.jpg");
  });
});

describe("deposerDocument", () => {
  it("dépose sous Contrats / Ascenseurs / CTQ (deux segments), enregistre le pointeur, journalise", async () => {
    const d = await deposerDocument(entree(), AUTEUR);
    expect(etat.depots).toHaveLength(1);
    expect(etat.depots[0]).toMatchObject({
      dossierUrl: "https://real31.sharepoint.com/sites/copro/HLS/S104 - LE CYRANO",
      sousDossiers: ["Contrats", "Ascenseurs", "CTQ"],
      nomFichier: "S104_RAPPORT_CTQ_2026-10-16.pdf",
      contentType: "application/pdf",
    });
    expect(d).toMatchObject({ nomAffiche: "Rapport CTQ ascenseur A", nomFichier: "S104_RAPPORT_CTQ_2026-10-16.pdf", driveId: "drv", itemId: "itm", webUrl: "https://sp/x", deposeParId: "user-1" });
    expect(base.documents).toHaveLength(1);
    expect(base.journal[0]).toMatchObject({ type: "document_depose", sujet: "ctq_ascenseur", details: { nom: "Rapport CTQ ascenseur A", typeDocument: "rapport_ctq" } });
  });

  it("le nom d'un document d'offre porte le fournisseur ; une offre d'une autre copro est refusée", async () => {
    const c = base.ajouterCycle({ sujet: "assurance", coproCode: "S104" });
    const o = await base.creerOffreAssurance({ cycleId: c.id, assureur: "Allianz", prime: 1, franchise: 0, garanties: null, recueLeISO: null });
    await deposerDocument(entree({ sujet: "assurance", typeDocument: "offre", rattachement: { type: "offre_assurance", offreId: o.id } }), AUTEUR);
    expect(etat.depots[0].nomFichier).toBe("S104_OFFRE_Allianz_2026-10-16.pdf");
    expect(etat.depots[0].sousDossiers).toEqual(["Contrats", "Assurance"]);
    await expect(deposerDocument(entree({ coproCode: "S088", sujet: "assurance", typeDocument: "offre", rattachement: { type: "offre_assurance", offreId: o.id } }), AUTEUR)).rejects.toThrow(/introuvable/);
  });

  it("refuse sans sharepointUrl, et quand le dépôt est inactif, sans rien écrire", async () => {
    etat.sharepointUrl = undefined;
    await expect(deposerDocument(entree(), AUTEUR)).rejects.toThrow(/dossier SharePoint/);
    etat.sharepointUrl = "https://x/AG";
    etat.depotActif = false;
    await expect(deposerDocument(entree(), AUTEUR)).rejects.toThrow(/pas activé/);
    expect(documentsDepotActif()).toBe(false);
    expect(etat.depots).toHaveLength(0);
    expect(base.documents).toHaveLength(0);
  });

  it("refuse un MIME hors liste et un fichier de plus de 4 Mo, avec un message actionnable", async () => {
    await expect(deposerDocument(entree({ mime: "application/zip" }), AUTEUR)).rejects.toThrow(/Type de fichier/);
    await expect(deposerDocument(entree({ tailleOctets: 5 * 1024 * 1024 }), AUTEUR)).rejects.toThrow(/compresse/);
    expect(etat.depots).toHaveLength(0);
  });

  it("échec SharePoint : la raison remonte, pas de pointeur ; identifiants absents : refus explicite", async () => {
    etat.reponseDepot = { depose: false, raison: "l'intranet n'a pas le droit d'écrire dans SharePoint." };
    await expect(deposerDocument(entree(), AUTEUR)).rejects.toThrow(/pas le droit/);
    etat.reponseDepot = { depose: true, webUrl: "https://sp/x" };
    await expect(deposerDocument(entree(), AUTEUR)).rejects.toThrow(/identifiant/);
    expect(base.documents).toHaveLength(0);
  });
});

describe("retirerDocument", () => {
  it("masque le pointeur et journalise ; un second retrait est refusé", async () => {
    const d = await deposerDocument(entree(), AUTEUR);
    await retirerDocument({ coproCode: "S104", documentId: d.id }, AUTEUR);
    expect(base.documents[0].supprimeLeISO).toBeTruthy();
    expect(base.journal.at(-1)).toMatchObject({ type: "document_retire", details: { nom: "Rapport CTQ ascenseur A" } });
    await expect(retirerDocument({ coproCode: "S104", documentId: d.id }, AUTEUR)).rejects.toThrow(/introuvable/);
  });
});
