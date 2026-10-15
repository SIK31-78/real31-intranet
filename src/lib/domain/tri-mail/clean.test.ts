import { describe, expect, it } from "vitest";
import { cleanBody, historiqueCite } from "./clean";
import type { RawMail } from "./raw-mail";

const mail = (subject: string, bodyText: string) => ({ subject, bodyText }) as RawMail;

const REPONSE = [
  "Bonjour,\r\nC'est noté, merci.\r\n",
  "De : Mahaut CARTON <mahaut.carton@real31.fr>",
  "Envoyé : mardi 14 octobre 2026 10:12",
  "Objet : S0300 - Fuite parking",
  "",
  "Pouvez-vous intervenir jeudi ?",
].join("\n");

describe("historique de la conversation", () => {
  it("cleanBody garde le message du jour, l'historique garde le message cité", () => {
    expect(cleanBody(mail("RE: S0300 - Fuite parking", REPONSE))).toBe("Bonjour,\nC'est noté, merci.");
    const h = historiqueCite(mail("RE: S0300 - Fuite parking", REPONSE));
    expect(h.startsWith("De : Mahaut CARTON")).toBe(true);
    expect(h).toContain("Pouvez-vous intervenir jeudi ?");
  });

  it("un mail sans citation n'a pas d'historique", () => {
    expect(historiqueCite(mail("Fuite", "Bonjour,\nIl y a une fuite."))).toBe("");
  });

  it("un transfert : l'historique commence au 2e en-tête", () => {
    const tr = "Pour info\nDe : A\nObjet : x\ntexte transféré\nDe : B\nObjet : y\nplus ancien";
    expect(historiqueCite(mail("TR: x", tr)).startsWith("De : B")).toBe(true);
  });

  it("un historique trop long est borné", () => {
    const long = `Ok\nDe : X\nEnvoyé : hier\n${"a".repeat(50)}`;
    expect(historiqueCite(mail("RE: y", long), 20).endsWith("…")).toBe(true);
  });
});
