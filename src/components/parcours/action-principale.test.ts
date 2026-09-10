import { describe, expect, it } from "vitest";
import { actionPrincipaleEcran, seJoueIci } from "./action-principale";

const fixer = {
  actionDuMoment: {
    action: "fixer les dates CS + AG",
    label: "Fixer",
    href: "/copropriete/S104",
    secondaire: { label: "Préparer l'ODJ", href: "/odj/S104" },
  },
};
const odj = { actionDuMoment: { action: "préparer l'ODJ", label: "ODJ", href: "/odj/S104" } };
const convoc = {
  actionDuMoment: { action: "envoyer les convocations", label: "Supervision", href: "/supervision-ag/S104__2026-12-31" },
};
const conclure = {
  actionDuMoment: { action: "conclure l'AG", label: "Conclure", href: "/supervision-ag/S104__2026-12-31" },
};
const termine = { actionDuMoment: null };
const ctx = { coproCode: "S104", supervisionId: "S104__2026-12-31" };

describe("seJoueIci", () => {
  it("reconnait l'ecran vise par l'action du moment", () => {
    expect(seJoueIci(odj.actionDuMoment, "odj")).toBe(true);
    expect(seJoueIci(odj.actionDuMoment, "supervision")).toBe(false);
    expect(seJoueIci(null, "fiche")).toBe(false);
  });
});

describe("actionPrincipaleEcran - fiche", () => {
  it("rend l'action du moment telle quelle, avec sa secondaire", () => {
    expect(actionPrincipaleEcran(fixer, "fiche", ctx)).toEqual({
      label: "Fixer",
      href: "/copropriete/S104",
      secondaire: { label: "Préparer l'ODJ", href: "/odj/S104" },
    });
  });
  it("rien a faire -> pas de primaire", () => {
    expect(actionPrincipaleEcran(termine, "fiche", ctx)).toBeNull();
    expect(actionPrincipaleEcran(null, "fiche", ctx)).toBeNull();
  });
});

describe("actionPrincipaleEcran - ODJ", () => {
  it("document ouvert : la cloture est le primaire, quel que soit l'etat du cycle", () => {
    expect(actionPrincipaleEcran(odj, "odj", ctx)).toEqual({ label: "Marquer la réunion terminée", locale: "cloturer-odj" });
    expect(actionPrincipaleEcran(fixer, "odj", ctx)).toEqual({ label: "Marquer la réunion terminée", locale: "cloturer-odj" });
    expect(actionPrincipaleEcran(null, "odj", ctx)).toEqual({ label: "Marquer la réunion terminée", locale: "cloturer-odj" });
  });
  it("document clos avec AG datee : on passe a la supervision", () => {
    expect(actionPrincipaleEcran(odj, "odj", { ...ctx, odjClos: true })).toEqual({
      label: "Passer à la supervision AG",
      href: "/supervision-ag/S104__2026-12-31",
    });
  });
  it("document clos sans AG datee : on va dater l'AG sur la fiche", () => {
    expect(actionPrincipaleEcran(odj, "odj", { coproCode: "S104", odjClos: true })).toEqual({
      label: "Fixer la date de l'AG",
      href: "/copropriete/S104",
    });
  });
});

describe("actionPrincipaleEcran - supervision", () => {
  it("l'action du moment se joue ici (convoc / conclure / cycle fini) : le primaire est Conclure", () => {
    expect(actionPrincipaleEcran(convoc, "supervision", ctx)).toEqual({ label: "Conclure l'AG", locale: "conclure-ag" });
    expect(actionPrincipaleEcran(conclure, "supervision", ctx)).toEqual({ label: "Conclure l'AG", locale: "conclure-ag" });
    expect(actionPrincipaleEcran(termine, "supervision", ctx)).toEqual({ label: "Conclure l'AG", locale: "conclure-ag" });
  });
  it("l'action du moment se joue ailleurs (ODJ, fiche) : on y renvoie", () => {
    expect(actionPrincipaleEcran(odj, "supervision", ctx)).toEqual({ label: "ODJ", href: "/odj/S104" });
    expect(actionPrincipaleEcran(fixer, "supervision", ctx)).toEqual({ label: "Fixer", href: "/copropriete/S104" });
  });
  it("supervision conclue : plus d'action", () => {
    expect(actionPrincipaleEcran(conclure, "supervision", { ...ctx, supervisionConclue: true })).toBeNull();
  });
});
