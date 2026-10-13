import { beforeEach, describe, expect, it, vi } from "vitest";

// REA-272 : poser (ou deplacer) la date du CS depuis la fiche envoie un mail aux comptables
// de l'agence, avec la date d'AG si on la connait. Jamais bloquant.

const etat = vi.hoisted(() => ({
  agence: "ML" as string | undefined,
  prochaineAg: { date: "2026-12-10", heure: "18:30", statut: "planifiee" } as
    | { date: string; heure?: string; statut: string }
    | undefined,
  envois: [] as { boite: string; a: string[]; cc: string[]; cci: string[]; sujet: string; corps: string }[],
  panneMail: false,
}));

vi.mock("@/lib/observabilite", () => ({ signalerException: () => undefined }));
vi.mock("@/lib/adapters/router", () => ({
  getCoproRepository: () => ({
    async findByCode(code: string) {
      return { code, nom: "LES TILLEULS", agenceId: "ag-1", prochaineAg: etat.prochaineAg };
    },
  }),
  getAgenceRepository: () => ({
    async listerAgences() {
      return etat.agence ? [{ id: "ag-1", code: etat.agence }] : [];
    },
  }),
  getMailOutboundProvider: () => ({
    async envoyerNeuf(p: (typeof etat.envois)[number]) {
      if (etat.panneMail) throw new Error("Graph HTTP 503");
      etat.envois.push(p);
    },
  }),
}));

import { comptablesPourAgence } from "@/lib/domain/perimetre-comptable";
import { annoncerDateCsAuxComptables, corpsAnnonceCs, dateCsInchangee, sujetAnnonceCs } from "./annoncer-date-cs";

const base = { coproCode: "S230", dateCsISO: "2026-11-15T18:00", boite: "gest@real31.fr" };

beforeEach(() => {
  etat.agence = "ML";
  etat.prochaineAg = { date: "2026-12-10", heure: "18:30", statut: "planifiee" };
  etat.envois = [];
  etat.panneMail = false;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("contenu du mail", () => {
  it("sujet : code + date du CS", () => {
    expect(sujetAnnonceCs("S230", "2026-11-15T18:00")).toBe("S230 - Conseil syndical le 15/11/2026");
  });

  it("corps : date du CS avec l'heure, puis date d'AG si connue", () => {
    const c = corpsAnnonceCs({ coproCode: "S230", coproNom: "LES TILLEULS", dateCsISO: "2026-11-15T18:00", dateAgISO: "2026-12-10", heureAg: "18:30" });
    expect(c).toContain("La réunion du conseil syndical de S230 - LES TILLEULS est fixée au 15/11/2026 à 18:00.");
    expect(c).toContain("L'assemblée générale est prévue le 10/12/2026 à 18:30.");
  });

  it("corps : pas de date d'AG -> on ne la mentionne pas", () => {
    const c = corpsAnnonceCs({ coproCode: "S230", coproNom: "X", dateCsISO: "2026-11-15", dateAgISO: null });
    expect(c).toContain("est fixée au 15/11/2026.");
    expect(c).not.toContain("assemblée générale");
  });

  it("date inchangee = meme jour ET meme heure", () => {
    expect(dateCsInchangee("2026-11-15T18:00", "2026-11-15T18:00:00")).toBe(true);
    expect(dateCsInchangee("2026-11-15T18:00", "2026-11-15T19:00")).toBe(false);
    expect(dateCsInchangee("2026-11-15T18:00", "2026-11-14T18:00")).toBe(false);
    expect(dateCsInchangee("2026-11-15T18:00", null)).toBe(false);
  });
});

describe("annoncerDateCsAuxComptables", () => {
  it("envoie aux comptables de l'agence, copie au gestionnaire", async () => {
    const r = await annoncerDateCsAuxComptables(base);
    expect(r.envoye).toBe(true);
    expect(etat.envois).toHaveLength(1);
    expect(etat.envois[0].a).toEqual(comptablesPourAgence("ML"));
    expect(etat.envois[0].a.length).toBeGreaterThan(0);
    expect(etat.envois[0].cc).toEqual(["gest@real31.fr"]);
    expect(etat.envois[0].boite).toBe("gest@real31.fr");
    expect(etat.envois[0].corps).toContain("10/12/2026 à 18:30");
  });

  it("sans date d'AG connue, le mail part sans la mentionner", async () => {
    etat.prochaineAg = undefined;
    await annoncerDateCsAuxComptables(base);
    expect(etat.envois[0].corps).not.toContain("assemblée générale");
  });

  it("date inchangee (re-sauvegarde) -> pas de mail", async () => {
    const r = await annoncerDateCsAuxComptables({ ...base, ancienneDateCsISO: "2026-11-15T18:00" });
    expect(r.envoye).toBe(false);
    expect(etat.envois).toHaveLength(0);
  });

  it("sans boite de session -> pas de mail", async () => {
    expect((await annoncerDateCsAuxComptables({ ...base, boite: undefined })).envoye).toBe(false);
    expect(etat.envois).toHaveLength(0);
  });

  it("aucun comptable sur l'agence -> pas de mail, pas d'erreur", async () => {
    etat.agence = undefined;
    const r = await annoncerDateCsAuxComptables(base);
    expect(r).toEqual({ envoye: false, a: [] });
  });

  it("panne d'envoi -> ne leve JAMAIS (best-effort)", async () => {
    etat.panneMail = true;
    await expect(annoncerDateCsAuxComptables(base)).resolves.toEqual({ envoye: false, a: [] });
  });
});
