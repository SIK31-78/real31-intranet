import { describe, expect, it } from "vitest";
import { cleEtatBoite, statutPartage, type StatutEcrit } from "./statut-partage";

const BOITE = "syndic4@real31.fr";
const ligne = (gestionnaireId: string, statut: StatutEcrit["statut"], marqueAt = "2026-10-15T08:00:00Z"): StatutEcrit => ({
  gestionnaireId,
  emailId: "<m1@x>",
  statut,
  etapesFaites: [],
  marqueAt,
});

describe("statut partagé d'une boîte partagée", () => {
  it("un mail conclu par Mylène est conclu chez Nicolas", () => {
    expect(statutPartage(BOITE, [ligne("mylene", "classe")])?.statut).toBe("classe");
  });

  it("la ligne de la boîte gagne : un mail rouvert l'est pour tous", () => {
    const lignes = [ligne("mylene", "classe", "2026-10-15T08:00:00Z"), ligne(cleEtatBoite(BOITE), "nouveau", "2026-10-15T07:00:00Z")];
    expect(statutPartage(BOITE, lignes)?.statut).toBe("nouveau");
  });

  it("sans ligne de boîte, le traitement le plus récent l'emporte", () => {
    const lignes = [ligne("a", "repondu", "2026-10-14T08:00:00Z"), ligne("b", "classe", "2026-10-15T08:00:00Z")];
    expect(statutPartage(BOITE, lignes)?.statut).toBe("classe");
  });

  it("personne n'a traité le mail : pas de statut commun", () => {
    expect(statutPartage(BOITE, [ligne("nicolas", "nouveau")])).toBeNull();
    expect(statutPartage(BOITE, [])).toBeNull();
  });

  it("la clé de boîte ignore la casse", () => {
    expect(cleEtatBoite(" Syndic4@REAL31.fr")).toBe("boite:syndic4@real31.fr");
  });
});
