import { describe, expect, it } from "vitest";
import * as modules from "./odj-libre";
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

describe("odj-libre - blocs par section, masques, libelles reecrits", () => {
  const etat = [
    { champId: "bloc.gestion-courante.2", valeur: "Para de section" },
    { champId: "bloc.1", valeur: "Para fin de doc (historique sans section)" },
    { champId: "bloc.zone-inconnue.3", valeur: "Section disparue -> fin de doc" },
    { champId: "masque.comptes.compteurs-eau", valeur: "1" },
    { champId: "masque.autre", valeur: null }, // demasque (efface) : ignore
    { champId: "libelle.comptes.budget", valeur: "Budget de l'exercice" },
    { champId: "titre-section.verif-comptes", valeur: "Les comptes" },
  ];
  const sections = new Set(["verif-comptes", "gestion-courante"]);

  it("blocsLibresDeSection ne rend que les blocs de LA section", () => {
    const { blocsLibresDeSection } = modules;
    expect(blocsLibresDeSection(etat, "gestion-courante")).toEqual([
      { id: "bloc.gestion-courante.2", texte: "Para de section" },
    ]);
    expect(blocsLibresDeSection(etat, "verif-comptes")).toEqual([]);
  });

  it("blocsLibres (fin de doc) = sans section OU section inconnue (bloc historique protege)", () => {
    const { blocsLibres } = modules;
    expect(blocsLibres(etat, sections).map((b) => b.id)).toEqual(["bloc.1", "bloc.zone-inconnue.3"]);
  });

  it("champsMasques / libellesReecrits / titresSectionsReecrits lisent leurs prefixes", () => {
    const { champsMasques, libellesReecrits, titresSectionsReecrits } = modules;
    expect(champsMasques(etat)).toEqual(new Set(["comptes.compteurs-eau"]));
    expect(libellesReecrits(etat).get("comptes.budget")).toBe("Budget de l'exercice");
    expect(titresSectionsReecrits(etat).get("verif-comptes")).toBe("Les comptes");
  });
});

describe("odj-libre - notes ancrees sous une ligne", () => {
  const etat = [
    { champId: "note.comptes.ecart-budget.2", valeur: "Seconde note" },
    { champId: "note.comptes.ecart-budget.1", valeur: "Le trop-percu s'explique par..." },
    { champId: "note.libre.verif-comptes.5.9", valeur: "Note sur un champ LIBRE" },
    { champId: "note.comptes.budget.3", valeur: null }, // supprimee : ignoree
    { champId: "comptes.ecart-budget", valeur: "100" }, // pas une note
  ];

  it("ancreDeNote retrouve la ligne malgre les points dans son id", () => {
    const { ancreDeNote, idNote } = modules;
    expect(ancreDeNote(idNote("comptes.ecart-budget", 1725))).toBe("comptes.ecart-budget");
    expect(ancreDeNote("note.libre.verif-comptes.5.9")).toBe("libre.verif-comptes.5");
    expect(ancreDeNote("comptes.budget")).toBeUndefined();
  });

  it("notesDeLigne rend les notes de LA ligne, triees par creation", () => {
    const { notesDeLigne } = modules;
    expect(notesDeLigne(etat, "comptes.ecart-budget").map((n) => n.texte)).toEqual([
      "Le trop-percu s'explique par...",
      "Seconde note",
    ]);
    expect(notesDeLigne(etat, "comptes.budget")).toEqual([]);
  });
});
