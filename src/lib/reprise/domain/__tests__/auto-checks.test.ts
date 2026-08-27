import { describe, expect, it } from "vitest";
import type { JeuDeDonnees } from "../patrimoine";
import { verifierTout } from "../auto-checks";

/** Petite copro VALIDE de reference : 2 lots, 1 cle generale (total 1000), 2 owners. */
function jeuValide(): JeuDeDonnees {
  return {
    lots: [
      { numero: 1, type: "Appartement", usage: "residential", etage: 1, commentaire: "Appartement T2 au 1er" },
      { numero: 2, type: "Parking", usage: "parking", etage: -1, commentaire: "Parking au sous-sol" },
    ],
    cles: [{ code: "001", libelle: "Charges generales", totalAttendu: 1000, defaut: true }],
    tantiemes: [
      { cleCode: "001", lot: 1, valeur: 600 },
      { cleCode: "001", lot: 2, valeur: 400 },
    ],
    owners: [
      { id: "o1", civilite: "m", nom: "DUPONT", prenom: "Jean", pro: false },
      { id: "o2", civilite: "mme", nom: "MARTIN", prenom: "Claire", pro: false },
    ],
    attributions: [
      { ownerId: "o1", lot: 1 },
      { ownerId: "o2", lot: 2 },
    ],
  };
}

describe("verifierTout - jeu valide", () => {
  it("ne remonte aucune erreur (ok=true)", () => {
    const r = verifierTout(jeuValide());
    expect(r.erreurs, JSON.stringify(r.erreurs)).toHaveLength(0);
    expect(r.ok).toBe(true);
  });
});

