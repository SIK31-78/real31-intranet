import { describe, expect, it } from "vitest";
import {
  blocsLibres,
  champsLibresDeSection,
  idBlocLibre,
  idChampLibre,
  parseChampLibre,
  sectionDuChampLibre,
  serialiserChampLibre,
} from "./odj-libre";

describe("odj-libre - encodage champ libre", () => {
  it("aller-retour libelle|texte, y compris un | DANS le texte", () => {
    const v = serialiserChampLibre("Fonds travaux", "à voter | montant 5 000 €");
    expect(parseChampLibre(v)).toEqual({ libelle: "Fonds travaux", texte: "à voter | montant 5 000 €" });
  });

  it("un | dans le LIBELLE est neutralise (il est structurel)", () => {
    const v = serialiserChampLibre("Avant|Apres", "texte");
    expect(parseChampLibre(v).libelle).toBe("Avant/Apres");
  });

  it("valeur sans separateur = libelle seul (saisie partielle, rien ne casse)", () => {
    expect(parseChampLibre("Juste un libelle")).toEqual({ libelle: "Juste un libelle", texte: "" });
  });
});

describe("odj-libre - ids et section", () => {
  it("l'id porte la section et l'horodatage ; la section se relit depuis l'id", () => {
    const id = idChampLibre("verif-comptes", 1725000000000);
    expect(id).toBe("libre.verif-comptes.1725000000000");
    expect(sectionDuChampLibre(id)).toBe("verif-comptes");
  });

  it("sectionDuChampLibre refuse ce qui n'est pas un champ libre", () => {
    expect(sectionDuChampLibre("comptes.budget")).toBeUndefined();
    expect(sectionDuChampLibre("bloc.1725000000000")).toBeUndefined();
  });
});

describe("odj-libre - lecture de l'etat", () => {
  const etat = [
    { champId: "lieu", valeur: "Salle A" }, // champ normal : ignore
    { champId: "libre.verif-comptes.2", valeur: "Second|" },
    { champId: "libre.verif-comptes.1", valeur: "Premier|valeur 1" },
    { champId: "libre.gestion-courante.3", valeur: "Autre section|x" },
    { champId: "libre.verif-comptes.9", valeur: null }, // supprime : ignore
    { champId: "bloc.5", valeur: "Paragraphe libre." },
    { champId: "bloc.4", valeur: "Premier paragraphe." },
  ];

  it("champsLibresDeSection : la bonne section, tries par creation, en ChampOdj editables", () => {
    const champs = champsLibresDeSection(etat, "verif-comptes");
    expect(champs.map((c) => c.libelle)).toEqual(["Premier", "Second"]);
    expect(champs[0]).toMatchObject({
      id: "libre.verif-comptes.1",
      valeur: "valeur 1",
      editable: true,
      libre: true,
      saisi: true,
      source: "manuel",
    });
    expect(champs[1]!.valeur).toBeUndefined(); // texte vide = champ a completer
  });

  it("blocsLibres : tries par creation, les supprimes/normaux ignores", () => {
    expect(blocsLibres(etat)).toEqual([
      { id: "bloc.4", texte: "Premier paragraphe." },
      { id: "bloc.5", texte: "Paragraphe libre." },
    ]);
    expect(idBlocLibre(7)).toBe("bloc.7");
  });
});
