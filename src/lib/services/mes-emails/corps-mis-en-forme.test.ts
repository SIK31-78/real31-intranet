import { describe, expect, it } from "vitest";
import { corpsMisEnForme } from "./corps-mis-en-forme";

// REA-345 : la garde serveur du corps mis en forme (pilote seul, toujours renettoyé).

describe("corpsMisEnForme", () => {
  it("sans HTML : rien à faire, le texte part comme avant", () => {
    expect(corpsMisEnForme(false, undefined)).toBeNull();
    expect(corpsMisEnForme(true, "")).toBeNull();
  });
  it("hors pilote, un HTML envoyé est refusé", () => {
    expect(corpsMisEnForme(false, "<b>x</b>")).toBe("refuse");
  });
  it("refuse ce qui n'est pas une chaîne ou est trop gros", () => {
    expect(corpsMisEnForme(true, 42)).toBe("refuse");
    expect(corpsMisEnForme(true, "a".repeat(200_001))).toBe("refuse");
  });
  it("en pilote : renettoie, habille, et rend le texte équivalent", () => {
    const r = corpsMisEnForme(true, '<div>Bonjour <b>Mme</b><script>x</script><a href="javascript:x">ici</a></div>');
    expect(r).toEqual({
      corps: "Bonjour Mmeici",
      corpsHtml: '<div style="font-family:Aptos,Calibri,Arial,sans-serif;font-size:11pt"><p style="margin:0">Bonjour <b>Mme</b>ici</p></div>',
    });
  });
});