describe("verifierTout - detections d'erreurs", () => {
  it("numero de lot en doublon", () => {
    const d = jeuValide();
    d.lots[1]!.numero = 1;
    expect(verifierTout(d).erreurs.some((e) => e.code === "LOT_NUMERO_DOUBLON")).toBe(true);
  });

  it("usage hors liste fermee", () => {
    const d = jeuValide();
    // @ts-expect-error : valeur volontairement invalide pour le test
    d.lots[0]!.usage = "habitation";
    expect(verifierTout(d).erreurs.some((e) => e.code === "LOT_USAGE_HORS_LISTE")).toBe(true);
  });

  it("tantieme a 0 (doit etre omis, pas a 0)", () => {
    const d = jeuValide();
    d.tantiemes.push({ cleCode: "001", lot: 2, valeur: 0 });
    expect(verifierTout(d).erreurs.some((e) => e.code === "TANT_VALEUR_ZERO")).toBe(true);
  });

  it("ecart de total sur une cle", () => {
    const d = jeuValide();
    d.tantiemes[0]!.valeur = 599; // somme 999 != 1000
    expect(verifierTout(d).erreurs.some((e) => e.code === "TANT_ECART_TOTAL")).toBe(true);
  });

  it("code cle non prefixe sur 3 chiffres", () => {
    const d = jeuValide();
    d.cles[0]!.code = "1";
    d.tantiemes.forEach((t) => (t.cleCode = "1"));
    expect(verifierTout(d).erreurs.some((e) => e.code === "TANT_CODE_CLE_INVALIDE")).toBe(true);
  });

  it("lot absent de TOUTES les cles : erreur", () => {
    const d = jeuValide();
    d.tantiemes = d.tantiemes.filter((t) => t.lot !== 2);
    d.cles[0]!.totalAttendu = 600; // pour isoler l'erreur d'absence
    expect(verifierTout(d).erreurs.some((e) => e.code === "LOT_SANS_AUCUN_TANTIEME")).toBe(true);
  });

  it("lot du syndicat : absent de la cle generale mais present ailleurs -> warning, pas erreur", () => {
    // Cas reel S0304 : la loge du gardien et la salle de reunions portent des tantiemes de
    // propriete mais AUCUNE charge generale (le syndicat ne se facture pas a lui-meme).
    const d = jeuValide();
    d.cles.push({ code: "002", libelle: "Parties communes generales", totalAttendu: 100 });
    d.tantiemes = d.tantiemes.filter((t) => t.lot !== 2);
    d.tantiemes.push({ lot: 2, cleCode: "002", valeur: 100 });
    d.cles[0]!.totalAttendu = 600; // pour isoler le cas
    const r = verifierTout(d);
    expect(r.erreurs.some((e) => e.code === "LOT_ABSENT_CLE_GENERALE")).toBe(false);
    expect(r.erreurs.some((e) => e.code === "LOT_SANS_AUCUN_TANTIEME")).toBe(false);
    expect(r.warnings.some((w) => w.code === "LOT_ABSENT_CLE_GENERALE")).toBe(true);
  });

  it("links non fournis : un seul message d'info, aucun lot orphelin", () => {
    const d = jeuValide();
    d.attributions = [];
    const r = verifierTout(d);
    expect(r.erreurs.some((e) => e.code === "LINK_LOT_ORPHELIN")).toBe(false);
    expect(JSON.stringify(r).includes("LINKS_NON_FOURNIS")).toBe(true);
  });

  it("personne morale : \"SERVICE SYNDIC\" en prenom ne declenche pas Title Case", () => {
    // Convention cabinet : representant legal inconnu -> "SERVICE SYNDIC" (majuscules voulues).
    const d = jeuValide();
    d.owners[0]!.pro = true;
    d.owners[0]!.raisonSociale = "ELDIVIE SCI";
    d.owners[0]!.civilite = "m";
    d.owners[0]!.prenom = "SERVICE SYNDIC";
    expect(verifierTout(d).erreurs.some((e) => e.code === "OWNER_PRENOM_NON_TITLECASE")).toBe(false);
  });

  it("nom non en majuscules", () => {
    const d = jeuValide();
    d.owners[0]!.nom = "Dupont";
    expect(verifierTout(d).erreurs.some((e) => e.code === "OWNER_NOM_NON_MAJ")).toBe(true);
  });

  it("prenom pas en Title Case", () => {
    const d = jeuValide();
    d.owners[0]!.prenom = "JEAN";
    expect(verifierTout(d).erreurs.some((e) => e.code === "OWNER_PRENOM_NON_TITLECASE")).toBe(true);
  });

  it("civilite hors liste fermee", () => {
    const d = jeuValide();
    // @ts-expect-error : valeur volontairement invalide pour le test
    d.owners[0]!.civilite = "autre";
    expect(verifierTout(d).erreurs.some((e) => e.code === "OWNER_CIVILITE_HORS_LISTE")).toBe(true);
  });

  it("SCI (Pro) sans raison sociale", () => {
    const d = jeuValide();
    d.owners[0]!.pro = true;
    expect(verifierTout(d).erreurs.some((e) => e.code === "OWNER_SCI_SANS_RAISON")).toBe(true);
  });

  it("lot orphelin (aucun proprietaire)", () => {
    const d = jeuValide();
    d.attributions = d.attributions.filter((a) => a.lot !== 2);
    expect(verifierTout(d).erreurs.some((e) => e.code === "LINK_LOT_ORPHELIN")).toBe(true);
  });

  it("code eStale 4-car invalide (phase B)", () => {
    const d = jeuValide();
    d.attributions[0]!.codeEstale = "AB"; // pas 4 caracteres
    expect(verifierTout(d).erreurs.some((e) => e.code === "LINK_CODE_4CAR_INVALIDE")).toBe(true);
  });
});

describe("verifierTout - warnings non bloquants", () => {
  it("fusion R7 proposee = warning, pas erreur", () => {
    const d = jeuValide();
    d.owners.push({ id: "o3", civilite: "m", nom: "DUPONT", prenom: "Jean", pro: false });
    d.attributions.push({ ownerId: "o3", lot: 1 });
    const r = verifierTout(d);
    expect(r.warnings.some((w) => w.code === "OWNER_FUSION_A_VALIDER")).toBe(true);
    expect(r.ok).toBe(true);
  });
});
