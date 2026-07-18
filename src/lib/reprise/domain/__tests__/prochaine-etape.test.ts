import { describe, expect, it } from "vitest";
import {
  prochaineEtape,
  DOCUMENTS_REQUIS,
  type ContexteProchaineEtape,
} from "../prochaine-etape";

// Contexte "tout est fait sauf la cloture" : point de depart des tests, qu'on degrade regle par
// regle en remontant le pipeline pour verifier que le PREMIER match gagne.
function ctxToutFait(): ContexteProchaineEtape {
  return {
    jeuPresent: true,
    pretAProduire: true,
    comptaErreur: false,
    avantRepartitionBloquant: false,
    raccordementKO: false,
    dejaInjecte: true,
    auMoinsUneFicheGeneree: true,
    comptaEnCoursPresente: true,
    revueMappingFaite: true,
    importComptaFait: true,
    clotureFaite: false,
  };
}

describe("prochaineEtape (guidage, ordre du pipeline)", () => {
  it("1. pas de jeu -> deposer les documents + lancer l'analyse (avec la liste des docs)", () => {
    const e = prochaineEtape({ ...ctxToutFait(), jeuPresent: false });
    expect(e.titre).toMatch(/Depose les documents/i);
    expect(e.description).toContain(DOCUMENTS_REQUIS[0]!);
    expect(e.action).toBe("zone:patrimoine");
    expect(e.tonalite).toBe("normal");
  });

  it("2. erreurs bloquantes -> editeur de corrections (attention)", () => {
    const e = prochaineEtape({ ...ctxToutFait(), pretAProduire: false });
    expect(e.titre).toMatch(/Corrige les erreurs/i);
    expect(e.action).toBe("zone:patrimoine");
    expect(e.tonalite).toBe("attention");
  });

  it("3. grand livre non exploitable -> redemander un PDF natif (attention)", () => {
    const e = prochaineEtape({ ...ctxToutFait(), comptaErreur: true });
    expect(e.titre).toMatch(/PDF natif/i);
    expect(e.action).toBe("zone:compta");
    expect(e.tonalite).toBe("attention");
  });

  it("4. grand livre avant repartition -> redemander apres repartition (bloque)", () => {
    const e = prochaineEtape({ ...ctxToutFait(), avantRepartitionBloquant: true });
    expect(e.titre).toMatch(/APRES repartition/i);
    expect(e.action).toBe("zone:compta");
    expect(e.tonalite).toBe("bloque");
  });

  it("5. raccordement KO -> les deux GL ne se raccordent pas (bloque)", () => {
    const e = prochaineEtape({ ...ctxToutFait(), raccordementKO: true });
    expect(e.titre).toMatch(/ne se raccordent pas/i);
    expect(e.action).toBe("zone:compta");
    expect(e.tonalite).toBe("bloque");
  });

  it("6. pret + pas injecte -> injecter le patrimoine (action phare)", () => {
    const e = prochaineEtape({ ...ctxToutFait(), dejaInjecte: false });
    expect(e.titre).toMatch(/Injecte le patrimoine/i);
    expect(e.action).toBe("zone:patrimoine");
    expect(e.tonalite).toBe("normal");
  });

  it("7. injecte + fiches non generees -> generer les fiches", () => {
    const e = prochaineEtape({ ...ctxToutFait(), auMoinsUneFicheGeneree: false });
    expect(e.titre).toMatch(/fiches de renseignements/i);
    expect(e.action).toBe("zone:fiches");
  });

  it("8. GL en cours manquant -> fournir le grand livre de l'exercice en cours", () => {
    const e = prochaineEtape({ ...ctxToutFait(), comptaEnCoursPresente: false });
    expect(e.titre).toMatch(/exercice en cours/i);
    expect(e.action).toBe("zone:compta");
  });

  it("9a. revue mapping non tranchee -> lien vers l'ecran de mapping", () => {
    const e = prochaineEtape({ ...ctxToutFait(), revueMappingFaite: false });
    expect(e.titre).toMatch(/revue du mapping/i);
    expect(e.action).toBe("nav:mapping");
  });

  it("9b. revue faite mais import non fait -> increment a venir (informatif, sans bouton)", () => {
    const e = prochaineEtape({ ...ctxToutFait(), importComptaFait: false });
    expect(e.titre).toMatch(/increment a venir/i);
    expect(e.action).toBeUndefined();
  });

  it("10. tout fait sauf cloture -> cloturer la reprise (lien vers le suivi)", () => {
    const e = prochaineEtape(ctxToutFait());
    expect(e.titre).toMatch(/Cloture la reprise/i);
    expect(e.action).toBe("zone:suivi");
  });

  it("10bis. tout fait y compris cloture -> reprise cloturee (sans bouton)", () => {
    const e = prochaineEtape({ ...ctxToutFait(), clotureFaite: true });
    expect(e.titre).toMatch(/cloturee/i);
    expect(e.action).toBeUndefined();
  });

  it("le premier match gagne : erreurs bloquantes priment sur l'injection", () => {
    // pretAProduire=false ET dejaInjecte=false : la regle 2 doit gagner, pas la 6.
    const e = prochaineEtape({ ...ctxToutFait(), pretAProduire: false, dejaInjecte: false });
    expect(e.titre).toMatch(/Corrige les erreurs/i);
  });
});
