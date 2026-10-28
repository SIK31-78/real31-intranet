// Mail au CS depuis l'ODJ (REA-146) : un BROUILLON, avec la liste du CS et le PDF joint.
// Tout est simule : aucun appel Graph, aucun Chromium, aucun ESTALE.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Odj } from "@/lib/domain/odj";

const etat = vi.hoisted(() => ({
  odj: null as unknown,
  emails: [] as string[],
  pdf: Buffer.from("%PDF-1.7 odj"),
  brouillons: [] as Record<string, unknown>[],
  echecGraph: false,
  enCopie: [] as { nomComplet: string; email: string }[],
  appelsBinome: [] as unknown[][],
}));

vi.mock("./get-odj", () => ({
  getOdj: async () => etat.odj,
}));
vi.mock("./generer-odj-rempli", () => ({
  pdfOdjRempli: async () => ({ contenu: etat.pdf, nomFichier: "ODJ rempli - S146 - 2026-10-05.pdf" }),
}));
vi.mock("@/lib/services/coproprietes/destinataires-conseil", () => ({
  destinatairesConseilSyndical: async () => ({
    source: etat.emails.length ? "estale" : "aucune",
    emails: etat.emails,
  }),
}));
vi.mock("@/lib/services/coproprietes/assistante-de-copro", () => ({
  binomeEnCopieParCode: async (...args: unknown[]) => {
    etat.appelsBinome.push(args);
    return etat.enCopie;
  },
}));
vi.mock("@/lib/adapters/router", () => ({
  getMailOutboundProvider: () => ({
    async creerBrouillonNeuf(p: Record<string, unknown>) {
      if (etat.echecGraph) throw new Error("Graph 403");
      etat.brouillons.push(p);
      return { webLink: "https://outlook.office.com/mail/drafts/id/AAA" };
    },
  }),
}));

import { MESSAGE_LISTE_VIDE, PDF_MAX_OCTETS, preparerMailOdjAuConseil } from "./preparer-mail-odj-cs";

function odj(): Odj {
  return {
    copro: { code: "S146", nom: "Les Marronniers", adresse: "12 rue des Lilas" },
    dateAg: "16/11/2026",
    dateAgISO: "2026-11-16",
    enTete: [{ id: "date-cs", libelle: "Date du CS", source: "supabase", valeur: "05/10/2026 à 18h30" }],
    sections: [],
    pointsLegaux: [],
  };
}

const preparer = () =>
  preparerMailOdjAuConseil({ idOdj: "S146", gestionnaireId: "g1", boite: "gestionnaire@real31.fr" });

beforeEach(() => {
  etat.odj = odj();
  etat.emails = ["president@exemple.fr", "membre@exemple.fr"];
  etat.pdf = Buffer.from("%PDF-1.7 odj");
  etat.brouillons = [];
  etat.echecGraph = false;
  etat.enCopie = [];
  etat.appelsBinome = [];
});

describe("preparerMailOdjAuConseil", () => {
  it("cree un brouillon dans la boite du gestionnaire, adresse au CS, PDF joint, et rend le lien", async () => {
    const r = await preparer();

    expect(r).toEqual({ ok: true, destinataires: 2, enCopie: [], webLink: "https://outlook.office.com/mail/drafts/id/AAA" });
    expect(etat.brouillons).toHaveLength(1);
    const b = etat.brouillons[0]!;
    expect(b.boite).toBe("gestionnaire@real31.fr");
    expect(b.a).toEqual(["president@exemple.fr", "membre@exemple.fr"]);
    expect(b.cc).toBeUndefined();
    expect(b.sujet).toBe("Ordre du jour du conseil syndical du 05/10/2026 à 18h30 - Les Marronniers");
    expect(b.corps).toContain("assemblée générale du 16/11/2026");
    expect(b.piecesJointes).toEqual([
      {
        nom: "ODJ rempli - S146 - 2026-10-05.pdf",
        contentType: "application/pdf",
        base64: Buffer.from("%PDF-1.7 odj").toString("base64"),
      },
    ]);
  });

  it("l'autre membre du binome en copie du brouillon (28/10/2026), et on le dit", async () => {
    etat.enCopie = [{ nomComplet: "Julie Binôme", email: "julie@real31.fr" }];

    const r = await preparer();
    expect(r.ok && r.enCopie).toEqual(["Julie Binôme"]);
    expect(etat.brouillons[0]!.cc).toEqual(["julie@real31.fr"]);
    // Demande pour la copro de l'ODJ, l'envoyeur = la boite connectee, le CS deja en « À ».
    expect(etat.appelsBinome[0]).toEqual(["S146", "gestionnaire@real31.fr", ["president@exemple.fr", "membre@exemple.fr"]]);
  });

  it("liste du CS vide : message clair et AUCUN brouillon", async () => {
    etat.emails = [];

    expect(await preparer()).toEqual({ ok: false, erreur: MESSAGE_LISTE_VIDE });
    expect(etat.brouillons).toHaveLength(0);
  });

  it("copropriete introuvable : aucun brouillon", async () => {
    etat.odj = null;

    expect((await preparer()).ok).toBe(false);
    expect(etat.brouillons).toHaveLength(0);
  });

  it("PDF trop lourd pour une piece jointe : aucun brouillon, on dit quoi faire", async () => {
    etat.pdf = Buffer.alloc(PDF_MAX_OCTETS + 1);

    const r = await preparer();
    expect(r.ok).toBe(false);
    expect(etat.brouillons).toHaveLength(0);
  });

  it("un echec Graph remonte a l'appelant (l'action le traduit en message)", async () => {
    etat.echecGraph = true;

    await expect(preparer()).rejects.toThrow("Graph 403");
  });
});
