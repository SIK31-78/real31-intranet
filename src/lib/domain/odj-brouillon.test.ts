import { describe, expect, it } from "vitest";
import {
  BROUILLONS_VIDES,
  aDesModifsNonSauvees,
  atterrir,
  partirEnVol,
  poserBrouillon,
  statutGlobal,
  valeurLocale,
} from "./odj-brouillon";

describe("odj-brouillon - cycle nominal", () => {
  it("frappe -> attente -> vol -> atterrissage ok : le brouillon est consomme", () => {
    let b = poserBrouillon(BROUILLONS_VIDES, "lieu", "Salle des fetes");
    expect(statutGlobal(b)).toBe("en-attente");
    expect(valeurLocale(b, "lieu")).toBe("Salle des fetes");

    const { etat, cargaison } = partirEnVol(b);
    b = etat;
    expect(cargaison).toEqual({ lieu: "Salle des fetes" });
    expect(statutGlobal(b)).toBe("enregistrement");
    // Pendant le vol, la valeur reste affichable (pas de retour a l'ancienne valeur).
    expect(valeurLocale(b, "lieu")).toBe("Salle des fetes");

    b = atterrir(b, "lieu", true);
    expect(statutGlobal(b)).toBe("enregistre");
    expect(valeurLocale(b, "lieu")).toBeUndefined(); // le serveur fait foi desormais
    expect(aDesModifsNonSauvees(b)).toBe(false);
  });

  it("sans aucune activite, le statut est repos (pas 'enregistre' mensonger)", () => {
    expect(statutGlobal(BROUILLONS_VIDES)).toBe("repos");
  });

  it("partirEnVol sans attente ne change rien", () => {
    const { etat, cargaison } = partirEnVol(BROUILLONS_VIDES);
    expect(etat).toBe(BROUILLONS_VIDES);
    expect(cargaison).toEqual({});
  });
});

describe("odj-brouillon - frappe pendant le vol", () => {
  it("une frappe pendant le vol reste en attente et prime a l'affichage", () => {
    let b = poserBrouillon(BROUILLONS_VIDES, "lieu", "v1");
    b = partirEnVol(b).etat;
    b = poserBrouillon(b, "lieu", "v2"); // le gestionnaire retape pendant l'envoi
    expect(valeurLocale(b, "lieu")).toBe("v2");

    b = atterrir(b, "lieu", true);
    // v2 n'est PAS consommee par l'atterrissage de v1 : elle attend son propre vol.
    expect(valeurLocale(b, "lieu")).toBe("v2");
    expect(statutGlobal(b)).toBe("en-attente");
  });
});

describe("odj-brouillon - echec d'envoi", () => {
  it("un echec remet la valeur en attente (rien n'est perdu) et signale l'erreur", () => {
    let b = poserBrouillon(BROUILLONS_VIDES, "budget", "24500");
    b = partirEnVol(b).etat;
    b = atterrir(b, "budget", false);
    expect(statutGlobal(b)).toBe("erreur");
    expect(valeurLocale(b, "budget")).toBe("24500"); // re-essayable telle quelle
    expect(aDesModifsNonSauvees(b)).toBe(true);
  });

  it("l'echec ne remplace PAS une frappe plus recente", () => {
    let b = poserBrouillon(BROUILLONS_VIDES, "budget", "v1");
    b = partirEnVol(b).etat;
    b = poserBrouillon(b, "budget", "v2");
    b = atterrir(b, "budget", false); // v1 echoue
    expect(valeurLocale(b, "budget")).toBe("v2"); // v2 prime, v1 est abandonnee
  });

  it("une nouvelle frappe efface l'echec du champ, un envoi reussi aussi", () => {
    let b = poserBrouillon(BROUILLONS_VIDES, "budget", "v1");
    b = partirEnVol(b).etat;
    b = atterrir(b, "budget", false);
    expect(statutGlobal(b)).toBe("erreur");

    b = poserBrouillon(b, "budget", "v2");
    expect(statutGlobal(b)).toBe("en-attente"); // l'erreur est purgee par la reprise

    b = partirEnVol(b).etat;
    b = atterrir(b, "budget", true);
    expect(statutGlobal(b)).toBe("enregistre");
  });
});

describe("odj-brouillon - plusieurs champs", () => {
  it("la cargaison emporte tous les champs en attente, chacun atterrit seul", () => {
    let b = poserBrouillon(BROUILLONS_VIDES, "lieu", "ici");
    b = poserBrouillon(b, "budget", "100");
    const { etat, cargaison } = partirEnVol(b);
    b = etat;
    expect(Object.keys(cargaison).sort()).toEqual(["budget", "lieu"]);

    b = atterrir(b, "lieu", true);
    expect(statutGlobal(b)).toBe("enregistrement"); // budget encore en vol
    b = atterrir(b, "budget", true);
    expect(statutGlobal(b)).toBe("enregistre");
  });
});
