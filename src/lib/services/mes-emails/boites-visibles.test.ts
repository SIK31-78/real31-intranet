// Isolation de « E-mails » et du tri face à une boîte « destination seulement » (ADR-050,
// 28/10/2026) : syndic1 ("tri":false, agence ML, relevée par Crypto) n'est montrée à
// personne, ni aux comptables (toutes les boîtes triées), ni aux super-admins, ni à l'équipe
// ML. Dépendances simulées, données inventées.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/adapters/router", () => ({ getTriRepository: () => ({}) }));
vi.mock("./delegations-mail", () => ({ titulairesDelegants: async () => [] }));
vi.mock("@/lib/services/agences/resoudre-agence", () => ({
  codeAgence: async (id: string | null | undefined) => ({ "ag-hls": "HLS", "ag-lgc": "LGC", "ag-ml": "ML" })[id ?? ""],
}));

const { boitesVisibles } = await import("./boites-visibles");
const { boiteDe, boiteTriAccessible } = await import("@/lib/services/tri-emails/acces");

const S1 = "syndic1@real31.fr";
const AVEC_ML = JSON.stringify([
  { boite: "syndic4@real31.fr", agences: ["HLS"], depuis: "2026-10-14", ecriture: true, automatique: true, envoi: true },
  { boite: "syndic2@real31.fr", agences: ["LGC", "ASN"], depuis: "2026-10-27", ecriture: true, automatique: true, envoi: true },
  { boite: S1, agences: ["ML"], tri: false, ecriture: true },
]);

beforeEach(() => vi.stubEnv("MAIL_TRI_BOITES", AVEC_ML));
afterEach(() => vi.unstubAllEnvs());

const ids = (boites: { id: string }[]) => boites.map((b) => b.id);

describe("« E-mails » : une boîte non triée n'est lue par personne", () => {
  it("comptable : toutes les boîtes TRIÉES dans l'onglet Comptabilité, jamais syndic1", async () => {
    const boites = await boitesVisibles({ email: "compta@real31.fr", agencyId: "ag-ml", role: "COMPTABLE" });
    expect(ids(boites)).toEqual(["compta@real31.fr", "syndic4@real31.fr", "syndic2@real31.fr"]);
  });

  it("super-admin : toutes les boîtes triées, jamais syndic1", async () => {
    const boites = await boitesVisibles({ email: "admin@real31.fr", agencyId: "ag-hls" }, { superAdmin: true });
    expect(ids(boites)).not.toContain(S1);
    expect(ids(boites)).toEqual(["admin@real31.fr", "syndic4@real31.fr", "syndic2@real31.fr"]);
  });

  it("collaborateur de ML : sa seule boîte perso (pas de boîte partagée)", async () => {
    const boites = await boitesVisibles({ email: "gestion.ml@real31.fr", agencyId: "ag-ml" });
    expect(ids(boites)).toEqual(["gestion.ml@real31.fr"]);
  });
});

describe("tri : une boîte non triée n'a pas d'écran", () => {
  it("l'équipe ML n'a pas de boîte triée", async () => {
    expect(await boiteDe({ agencyId: "ag-ml" })).toBeNull();
    expect(await boiteTriAccessible({ agencyId: "ag-ml" }, { superAdmin: false, equipeSyndic: true })).toBeNull();
  });

  it("un super-admin qui demande ?boite=syndic1 n'obtient rien", async () => {
    expect(await boiteTriAccessible({ agencyId: "ag-hls" }, { superAdmin: true, equipeSyndic: true }, S1)).toBeNull();
    expect((await boiteTriAccessible({ agencyId: "ag-hls" }, { superAdmin: true, equipeSyndic: true }))?.boite).toBe("syndic4@real31.fr");
  });
});
