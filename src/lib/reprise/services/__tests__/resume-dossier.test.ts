import { describe, expect, it } from "vitest";
import { ETAPES_REPRISE, creerDossier } from "@/lib/reprise/domain/dossier";
import type { EquipeReprise } from "@/lib/reprise/domain/dossier";
import { etapesAssigneesA, resumerDossier } from "../resume-dossier";

const sekou = { id: "u-sekou", nom: "Sekou" };
const marie = { id: "u-marie", nom: "Marie" };
const equipe: EquipeReprise = { referent: sekou, gestionnaire: marie };
const N = ETAPES_REPRISE.length;

describe("resumerDossier", () => {
  it("dossier neuf : 0 %, etape courante = CA1 en CADRAGE, aucun compteur, pas d'activite", () => {
    const d = creerDossier("S0302", "Gabriel Péri");
    const r = resumerDossier(d, "2026-09-09");
    expect(r).toEqual({
      ref: "S0302",
      nomUsuel: "Gabriel Péri",
      archive: false,
      avancement: 0,
      etapesFaites: 0,
      etapesTotal: N,
      phase: "CADRAGE",
      etapeCourante: { code: "CA1", libelle: d.etapes[0]!.libelle, statut: "a_faire" },
      nbBloquees: 0,
      nbEnRetard: 0,
    });
  });

  it("reporte cadrage, equipe, archive, compteurs de blocage/retard et l'etape courante enrichie", () => {
    const d = creerDossier("S0303", "Test", "1 rue X", { sortant: "Foncia", dateBascule: "2026-01-01", equipe });
    d.compteurs.archive = true;
    const par = (code: string) => d.etapes.find((e) => e.code === code)!;
    par("CA1").statut = "fait";
    par("CA5").statut = "ignore";
    par("CA4").statut = "bloque";
    par("CA4").note = "Banque muette";
    par("CA4").echeance = "2026-09-01"; // depassee -> en retard
    par("BA1").statut = "bloque";
    par("DO1").echeance = "2026-09-08"; // a_faire, depassee -> en retard
    par("DO2").echeance = "2026-09-09"; // egale au jour : pas en retard
    par("DO3").statut = "fait";
    par("DO3").echeance = "2020-01-01"; // faite : jamais en retard

    const r = resumerDossier(d, "2026-09-09T10:00:00.000Z");
    expect(r.adresse).toBe("1 rue X");
    expect(r.sortant).toBe("Foncia");
    expect(r.dateBascule).toBe("2026-01-01");
    expect(r.archive).toBe(true);
    expect(r.equipe).toEqual(equipe);
    expect(r.etapesFaites).toBe(3);
    expect(r.etapesTotal).toBe(N);
    expect(r.avancement).toBeCloseTo(3 / N);
    expect(r.phase).toBe("CADRAGE");
    expect(r.etapeCourante).toEqual({
      code: "CA4",
      libelle: par("CA4").libelle,
      statut: "bloque",
      assigne: undefined, // assistant absent de l'equipe
      note: "Banque muette",
      echeance: "2026-09-01",
    });
    expect(r.nbBloquees).toBe(2);
    expect(r.nbEnRetard).toBe(2);
  });

  it("derniereActivite = max(journal.date, etapes.majLe) ; phase undefined quand tout est fait", () => {
    const d = creerDossier("S0304", "Fin");
    d.etapes = d.etapes.map((e) => ({ ...e, statut: "fait" as const }));
    d.etapes[3]!.majLe = "2026-09-05T09:00:00.000Z";
    d.journal.push({ date: "2026-09-01T09:00:00.000Z", texte: "a" }, { date: "2026-09-07T09:00:00.000Z", texte: "b" });
    const r = resumerDossier(d, "2026-09-09");
    expect(r.derniereActivite).toBe("2026-09-07T09:00:00.000Z");
    expect(r.phase).toBeUndefined();
    expect(r.etapeCourante).toBeUndefined();
    expect(r.avancement).toBe(1);

    d.etapes[3]!.majLe = "2026-09-08T09:00:00.000Z";
    expect(resumerDossier(d, "2026-09-09").derniereActivite).toBe("2026-09-08T09:00:00.000Z");
  });
});

describe("etapesAssigneesA", () => {
  it("ne rend que les etapes ouvertes de la personne, dans l'ordre du dossier", () => {
    const d = creerDossier("S0305", "Test", undefined, { equipe });
    const par = (code: string) => d.etapes.find((e) => e.code === code)!;
    par("CA1").statut = "fait"; // gestionnaire, close -> exclue
    par("CA5").statut = "ignore"; // exclue
    par("DO1").statut = "en_cours"; // incluse
    par("CA4").assigneA = marie; // assistant reassigne a Marie -> incluse
    const codes = etapesAssigneesA(d, marie.id).map((e) => e.code);
    expect(codes.slice(0, 3)).toEqual(["CA4", "DO1", "DO2"]);
    expect(codes).not.toContain("CA1");
    expect(codes).not.toContain("PA1"); // referent
    expect(etapesAssigneesA(d, "inconnu")).toEqual([]);
  });
});
