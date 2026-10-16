import { describe, expect, it } from "vitest";
import { plusJours } from "./dates";
import { corpsMail, rappelsDus, sujetMail, type EntreeRappel, type RappelDu } from "./relances";
import type { Cycle, RegleRelance } from "./types";

const AUJ = "2026-05-17";
const REGLE: RegleRelance = { sujet: "assurance", premierRappelJours: 180, orangeJours: 30, rougeJours: 60, cadenceJours: 7 };

function cycle(over: Partial<Cycle> = {}): Cycle {
  return { id: "c1", sujet: "assurance", coproCode: "S0247", statut: "en_cours", echeanceISO: "2027-03-01", etapes: {}, demarreManuellement: null, creeLeISO: "2026-01-01", ...over };
}

function entree(over: Partial<EntreeRappel> = {}): EntreeRappel {
  return { cycle: cycle(), coproNom: "LES MARRONNIERS", niveau: "orange", regle: REGLE, ...over };
}

/** Échéance telle que la fenêtre soit ouverte depuis `jours` jours. */
function ouverteDepuis(jours: number): string {
  return plusJours(AUJ, REGLE.premierRappelJours - jours);
}

describe("rappelsDus", () => {
  it("ne rappelle que les cycles en cours, datés, fenêtre ouverte, jamais les « à compléter »", () => {
    const dus = rappelsDus(
      [
        entree({ cycle: cycle({ id: "ok", echeanceISO: ouverteDepuis(10) }), niveau: "vert" }),
        entree({ cycle: cycle({ id: "pas-ouverte", echeanceISO: ouverteDepuis(-1) }), niveau: "vert" }),
        entree({ cycle: cycle({ id: "clos", statut: "clos", echeanceISO: ouverteDepuis(10) }), niveau: "rouge" }),
        entree({ cycle: cycle({ id: "sans-echeance", echeanceISO: null }), niveau: "a_completer" }),
        entree({ cycle: cycle({ id: "ouverte-aujourdhui", echeanceISO: ouverteDepuis(0) }), niveau: "vert" }),
      ],
      AUJ,
    );
    expect(dus.map((r) => r.cycleId)).toEqual(["ok", "ouverte-aujourdhui"]);
  });

  it("une clé par période de cadence : contrats|sujet|cycle|période", () => {
    const pour = (jours: number) => rappelsDus([entree({ cycle: cycle({ echeanceISO: ouverteDepuis(jours) }) })], AUJ)[0]?.cle;
    expect(pour(0)).toBe("contrats|assurance|c1|0");
    expect(pour(6)).toBe("contrats|assurance|c1|0");
    expect(pour(7)).toBe("contrats|assurance|c1|1");
    expect(pour(45)).toBe("contrats|assurance|c1|6");
    // le même cycle, deux jours de la même semaine : même clé, la table des envois dédoublonne
    const c = cycle({ echeanceISO: ouverteDepuis(10) });
    expect(rappelsDus([entree({ cycle: c })], AUJ)[0]?.cle).toBe(rappelsDus([entree({ cycle: c })], plusJours(AUJ, 3))[0]?.cle);
    expect(rappelsDus([entree({ cycle: c })], AUJ)[0]?.cle).not.toBe(rappelsDus([entree({ cycle: c })], plusJours(AUJ, 7))[0]?.cle);
  });

  it("le rouge met la direction en copie, et le rappel porte de quoi s'expliquer", () => {
    const [r] = rappelsDus([entree({ cycle: cycle({ echeanceISO: ouverteDepuis(70), etapes: { offres_demandees: plusJours(AUJ, -65) } }), niveau: "rouge" })], AUJ);
    expect(r).toMatchObject({
      sujet: "assurance",
      coproCode: "S0247",
      coproNom: "LES MARRONNIERS",
      niveau: "rouge",
      copieDirection: true,
      joursSansAvancement: 65,
      etapeCourante: { libelle: "Offres demandées", dateISO: plusJours(AUJ, -65) },
    });
    expect(rappelsDus([entree({ niveau: "orange", cycle: cycle({ echeanceISO: ouverteDepuis(40) }) })], AUJ)[0]?.copieDirection).toBe(false);
  });
});

describe("sujetMail / corpsMail", () => {
  const rappel: RappelDu = {
    cle: "contrats|assurance|c1|6",
    cycleId: "c1",
    sujet: "assurance",
    coproCode: "S0247",
    coproNom: "LES MARRONNIERS",
    echeanceISO: "2027-03-01",
    niveau: "rouge",
    copieDirection: true,
    joursSansAvancement: 65,
    etapeCourante: { libelle: "Offres demandées", dateISO: "2026-03-13" },
  };

  it("objet : « [Échéance Assurance] NOM (S0247) : échéance 01/03/2027 »", () => {
    expect(sujetMail(rappel)).toBe("[Échéance Assurance] LES MARRONNIERS (S0247) : échéance 01/03/2027");
    expect(sujetMail({ ...rappel, sujet: "ctq_vmc" })).toBe("[Échéance CTQ VMC gaz] LES MARRONNIERS (S0247) : échéance 01/03/2027");
  });

  it("corps : texte clair, niveau expliqué, dernière étape, lien, mention automatique", () => {
    const corps = corpsMail(rappel, "https://real31.app/copropriete/S0247?onglet=contrats");
    expect(corps).toContain("Assurance multirisque immeuble de la copropriété LES MARRONNIERS (S0247) arrive à échéance le 01/03/2027.");
    expect(corps).toContain("Niveau rouge : dossier sans avancement depuis 65 jours. La direction est en copie.");
    expect(corps).toContain("Dernière étape datée : « Offres demandées » le 13/03/2026.");
    expect(corps).toContain("https://real31.app/copropriete/S0247?onglet=contrats");
    expect(corps).toContain("Message automatique de l'intranet REAL31.");
    expect(corps).not.toContain("<");
  });

  it("corps orange sans étape, et vert", () => {
    const orange = corpsMail({ ...rappel, niveau: "orange", copieDirection: false, joursSansAvancement: 31, etapeCourante: null }, "lien");
    expect(orange).toContain("Niveau orange : dossier sans avancement depuis 31 jours.");
    expect(orange).toContain("Aucune étape n'est encore datée sur ce cycle.");
    expect(orange).not.toContain("direction");
    expect(corpsMail({ ...rappel, niveau: "vert", copieDirection: false, joursSansAvancement: 1 }, "lien")).toContain("Niveau vert");
  });
});
