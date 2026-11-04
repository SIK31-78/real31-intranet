import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockBienRepository } from "@/lib/adapters/mock/mock-bien-repository";
import { referenceBienCanonique, validerNouveauBien, type NouveauBienSaisie } from "@/lib/domain/bien";
import type { Acteur } from "@/lib/domain/cles/acteur";

// Creation d'un bien hors syndic depuis le formulaire de trousseau (REA-53, ADR-049).

const etat = vi.hoisted(() => ({ biens: null as unknown as MockBienRepository }));
vi.mock("@/lib/adapters/router", () => ({ getBienRepository: () => etat.biens }));

import { creerBien, type CreerBienInput } from "@/lib/services/cles/biens";

const saisie = (o: Partial<CreerBienInput> = {}): CreerBienInput => ({
  activite: "location",
  reference: "  trillot-18 ",
  type: "appartement",
  adresse: { numeroVoie: "18", typeVoie: "rue", nomVoie: "Trillot", codePostal: "92600", ville: "Asnières-sur-Seine", complement: "  " },
  proprietaire: { nom: " Dupont ", prenom: "", email: "" },
  ...o,
});

const CAMILIA: Acteur = { id: "u1", nom: "Camilia F.", agence: "ASN", direction: [] };
const NEIS: Acteur = { id: "u2", nom: "Neis L.", agence: "LGC", direction: [] };
const XAVIER: Acteur = { id: "u3", nom: "Xavier B.", agence: "LGC", direction: [], activitesDirigees: ["transaction"] };

describe("validerNouveauBien", () => {
  it("normalise la référence et nettoie les champs vides", () => {
    const r = validerNouveauBien(saisie());
    expect(r).toEqual({
      ok: true,
      bien: {
        activite: "location",
        reference: "TRILLOT-18",
        type: "appartement",
        adresse: { numeroVoie: "18", typeVoie: "rue", nomVoie: "Trillot", codePostal: "92600", ville: "Asnières-sur-Seine" },
        proprietaire: { nom: "Dupont" },
      },
    });
  });

  it("met la référence en forme", () => {
    expect(referenceBienCanonique("  alves   48 ")).toBe("ALVES 48");
  });

  it.each([
    [{ reference: "   " }, /référence/],
    [{ proprietaire: { nom: " " } }, /propriétaire/],
    [{ activite: "syndic" }, /activité/],
    [{ type: "chateau" }, /type/],
    [{ proprietaire: { nom: "D", email: "pas-un-mail" } }, /e-mail/],
    [{ reference: "X".repeat(41) }, /trop longue/],
  ])("refuse %j", (o, motif) => {
    const r = validerNouveauBien(saisie(o as Partial<NouveauBienSaisie>));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreur).toMatch(motif);
  });
});

describe("creerBien", () => {
  beforeEach(() => {
    etat.biens = new MockBienRepository();
  });

  it("crée un bien actif d'origine intranet, au nom de l'acteur, et le rend choisissable", async () => {
    const b = await creerBien(saisie(), CAMILIA);
    expect(b).toMatchObject({ agenceCode: "ASN", activite: "location", reference: "TRILLOT-18", nom: "Dupont", adresse: "18 rue Trillot, 92600 Asnières-sur-Seine" });
    const stocke = etat.biens.biens[0];
    expect(stocke).toMatchObject({ actif: true, source: "intranet" });
    expect(etat.biens.creesPar.get(stocke.id)).toBe("Camilia F.");
  });

  it("refuse une référence déjà prise dans l'agence, avec un message clair", async () => {
    await creerBien(saisie(), CAMILIA);
    await expect(creerBien(saisie({ reference: "Trillot-18" }), CAMILIA)).rejects.toThrow(/TRILLOT-18 existe déjà à l'agence ASN/);
  });

  it("accepte la même référence dans une autre agence", async () => {
    await creerBien(saisie(), CAMILIA);
    await expect(creerBien(saisie(), { ...NEIS, agence: "LGC" })).resolves.toMatchObject({ agenceCode: "LGC" });
  });

  it("applique la règle agence × activité : refus hors agence, accepté pour qui dirige l'activité", async () => {
    await expect(creerBien(saisie({ agenceCode: "ASN" }), NEIS)).rejects.toThrow(/autre agence/);
    await expect(creerBien(saisie({ agenceCode: "ASN", activite: "location" }), XAVIER)).rejects.toThrow(/autre agence/);
    await expect(creerBien(saisie({ agenceCode: "ASN", activite: "transaction" }), XAVIER)).resolves.toMatchObject({ agenceCode: "ASN", activite: "transaction" });
  });

  it("refuse une agence inconnue", async () => {
    await expect(creerBien(saisie({ agenceCode: "ZZ" }), CAMILIA)).rejects.toThrow(/Agence inconnue/);
  });
});
