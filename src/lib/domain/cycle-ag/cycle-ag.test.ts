import { describe, it, expect } from "vitest";
import type { Copropriete } from "@/lib/domain/copropriete";
import { calculerCycleAg } from "./index";
import { etatCycleAg } from "./etat";
import { construireLigne } from "./parcours";

// Fabrique une copro minimale (les champs non utilises par le cycle sont caste-ignores).
function copro(p: Partial<Copropriete>): Copropriete {
  return {
    code: "S001",
    source: "crypto",
    nom: "Test",
    adresse: { ligne1: "", codePostal: "", ville: "" },
    statut: "active",
    lotsPrincipaux: 0,
    lotsAutres: 0,
    exercice: { debut: "01/01", fin: "31/12" },
    priseEnGestion: "-",
    equipe: [],
    ...p,
  } as Copropriete;
}

const TODAY = "2026-06-22";
// AG dans la fenetre de preparation (< 150 j), CS de prep planifie -> etape Dates faite.
const AG_PROCHE = {
  prochaineAg: { date: "2026-07-10", statut: "planifiee" as const },
  prochaineCsDate: "2026-06-25",
};

describe("calculerCycleAg - coherence etat <-> etape (chaque etat mappe la bonne etape)", () => {
  it("a_planifier -> etape 'dates'", () => {
    const cycle = calculerCycleAg(copro({}), new Set(), TODAY);
    expect(cycle.etat).toBe("a_planifier");
    expect(cycle.etapeCourante).toBe("dates");
  });

  it("a_venir (AG lointaine, prep pas commencee) -> etape 'dates' (poser le CS)", () => {
    const cycle = calculerCycleAg(
      copro({ prochaineAg: { date: "2026-12-31", statut: "planifiee" } }),
      new Set(),
      TODAY,
    );
    expect(cycle.etat).toBe("a_venir");
    expect(cycle.etapeCourante).toBe("dates");
  });

  it("en_preparation, jalon ODJ pas fait -> etape 'odj'", () => {
    const cycle = calculerCycleAg(copro(AG_PROCHE), new Set(), TODAY);
    expect(cycle.etat).toBe("en_preparation");
    expect(cycle.etapeCourante).toBe("odj");
  });

  it("en_preparation, ODJ fait -> etape 'convoc'", () => {
    const cycle = calculerCycleAg(copro(AG_PROCHE), new Set(["ODJ_CS"]), TODAY);
    expect(cycle.etat).toBe("en_preparation");
    expect(cycle.etapeCourante).toBe("convoc");
  });

  it("convoquee (jalon CONVOC coche) -> etape 'tenue'", () => {
    const cycle = calculerCycleAg(copro(AG_PROCHE), new Set(["ODJ_CS", "CONVOC"]), TODAY);
    expect(cycle.etat).toBe("convoquee");
    expect(cycle.etapeCourante).toBe("tenue");
  });

  it("tenue (date passee, PV pas notifie) -> etape 'pv'", () => {
    const cycle = calculerCycleAg(
      copro({ ...AG_PROCHE, prochaineAg: { date: "2026-06-10", statut: "planifiee" } }),
      new Set(["ODJ_CS", "CONVOC", "TENUE"]),
      TODAY,
    );
    expect(cycle.etat).toBe("tenue");
    expect(cycle.etapeCourante).toBe("pv");
  });

  it("tenue et conclue (prochaine date videe) -> cycle termine, aucune etape courante", () => {
    // AG du 16/04 conclue, exercice clos au 31/12 : rien a planifier avant la cloture.
    const cycle = calculerCycleAg(
      copro({ derniereAgDate: "2026-04-16" }),
      new Set(),
      "2026-07-17",
    );
    expect(cycle.etat).toBe("tenue");
    expect(cycle.etapeCourante).toBeNull();
    expect(cycle.etapes.every((e) => e.statut === "fait")).toBe(true);
  });
});

