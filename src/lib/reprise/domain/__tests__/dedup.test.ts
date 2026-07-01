import { describe, expect, it } from "vitest";
import { cleIdentite, detecterDoublons } from "../dedup";
import type { Owner } from "../patrimoine";

function owner(p: Partial<Owner> & Pick<Owner, "id" | "nom">): Owner {
  return { civilite: "m", pro: false, ...p };
}

describe("cleIdentite", () => {
  it("ignore casse, accents et espaces", () => {
    const a = owner({ id: "1", nom: "VIDAL", prenom: "José" });
    const b = owner({ id: "2", nom: "vidal", prenom: "jose " });
    expect(cleIdentite(a)).toBe(cleIdentite(b));
  });
});

describe("detecterDoublons (R7)", () => {
  it("propose une fusion pour deux entites identiques et compatibles (VIDAL n°1/n°2)", () => {
    const owners = [
      owner({ id: "1", nom: "VIDAL", prenom: "Jose" }),
      owner({ id: "2", nom: "VIDAL", prenom: "Jose" }),
    ];
    const groupes = detecterDoublons(owners);
    expect(groupes).toHaveLength(1);
    expect(groupes[0]!.type).toBe("fusion_proposee");
    expect(groupes[0]!.owners).toHaveLength(2);
  });

  it("signale un doublon non tranchable quand les donnees divergent", () => {
    const owners = [
      owner({ id: "1", nom: "MARTIN", prenom: "Paul", naissance: "01/01/1970" }),
      owner({ id: "2", nom: "MARTIN", prenom: "Paul", naissance: "02/02/1980" }),
    ];
    const groupes = detecterDoublons(owners);
    expect(groupes).toHaveLength(1);
    expect(groupes[0]!.type).toBe("doublon_non_tranchable");
  });

  it("ne signale rien pour des noms differents ou des prenoms differents", () => {
    const owners = [
      owner({ id: "1", nom: "MARTIN", prenom: "Paul" }),
      owner({ id: "2", nom: "MARTIN", prenom: "Pierre" }),
      owner({ id: "3", nom: "DURAND", prenom: "Paul" }),
    ];
    expect(detecterDoublons(owners)).toHaveLength(0);
  });
});
