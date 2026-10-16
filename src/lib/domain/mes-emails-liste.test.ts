import { describe, expect, it } from "vitest";
import { placeInternesValide, regrouperInternes } from "./mes-emails-liste";

const mails = [
  { id: "1", expediteurEmail: "client@gmail.com" },
  { id: "2", expediteurEmail: "Elsa@REAL31.fr" },
  { id: "3", expediteurEmail: "syndic@autre.fr" },
  { id: "4", expediteurEmail: "nicolas@real31.fr" },
  { id: "5", expediteurEmail: "moi@real31.fr" },
];
const boite = () => "moi@real31.fr";
const ids = (l: { id: string }[]) => l.map((m) => m.id);

describe("regrouperInternes (REA-351)", () => {
  it("« mêlés » garde l'ordre reçu", () => {
    expect(ids(regrouperInternes(mails, "meles", boite))).toEqual(["1", "2", "3", "4", "5"]);
  });
  it("en haut : les collègues d'abord, chaque groupe dans son ordre", () => {
    expect(ids(regrouperInternes(mails, "haut", boite))).toEqual(["2", "4", "1", "3", "5"]);
  });
  it("en bas : les collègues à la fin", () => {
    expect(ids(regrouperInternes(mails, "bas", boite))).toEqual(["1", "3", "5", "2", "4"]);
  });
  it("un mail envoyé depuis sa propre boîte n'est pas d'un collègue", () => {
    expect(ids(regrouperInternes(mails, "haut", boite))).not.toContain(undefined);
    expect(ids(regrouperInternes(mails, "haut", boite)).indexOf("5")).toBeGreaterThan(1);
  });
  it("ne modifie pas la liste d'origine", () => {
    const copie = [...mails];
    regrouperInternes(mails, "haut", boite);
    expect(mails).toEqual(copie);
  });
});

describe("placeInternesValide", () => {
  it("accepte les valeurs connues, retombe sur « mêlés » sinon", () => {
    expect(placeInternesValide("haut")).toBe("haut");
    expect(placeInternesValide("bas")).toBe("bas");
    expect(placeInternesValide("n'importe")).toBe("meles");
    expect(placeInternesValide(null)).toBe("meles");
  });
});
