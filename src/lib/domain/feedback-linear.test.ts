import { describe, expect, it } from "vitest";
import type { Feedback } from "./feedback";
import {
  descriptionLinear,
  doitPartirDansLinear,
  etatLinearPourStatut,
  labelsLinear,
  prioriteLinear,
  raisonEcartDepuisLinear,
  statutDepuisEtatLinear,
} from "./feedback-linear";

function remontee(p: Partial<Feedback> = {}): Feedback {
  return {
    id: "f1",
    type: "bug",
    titre: "Le récap AG n'apparaît pas",
    description: "Sur S052, le récap ne remonte pas dans l'app.",
    severite: "genant",
    statut: "nouveau",
    createdAt: "2026-10-01T09:00:00.000Z",
    ...p,
  };
}

describe("statutDepuisEtatLinear", () => {
  it("mappe les états standards de l'équipe REAL31", () => {
    expect(statutDepuisEtatLinear("backlog")).toBe("nouveau");
    expect(statutDepuisEtatLinear("triage")).toBe("nouveau");
    expect(statutDepuisEtatLinear("unstarted")).toBe("prevu");
    expect(statutDepuisEtatLinear("started")).toBe("en_cours");
    expect(statutDepuisEtatLinear("completed")).toBe("livre");
    expect(statutDepuisEtatLinear("canceled")).toBe("ecarte");
    expect(statutDepuisEtatLinear("duplicate")).toBe("ecarte");
  });

  // LE garde-fou : un état custom créé dans Linear ne doit pas écarter une remontée
  // par surprise. `undefined` veut dire "ne touche à rien" pour le service.
  it("rend undefined sur un type d'état inconnu, pour ne rien toucher", () => {
    expect(statutDepuisEtatLinear("etat_maison")).toBeUndefined();
    expect(statutDepuisEtatLinear("")).toBeUndefined();
  });
});

describe("doitPartirDansLinear", () => {
  it("pousse une remontée de collaborateur non terminée", () => {
    expect(doitPartirDansLinear({ severite: "bloquant", statut: "nouveau" })).toBe(true);
    expect(doitPartirDansLinear({ severite: "confort", statut: "prevu" })).toBe(true);
    expect(doitPartirDansLinear({ severite: "genant", statut: "en_cours" })).toBe(true);
  });

  // Sévérité absente = entrée « maison » créée par l'admin pour /nouveautes : ce
  // n'est pas une remontée, elle n'a rien à faire dans le backlog.
  it("ignore une entrée « maison » (pas de sévérité)", () => {
    expect(doitPartirDansLinear({ statut: "nouveau" })).toBe(false);
    expect(doitPartirDansLinear({ statut: "livre" })).toBe(false);
  });

  // Au premier passage du cron la table contient des mois d'historique : ne pas
  // remplir le backlog de tickets déjà réglés.
  it("ignore une remontée déjà terminée", () => {
    expect(doitPartirDansLinear({ severite: "genant", statut: "livre" })).toBe(false);
    expect(doitPartirDansLinear({ severite: "genant", statut: "ecarte" })).toBe(false);
  });
});

// LA regression trouvee a la simulation du premier passage (2026-10-06) : sans etat
// de naissance deduit du statut, le pont effacait le triage deja fait sur 25 des 67
// remontees a pousser (elles revenaient a `nouveau`, donc hors de /nouveautes).
describe("etatLinearPourStatut (ne pas effacer le triage déjà fait)", () => {
  it("fait naître le ticket dans l'état qui correspond au statut actuel", () => {
    expect(etatLinearPourStatut("nouveau")).toBe("backlog");
    expect(etatLinearPourStatut("prevu")).toBe("unstarted");
    expect(etatLinearPourStatut("en_cours")).toBe("started");
  });

  it("est le miroir exact de statutDepuisEtatLinear sur les statuts qui partent", () => {
    for (const statut of ["nouveau", "prevu", "en_cours"] as const) {
      expect(statutDepuisEtatLinear(etatLinearPourStatut(statut))).toBe(statut);
    }
  });
});

describe("priorité et labels", () => {
  it("dérive la priorité Linear de la gravité ressentie", () => {
    expect(prioriteLinear("bloquant")).toBe(1); // Urgent
    expect(prioriteLinear("genant")).toBe(2); // High
    expect(prioriteLinear("confort")).toBe(4); // Low
    expect(prioriteLinear(undefined)).toBe(0); // None
  });

  it("utilise les labels qui existent déjà dans l'équipe", () => {
    expect(labelsLinear("bug")).toEqual(["Bug"]);
    expect(labelsLinear("idee")).toEqual(["Idée"]);
  });
});

describe("raisonEcartDepuisLinear", () => {
  // Le domaine EXIGE une raison non vide pour `ecarte` : on trace la provenance
  // plutôt que d'inventer un motif.
  it("trace la provenance sans inventer de motif", () => {
    expect(raisonEcartDepuisLinear("REA-87", "Canceled")).toBe("Canceled dans Linear (REA-87)");
    expect(raisonEcartDepuisLinear("REA-88", "Duplicate")).toBe("Duplicate dans Linear (REA-88)");
  });
});

describe("descriptionLinear", () => {
  it("remet le contexte que Linear n'a pas", () => {
    const d = descriptionLinear(
      remontee({ auteurEmail: "remi.bard@real31.fr", page: "/copropriete/S052" }),
      "https://real31.app",
    );
    expect(d).toContain("Sur S052, le récap ne remonte pas dans l'app.");
    expect(d).toContain("Real31.app");
    expect(d).toContain("/copropriete/S052");
    expect(d).toContain("genant");
    expect(d).toContain("remi.bard@real31.fr");
    expect(d).toContain("2026-10-01");
    expect(d).toContain("https://real31.app/admin/feedback");
  });

  // ESTALE s'écrit en CAPITALES dans toute l'UI, et le champ `page` encode
  // l'application sous "app:lien" (cf. encoderPageFeedback).
  it("nomme l'application quand la remontée ne vient pas de real31.app", () => {
    const d = descriptionLinear(remontee({ page: "estale:https://app.estale.fr/x" }));
    expect(d).toContain("ESTALE");
    expect(d).toContain("https://app.estale.fr/x");
  });

  it("omet le lien de retour quand aucune base URL n'est connue (dev)", () => {
    expect(descriptionLinear(remontee())).not.toContain("Fiche interne");
  });
});