describe("calculerCycleAg - action du moment par etat", () => {
  it("a_planifier -> 'Fixer' vers la fiche copro (jamais la supervision)", () => {
    const { actionDuMoment } = calculerCycleAg(copro({}), new Set(), TODAY);
    expect(actionDuMoment?.label).toBe("Fixer");
    expect(actionDuMoment?.href).toBe("/copropriete/S001");
  });

  it("en_preparation, ODJ a faire -> 'ODJ' vers le composer", () => {
    const { actionDuMoment } = calculerCycleAg(copro(AG_PROCHE), new Set(), TODAY);
    expect(actionDuMoment?.label).toBe("ODJ");
    expect(actionDuMoment?.href).toBe("/odj/S001");
    expect(actionDuMoment?.action).toBe("préparer l'ODJ");
  });

  it("en_preparation, ODJ fait -> convocations via la supervision datee", () => {
    const { actionDuMoment } = calculerCycleAg(copro(AG_PROCHE), new Set(["ODJ_CS"]), TODAY);
    expect(actionDuMoment?.label).toBe("Supervision");
    expect(actionDuMoment?.href).toBe("/supervision-ag/S001__2026-07-10");
    expect(actionDuMoment?.action).toBe("envoyer les convocations");
  });

  it("convoquee -> tenir l'AG via la supervision datee", () => {
    const { actionDuMoment } = calculerCycleAg(
      copro(AG_PROCHE),
      new Set(["ODJ_CS", "CONVOC"]),
      TODAY,
    );
    expect(actionDuMoment?.label).toBe("Supervision");
    expect(actionDuMoment?.action).toBe("tenir l'AG et suivre");
  });

  it("tenue (date passee) -> notifier le PV via la supervision datee", () => {
    const { actionDuMoment } = calculerCycleAg(
      copro({ ...AG_PROCHE, prochaineAg: { date: "2026-06-10", statut: "planifiee" } }),
      new Set(["ODJ_CS", "CONVOC", "TENUE"]),
      TODAY,
    );
    expect(actionDuMoment?.action).toBe("publier et notifier le PV");
    expect(actionDuMoment?.href).toBe("/supervision-ag/S001__2026-06-10");
  });

  it("tenue et conclue -> AUCUNE action (pas de 'Fixer' a contre-temps)", () => {
    const { actionDuMoment } = calculerCycleAg(
      copro({ derniereAgDate: "2026-04-16" }),
      new Set(),
      "2026-07-17",
    );
    expect(actionDuMoment).toBeNull();
  });

  it("cycle complet (5 etapes faites) -> aucune action", () => {
    const { actionDuMoment, etapeCourante } = calculerCycleAg(
      copro(AG_PROCHE),
      new Set(["ODJ_CS", "CONVOC", "TENUE", "NOTIF_PV"]),
      TODAY,
    );
    expect(actionDuMoment).toBeNull();
    expect(etapeCourante).toBeNull();
  });
});

describe("calculerCycleAg - jamais d'action 'supervision' sans date d'AG", () => {
  it("sans date, meme avec des jalons marques (donnees adverses), l'action reste 'Fixer'", () => {
    const { actionDuMoment } = calculerCycleAg(
      copro({}),
      new Set(["ODJ_CS", "CONVOC", "TENUE", "NOTIF_PV"]),
      TODAY,
    );
    // L'etape Dates n'est pas faite (pas d'AG datee) -> elle prime : jamais de bouton
    // Supervision a contre-temps (le bug audit du 2026-07-21).
    expect(actionDuMoment?.label).toBe("Fixer");
    expect(actionDuMoment?.href.startsWith("/supervision-ag/")).toBe(false);
  });

  it("sans date et AG conclue, aucune action du tout", () => {
    const cycle = calculerCycleAg(
      copro({ derniereAgDate: "2026-04-16" }),
      new Set(["TENUE"]),
      "2026-07-17",
    );
    expect(cycle.actionDuMoment).toBeNull();
  });
});

describe("calculerCycleAg - enRetard et echeance conserves", () => {
  it("a_planifier, delai legal depasse -> enRetard + echeance 'en retard'", () => {
    const cycle = calculerCycleAg(copro({}), new Set(), "2026-08-01");
    expect(cycle.etat).toBe("a_planifier");
    expect(cycle.enRetard).toBe(true); // cloture 31/12 + 6 mois = 30/06 < 01/08
    expect(cycle.echeance).toBe("en retard");
  });

  it("a_planifier dans les delais -> pas de retard", () => {
    const cycle = calculerCycleAg(copro({}), new Set(), TODAY);
    expect(cycle.enRetard).toBe(false);
  });

  it("etape en preparation -> echeance en J-x", () => {
    const cycle = calculerCycleAg(copro(AG_PROCHE), new Set(["ODJ_CS"]), TODAY);
    expect(cycle.echeance).toMatch(/^J-\d+$|^à confirmer$/);
  });
});

describe("calculerCycleAg = les DEUX anciennes projections, a l'identique", () => {
  const cas: [string, Copropriete, Set<string>, string][] = [
    ["a_planifier", copro({}), new Set(), TODAY],
    ["en_preparation", copro(AG_PROCHE), new Set(), TODAY],
    ["convoquee", copro(AG_PROCHE), new Set(["ODJ_CS", "CONVOC"]), TODAY],
    [
      "tenue datee",
      copro({ ...AG_PROCHE, prochaineAg: { date: "2026-06-10", statut: "planifiee" } }),
      new Set(["ODJ_CS", "CONVOC", "TENUE"]),
      TODAY,
    ],
  ];

  it.each(cas)("%s : etat identique a etatCycleAg", (_nom, c, accompli, today) => {
    const cycle = calculerCycleAg(c, accompli, today);
    const attendu = etatCycleAg(c, accompli.has("CONVOC"), today);
    expect(cycle.etat).toBe(attendu.etat);
    expect(cycle.enRetard).toBe(attendu.enRetard);
  });

  it.each(cas)("%s : etapes et action identiques a construireLigne", (_nom, c, accompli, today) => {
    const cycle = calculerCycleAg(c, accompli, today);
    const ligne = construireLigne(c, accompli, today)?.ligne;
    expect(cycle.etapes).toEqual(ligne?.etapes);
    expect(cycle.actionDuMoment?.action).toBe(ligne?.prochaineAction);
    expect(cycle.actionDuMoment?.label).toBe(ligne?.actionLabel);
    expect(cycle.actionDuMoment?.href).toBe(ligne?.lien);
  });
});
