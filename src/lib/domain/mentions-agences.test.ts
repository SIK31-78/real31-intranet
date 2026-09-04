// Tests des mentions legales par agence (pied de page des documents sortants).
//
// Ce que ces tests protegent vraiment : qu'on n'INVENTE jamais une mention. Une agence
// dont le cabinet ne nous a pas donne le texte doit retomber sur les mentions de
// reference (La Garenne-Colombes) ET rester listee "a verifier" - le jour ou quelqu'un
// remplit une surcharge, il doit aussi la sortir de cette liste, sinon le test le dit.

import { describe, expect, it } from "vitest";
import {
  AGENCES_MENTIONS_A_VERIFIER,
  lignesMentions,
  mentionsAgence,
  mentionsVerifiees,
} from "./mentions-agences";

describe("mentionsAgence", () => {
  it("rend les mentions exactes de La Garenne-Colombes", () => {
    const m = mentionsAgence("LGC");
    expect(m.code).toBe("LGC");
    expect(m.activites).toBe("VENTE – LOCATION – GESTION LOCATIVE – SYNDIC DE COPROPRIÉTÉ");
    expect(m.societe).toBe("SAS au capital de 90 000 € - SIREN 479 696 767 RCS VERSAILLES");
    expect(m.cartePro).toContain("CPI 7801 2016 000 014 479");
    expect(m.cartePro).toContain("CCI Paris Île-de-France");
    expect(m.garantie).toContain("GALIAN-SMABTP");
    expect(m.garantie).toContain("110891J");
  });

  it("replie sur La Garenne quand l'agence est inconnue ou absente", () => {
    const reference = mentionsAgence("LGC");
    for (const inconnue of [undefined, null, "", "  ", "XXX"]) {
      const m = mentionsAgence(inconnue);
      expect(m.societe).toBe(reference.societe);
      expect(m.cartePro).toBe(reference.cartePro);
      expect(m.garantie).toBe(reference.garantie);
    }
  });

  it("ne se laisse pas piéger par la casse ni les espaces", () => {
    expect(mentionsAgence(" lgc ").code).toBe("LGC");
    expect(mentionsAgence("Hls").code).toBe("HLS");
  });

  it("garde le code demande, meme quand les mentions sont celles du repli", () => {
    expect(mentionsAgence("HLS").code).toBe("HLS");
  });
});

describe("mentions restant a verifier", () => {
  it("liste les trois agences dont le cabinet ne nous a pas donne le texte", () => {
    expect([...AGENCES_MENTIONS_A_VERIFIER].sort()).toEqual(["ASN", "HLS", "ML"]);
  });

  it("ne dit VERIFIE que de La Garenne", () => {
    expect(mentionsVerifiees("LGC")).toBe(true);
    expect(mentionsVerifiees("ML")).toBe(false);
    expect(mentionsVerifiees("HLS")).toBe(false);
    expect(mentionsVerifiees("ASN")).toBe(false);
    expect(mentionsVerifiees(undefined)).toBe(false);
  });
});

describe("lignesMentions", () => {
  it("rend les quatre lignes du pied de page dans l'ordre", () => {
    const lignes = lignesMentions(mentionsAgence("LGC"));
    expect(lignes).toHaveLength(4);
    expect(lignes[0]).toMatch(/^VENTE/);
    expect(lignes[3]).toMatch(/^Garanti par/);
  });

  it("saute une ligne vide plutot que d'imprimer un blanc", () => {
    expect(lignesMentions({ ...mentionsAgence("LGC"), garantie: "" })).toHaveLength(3);
  });
});
