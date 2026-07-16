// Tests du domaine PUR classement-notes. Toutes les chaines sont SYNTHETIQUES et calquees sur les
// libelles reellement produits (parseur, couche-texte, liaison, controle, mapping, auto-checks) -
// aucune donnee reelle, aucun nom de personne (regle PII).
import { describe, expect, it } from "vitest";
import { classerNote, classerNotes, sourceNote } from "../classement-notes";

describe("sourceNote", () => {
  it("reconnait la liaison 450 (avant la compta, vocabulaire partage)", () => {
    expect(sourceNote("owner o12 : appariement 450 ambigu (confiance 0.71) -> a trancher")).toBe("liaison");
    expect(sourceNote("owner o3 : compte 450 4501C revendique par plusieurs owners -> a trancher")).toBe("liaison");
    expect(sourceNote("Liaison 450 impossible : intitules non captures (pipeline couche texte requis).")).toBe(
      "liaison",
    );
  });

  it("reconnait la compta (parseur, pipeline, controle, grand livre)", () => {
    expect(sourceNote("Parseur : 4 ligne(s) report/solde/sous-total exclue(s).")).toBe("compta");
    expect(sourceNote("Controle par compte : 12 controle(s), 0 en ecart.")).toBe("compta");
    expect(sourceNote("Pipeline COUCHE TEXTE (PDF natif, positions) : 320 ecriture(s), equilibre global ecart 0.")).toBe(
      "compta",
    );
    expect(sourceNote("Grand livre DESEQUILIBRE : ecart 150 (total debit != total credit).")).toBe("compta");
    expect(sourceNote("3 ligne(s) ecartee(s) : compte hors classes comptables 1-7.")).toBe("compta");
  });

  it("reconnait le patrimoine (EDD, cle, lot, tantieme)", () => {
    expect(sourceNote("EDD retenu : rcp.pdf (total tantiemes coherent avec la capture eStale)")).toBe("patrimoine");
    expect(sourceNote("Cle 002 (eau froide) : ecart de total (somme 9990 != attendu 10000)")).toBe("patrimoine");
  });

  it("reconnait les proprietaires (SCI, doublon, fusion, civilite)", () => {
    expect(sourceNote("Fusion proposee (R7) pour \"DUPONT\" : 2 entites identiques a fusionner")).toBe("proprietaires");
    expect(sourceNote("SCI EXEMPLE : gerant inconnu -> civilite m par defaut ; K-bis a fournir")).toBe("proprietaires");
  });

  it("retombe sur 'autre' pour une chaine non reconnue", () => {
    expect(sourceNote("note libre sans motif particulier")).toBe("autre");
  });
});

describe("classerNote - niveau", () => {
  it("erreur : desequilibre, avant repartition, couche texte, orphelin", () => {
    expect(classerNote("Grand livre DESEQUILIBRE : ecart 150 (total debit != total credit).").niveau).toBe("erreur");
    expect(classerNote("Ce PDF ne porte pas de couche texte exploitable (scan ?).").niveau).toBe("erreur");
    expect(classerNote("Lot orphelin (aucun proprietaire attribue) : 12").niveau).toBe("erreur");
    expect(classerNote("Liaison 450 impossible : intitules non captures.").niveau).toBe("erreur");
  });

  it("anomalie : ecart non nul, doublon, fusion, hors liste, sans lot", () => {
    expect(classerNote("Cle 002 (eau froide) : ecart de total (somme 9990 != attendu 10000)").niveau).toBe("anomalie");
    expect(classerNote("Controle par compte : 12 controle(s), 3 en ecart.").niveau).toBe("anomalie");
    expect(classerNote("Doublon non tranchable pour \"MARTIN\" : donnees divergentes").niveau).toBe("anomalie");
    expect(classerNote("Coproprietaire sans lot attribue : DURAND").niveau).toBe("anomalie");
    expect(classerNote("Lot 5 : usage hors liste fermee (\"garage\")").niveau).toBe("anomalie");
  });

  it("vigilance : a trancher, a valider, a verifier, a fournir, decider", () => {
    expect(classerNote("owner o12 : appariement 450 ambigu (confiance 0.71) -> a trancher").niveau).toBe("vigilance");
    expect(classerNote("compte 401ABC (fournisseur) : appariement a valider, confiance 0.62").niveau).toBe(
      "vigilance",
    );
    expect(classerNote("compte 489000 : 489 present -> decider s'il est repris (cf. equilibre).").niveau).toBe(
      "vigilance",
    );
    expect(classerNote("SCI EXEMPLE : gerant inconnu -> civilite m par defaut ; K-bis a fournir").niveau).toBe(
      "vigilance",
    );
    expect(classerNote("Lot 3 : commentaire absent (description RCP a verifier)").niveau).toBe("vigilance");
  });

  it("info : comptages purs et statut de pipeline (ecart 0)", () => {
    expect(classerNote("Parseur : 4 ligne(s) report/solde/sous-total exclue(s).").niveau).toBe("info");
    expect(classerNote("Controle par compte : 12 controle(s), 0 en ecart.").niveau).toBe("info");
    expect(
      classerNote("Pipeline COUCHE TEXTE (PDF natif, positions) : 320 ecriture(s), equilibre global ecart 0.").niveau,
    ).toBe("info");
    expect(classerNote("3 ligne(s) ecartee(s) : compte vide ou montant nul.").niveau).toBe("info");
  });

  it("prend erreur > anomalie quand les deux motifs coexistent (DESEQUILIBRE + ecart)", () => {
    // "DESEQUILIBRE ... ecart 150" : desequilibre l'emporte, pas simplement "anomalie".
    expect(classerNote("Grand livre DESEQUILIBRE : ecart 150.").niveau).toBe("erreur");
  });
});

describe("classerNote - defaut", () => {
  it("tombe sur 'info' par defaut pour une note neutre", () => {
    expect(classerNote("EDD retenu : rcp.pdf (total tantiemes coherent).").niveau).toBe("info");
  });

  it("respecte le niveauParDefaut (anomalies persistees d'un dossier)", () => {
    expect(classerNote("note neutre non reconnue", { niveauParDefaut: "anomalie" }).niveau).toBe("anomalie");
    // mais une heuristique plus forte l'emporte toujours sur le defaut
    expect(classerNote("Grand livre DESEQUILIBRE : ecart 12.", { niveauParDefaut: "anomalie" }).niveau).toBe("erreur");
  });
});

describe("classerNotes", () => {
  it("classe une liste et ignore les chaines vides sans crasher", () => {
    const res = classerNotes(["", "   ", "Parseur : 2 total(aux) de compte capture(s) pour controle."]);
    expect(res).toHaveLength(1);
    expect(res[0]).toEqual({
      niveau: "info",
      source: "compta",
      texte: "Parseur : 2 total(aux) de compte capture(s) pour controle.",
    });
  });

  it("gere une liste vide", () => {
    expect(classerNotes([])).toEqual([]);
  });
});
