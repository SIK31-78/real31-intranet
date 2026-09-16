import { describe, expect, it } from "vitest";
import { exigerUneLigne, filtreCodeCopro, idCoproUnique } from "./cible-copro";
import { filtrePerimetre } from "./perimetre";

// Le code de copro entre dans un filtre PostgREST : il ne doit jamais pouvoir y glisser
// une condition (audit du 16/09/2026 : `a,id.gt.0` reaffectait toutes les copros).

describe("filtreCodeCopro", () => {
  it("accepte les codes du cabinet", () => {
    expect(filtreCodeCopro("S302")).toBe("referenceCrypto.eq.S302,referenceEstale.eq.S302");
    expect(filtreCodeCopro("SE999")).toContain("SE999");
    expect(filtreCodeCopro("T999")).toContain("T999");
  });
  it("refuse tout ce qui pourrait etre lu comme une condition", () => {
    for (const mauvais of ["a,id.gt.0", "S30.1", "S302)", "S302 ", "", "x".repeat(21), "S302,status.eq.ACTIVE"]) {
      expect(() => filtreCodeCopro(mauvais)).toThrow(/illisible/);
    }
  });
});

describe("filtrePerimetre", () => {
  it("n'accepte qu'un identifiant technique", () => {
    expect(filtrePerimetre("b4652223-ffcd-4245-b560-adf2a4eb2527")).toBe(
      "managerId.eq.b4652223-ffcd-4245-b560-adf2a4eb2527,assistantId.eq.b4652223-ffcd-4245-b560-adf2a4eb2527",
    );
    expect(() => filtrePerimetre("x,status.eq.ACTIVE")).toThrow(/illisible/);
  });
});

// Un faux client PostgREST : juste ce que idCoproUnique appelle.
function clientAvec(lignes: { id: string }[], error: { message: string } | null = null) {
  const filtres: string[] = [];
  const q = {
    select: () => q,
    or: (f: string) => {
      filtres.push(f);
      return q;
    },
    limit: async () => ({ data: lignes, error }),
  };
  return { client: { from: () => q } as unknown as Parameters<typeof idCoproUnique>[0], filtres };
}

describe("idCoproUnique", () => {
  it("rend l'id quand une seule fiche porte le code, avec le perimetre en second filtre", async () => {
    const { client, filtres } = clientAvec([{ id: "abc" }]);
    await expect(idCoproUnique(client, "S302", "Test", "managerId.eq.u1,assistantId.eq.u1")).resolves.toBe("abc");
    expect(filtres).toEqual(["referenceCrypto.eq.S302,referenceEstale.eq.S302", "managerId.eq.u1,assistantId.eq.u1"]);
  });
  it("refuse 0 fiche (introuvable ou hors perimetre) et plus d'une fiche", async () => {
    await expect(idCoproUnique(clientAvec([]).client, "S302", "Perte", "p")).rejects.toThrow(/introuvable ou hors du périmètre/);
    await expect(idCoproUnique(clientAvec([]).client, "S302", "Perte")).rejects.toThrow(/introuvable\./);
    await expect(idCoproUnique(clientAvec([{ id: "a" }, { id: "b" }]).client, "S302", "Perte")).rejects.toThrow(/plusieurs fiches/);
  });
  it("remonte l'erreur de lecture", async () => {
    await expect(idCoproUnique(clientAvec([], { message: "timeout" }).client, "S302", "Perte")).rejects.toThrow("Perte : timeout");
  });
});

describe("exigerUneLigne", () => {
  it("passe sur une ligne, refuse 0 ou 2, remonte l'erreur", () => {
    expect(() => exigerUneLigne("MAJ", [{ id: "a" }], null)).not.toThrow();
    expect(() => exigerUneLigne("MAJ", [], null)).toThrow(/0 fiche modifiée/);
    expect(() => exigerUneLigne("MAJ", [{}, {}], null)).toThrow(/2 fiche modifiée/);
    expect(() => exigerUneLigne("MAJ", null, { message: "boom" })).toThrow("MAJ : boom");
  });
});
