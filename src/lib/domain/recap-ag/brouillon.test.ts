import { describe, expect, it } from "vitest";
import {
  cleBrouillon,
  DUREE_VIE_BROUILLON_JOURS,
  lireBrouillon,
  saisieModifiee,
  serialiserBrouillon,
  type SaisieRecapAg,
} from "./brouillon";

const vierge: SaisieRecapAg = {
  jour: "2026-10-14",
  debut: "18:00",
  fin: "20:00",
  comptesApprouves: true,
  reserves: "",
  budgetModifie: false,
  montantBudget: "",
  pourcentageBudget: "5",
  pptVote: false,
  pourcentagePpt: "",
  montantPpt: "",
  fondsTravaux: true,
  infoComptable: "",
  travaux: [],
  debutContrat: "",
  finContrat: "",
  honoraires: "",
  forfaitPostaux: "",
  fraisPostauxReels: false,
};
const saisie: SaisieRecapAg = {
  ...vierge,
  reserves: "Facture du jardinier à justifier",
  travaux: [{ numeroResolution: "12", libelle: "Ravalement", budget: "12 500", cleRepartition: "Charges générales", modalitesAppelFonds: "" }],
};
const t0 = new Date("2026-11-03T09:00:00Z");

describe("brouillon du recap d'AG", () => {
  it("relit ce qu'il a ecrit, pour la meme copro", () => {
    const texte = serialiserBrouillon("S261", saisie, t0);
    const b = lireBrouillon(texte, "S261", new Date("2026-11-03T10:00:00Z"));
    expect(b?.saisie).toEqual(saisie);
    expect(b?.enregistreLe).toBe(t0.toISOString());
  });

  it("une cle par copro", () => {
    expect(cleBrouillon("S261")).not.toBe(cleBrouillon("S262"));
  });

  it("ignore le brouillon d'une autre copro", () => {
    expect(lireBrouillon(serialiserBrouillon("S261", saisie, t0), "S262", t0)).toBeNull();
  });

  it("ignore un brouillon perime", () => {
    const tard = new Date(t0.getTime() + (DUREE_VIE_BROUILLON_JOURS + 1) * 86_400_000);
    expect(lireBrouillon(serialiserBrouillon("S261", saisie, t0), "S261", tard)).toBeNull();
  });

  it("ignore un texte illisible ou incomplet", () => {
    expect(lireBrouillon(null, "S261", t0)).toBeNull();
    expect(lireBrouillon("{pas du json", "S261", t0)).toBeNull();
    const ampute = JSON.parse(serialiserBrouillon("S261", saisie, t0));
    delete ampute.saisie.honoraires;
    expect(lireBrouillon(JSON.stringify(ampute), "S261", t0)).toBeNull();
    const travauxFaux = JSON.parse(serialiserBrouillon("S261", saisie, t0));
    travauxFaux.saisie.travaux = [{ libelle: 3 }];
    expect(lireBrouillon(JSON.stringify(travauxFaux), "S261", t0)).toBeNull();
  });

  it("un formulaire non touche n'est pas une saisie", () => {
    expect(saisieModifiee(vierge, { ...vierge })).toBe(false);
    expect(saisieModifiee(saisie, vierge)).toBe(true);
  });
});
