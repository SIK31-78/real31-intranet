import { describe, expect, it, vi } from "vitest";
import type { CoproTri, ReferentielTri } from "@/lib/domain/tri-emails";
import { ReferentielTriBoite } from "./referentiel-tri-boite";

// Périmètre d'une boîte triée (V2 du 27/10/2026) : l'union des copros Crypto de ses agences et
// des copros ESTALE dont l'établissement y correspond. Données inventées.

const copro = (reference: string, o: Partial<CoproTri> = {}): CoproTri => ({ reference, nom: reference, adresse: "", gestionnaire: null, assistant: null, ...o });
const source = (copros: CoproTri[]) => ({ charger: vi.fn(async (): Promise<ReferentielTri> => ({ copros, expediteurs: {} })) });
const panne = () => ({ charger: vi.fn(async (): Promise<ReferentielTri> => { throw new Error("panne"); }) });

const ESTALE = [copro("S0302", { agence: "LGC" }), copro("S0400", { agence: "ASN" }), copro("S0500", { agence: "HLS" }), copro("S0600")];
const CRYPTO = [copro("S247", { agence: "LGC" }), copro("S0302", { agence: "LGC" })];

const refs = async (r: ReferentielTriBoite) => (await r.charger()).copros.map((c) => c.reference).sort();

describe("ReferentielTriBoite", () => {
  it("union : copros Crypto des agences + copros ESTALE de leurs établissements", async () => {
    expect(await refs(new ReferentielTriBoite(source(ESTALE), source(CRYPTO), ["LGC", "asn"]))).toEqual(["S0302", "S0400", "S247"]);
  });

  it("ESTALE en panne : les copros Crypto seules, avec un avertissement", async () => {
    const r = new ReferentielTriBoite(panne(), source(CRYPTO), ["LGC"]);
    const ref = await r.charger();
    expect(ref.copros.map((c) => c.reference).sort()).toEqual(["S0302", "S247"]);
    expect(ref.avertissements?.[0]).toContain("ESTALE");
  });

  it("Crypto en panne : les copros ESTALE de l'agence seulement, jamais tout le parc", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await refs(new ReferentielTriBoite(source(ESTALE), panne(), ["HLS"]))).toEqual(["S0500"]);
  });

  it("aucune agence : aucune copro, et on ne lit rien", async () => {
    const e = source(ESTALE);
    const r = await new ReferentielTriBoite(e, source(CRYPTO), []).charger();
    expect(r.copros).toEqual([]);
    expect(e.charger).not.toHaveBeenCalled();
  });
});
