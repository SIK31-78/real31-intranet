import { describe, expect, it } from "vitest";
import { accesVersDomaine, accesVersRow, type AccesRow } from "./supabase-cles-repository";

const base = { id: "a1", trousseau_id: "t1", immeuble: null, types: ["total"], libelle: "", ordre: 0 };
const bienJoint = {
  id: "b1",
  reference: "ALVES",
  libelle: null,
  activite: "location" as const,
  numero_voie: "22",
  type_voie: "rue",
  nom_voie: "Victor Hugo",
  complement: null,
  code_postal: "92600",
  ville: "ASNIÈRES-SUR-SEINE",
};

describe("accès d'un trousseau : copro ou bien hors syndic (ADR-049)", () => {
  it("lit une copropriété par son code", () => {
    const r: AccesRow = { ...base, copropriete_id: "S0042", bien_id: null, bien: null };
    expect(accesVersDomaine(r).bien).toEqual({ type: "copro", code: "S0042" });
  });

  it("lit un bien locatif joint, adresse en ligne", () => {
    const r: AccesRow = { ...base, copropriete_id: null, bien_id: "b1", bien: bienJoint };
    expect(accesVersDomaine(r).bien).toEqual({ type: "lot_locatif", id: "b1", ref: "ALVES", adresse: "22 rue Victor Hugo, 92600 ASNIÈRES-SUR-SEINE" });
  });

  it("un bien en transaction devient un bien en vente ; la jointure en tableau est tolérée", () => {
    const r: AccesRow = { ...base, copropriete_id: null, bien_id: "b1", bien: [{ ...bienJoint, activite: "transaction" }] };
    expect(accesVersDomaine(r).bien.type).toBe("bien_vente");
  });

  it("un bien illisible reste affiché, nommé comme tel", () => {
    const r: AccesRow = { ...base, copropriete_id: null, bien_id: "b9", bien: null };
    expect(accesVersDomaine(r).bien).toEqual({ type: "lot_locatif", id: "b9", ref: "Bien introuvable" });
  });

  it("écrit exactement une cible", () => {
    const copro = accesVersRow("t1", { bien: { type: "copro", code: "S0042" }, types: ["total"], libelle: "", ordre: 0 });
    expect([copro.copropriete_id, copro.bien_id]).toEqual(["S0042", null]);
    const bien = accesVersRow("t1", { bien: { type: "lot_locatif", id: "b1", ref: "ALVES" }, types: ["total"], libelle: "", ordre: 0 });
    expect([bien.copropriete_id, bien.bien_id]).toEqual([null, "b1"]);
  });

  it("refuse un bien sans id du référentiel", () => {
    expect(() => accesVersRow("t1", { bien: { type: "lot_locatif", id: "", ref: "ALVES" }, types: [], libelle: "", ordre: 0 })).toThrow(/bien inconnu/);
  });
});
