// Tests du domaine PUR corrections-patrimoine : application immutable + transactionnelle des
// corrections manuelles. Tous les noms sont SYNTHETIQUES (aucune donnee reelle). On verifie
// chaque type de correction, les cascades, les fusions, la gestion des liaisons450, et les refus
// (references inconnues) qui ne doivent JAMAIS crasher ni muter l'entree.
import { describe, expect, it } from "vitest";
import { appliquerCorrections, resumerCorrections, type Correction } from "../corrections-patrimoine";
import type { JeuDeDonnees, LiaisonOwnerCompte } from "../patrimoine";

function jeuBase(): JeuDeDonnees {
  return {
    lots: [
      { numero: 1, type: "Appartement", usage: "residential", commentaire: "Lot 1" },
      { numero: 2, type: "Appartement", usage: "residential", commentaire: "Lot 2" },
      { numero: 3, type: "Parking", usage: "parking", commentaire: "Lot 3" },
    ],
    cles: [
      { code: "001", libelle: "Charges generales", totalAttendu: 1000 },
      { code: "100", libelle: "Ascenseur", totalAttendu: 500 },
    ],
    tantiemes: [
      { cleCode: "001", lot: 1, valeur: 400 },
      { cleCode: "001", lot: 2, valeur: 300 },
      { cleCode: "001", lot: 3, valeur: 300 },
      { cleCode: "100", lot: 1, valeur: 250 },
      { cleCode: "100", lot: 2, valeur: 250 },
    ],
    owners: [
      { id: "o1", civilite: "m", nom: "MARTIN", prenom: "Paul", pro: false },
      { id: "o2", civilite: "mme", nom: "NOVAK", prenom: "Elena", pro: false },
    ],
    attributions: [
      { ownerId: "o1", lot: 1 },
      { ownerId: "o1", lot: 3 },
      { ownerId: "o2", lot: 2 },
    ],
  };
}

function appliquer(corrections: Correction[], jeu = jeuBase()) {
  return appliquerCorrections(jeu, corrections);
}

describe("appliquerCorrections - immutabilite", () => {
  it("ne mute jamais le jeu d'entree", () => {
    const jeu = jeuBase();
    const snapshot = JSON.stringify(jeu);
    appliquerCorrections(jeu, [{ type: "tantieme.modifier", cleCode: "001", lot: 1, valeur: 999 }]);
    expect(JSON.stringify(jeu)).toBe(snapshot);
  });

  it("renvoie un jeu neuf en succes", () => {
    const jeu = jeuBase();
    const res = appliquerCorrections(jeu, []);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.jeu).not.toBe(jeu);
  });
});

describe("corrections LOT", () => {
  it("modifie les champs presents, laisse le numero (cle d'identite)", () => {
    const res = appliquer([{ type: "lot.modifier", numero: 2, champs: { usage: "commercial", commentaire: "corrige" } }]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const lot = res.jeu.lots.find((l) => l.numero === 2)!;
    expect(lot.usage).toBe("commercial");
    expect(lot.commentaire).toBe("corrige");
    expect(lot.type).toBe("Appartement"); // champ non fourni : inchange
  });

  it("refuse la modification d'un lot inconnu", () => {
    const res = appliquer([{ type: "lot.modifier", numero: 99, champs: { usage: "office" } }]);
    expect(res).toEqual({ ok: false, erreurs: [expect.stringContaining("Lot 99 introuvable")] });
  });

  it("ajoute un lot manque", () => {
    const res = appliquer([{ type: "lot.ajouter", lot: { numero: 4, type: "Cave", usage: "other", commentaire: "Lot 4" } }]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.jeu.lots.map((l) => l.numero)).toEqual([1, 2, 3, 4]);
  });

  it("refuse l'ajout d'un lot au numero deja present", () => {
    const res = appliquer([{ type: "lot.ajouter", lot: { numero: 1, type: "X", usage: "other", commentaire: "" } }]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.erreurs[0]).toContain("deja present");
  });

  it("refuse de supprimer un lot rattache sans cascade", () => {
    const res = appliquer([{ type: "lot.supprimer", numero: 1 }]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.erreurs[0]).toMatch(/cascade requise/);
  });

  it("supprime un lot en cascade (tantiemes + attributions)", () => {
    const res = appliquer([{ type: "lot.supprimer", numero: 3, cascade: true }]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.jeu.lots.some((l) => l.numero === 3)).toBe(false);
    expect(res.jeu.tantiemes.some((t) => t.lot === 3)).toBe(false);
    expect(res.jeu.attributions.some((a) => a.lot === 3)).toBe(false);
    expect(res.notes.some((n) => n.includes("cascade"))).toBe(true);
  });
});

describe("corrections CLE", () => {
  it("modifie libelle et totalAttendu", () => {
    const res = appliquer([{ type: "cle.modifier", code: "100", champs: { libelle: "Ascenseur A", totalAttendu: 480 } }]);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const cle = res.jeu.cles.find((k) => k.code === "100")!;
      expect(cle.libelle).toBe("Ascenseur A");
      expect(cle.totalAttendu).toBe(480);
    }
  });

  it("ajoute une cle", () => {
    const res = appliquer([{ type: "cle.ajouter", cle: { code: "200", libelle: "Eau", totalAttendu: 100 } }]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.jeu.cles.some((k) => k.code === "200")).toBe(true);
  });

  it("refuse de supprimer une cle avec tantiemes sans cascade, puis accepte avec cascade", () => {
    const refus = appliquer([{ type: "cle.supprimer", code: "100" }]);
    expect(refus.ok).toBe(false);
    const ok = appliquer([{ type: "cle.supprimer", code: "100", cascade: true }]);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.jeu.cles.some((k) => k.code === "100")).toBe(false);
      expect(ok.jeu.tantiemes.some((t) => t.cleCode === "100")).toBe(false);
    }
  });
});

describe("corrections TANTIEME (le geste cle : corriger un tantieme faux)", () => {
  it("modifie la valeur d'une ligne existante", () => {
    const res = appliquer([{ type: "tantieme.modifier", cleCode: "001", lot: 2, valeur: 350 }]);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const t = res.jeu.tantiemes.find((x) => x.cleCode === "001" && x.lot === 2)!;
      expect(t.valeur).toBe(350);
    }
  });

  it("refuse la modification d'une ligne inexistante", () => {
    const res = appliquer([{ type: "tantieme.modifier", cleCode: "100", lot: 3, valeur: 10 }]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.erreurs[0]).toContain("introuvable");
  });

  it("ajoute une ligne (cle et lot valides)", () => {
    const res = appliquer([{ type: "tantieme.ajouter", tantieme: { cleCode: "100", lot: 3, valeur: 0 } }]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.jeu.tantiemes.some((t) => t.cleCode === "100" && t.lot === 3)).toBe(true);
  });

  it("refuse d'ajouter une ligne sur une cle ou un lot inconnu, ou en doublon", () => {
    expect(appliquer([{ type: "tantieme.ajouter", tantieme: { cleCode: "999", lot: 1, valeur: 1 } }]).ok).toBe(false);
    expect(appliquer([{ type: "tantieme.ajouter", tantieme: { cleCode: "001", lot: 99, valeur: 1 } }]).ok).toBe(false);
    expect(appliquer([{ type: "tantieme.ajouter", tantieme: { cleCode: "001", lot: 1, valeur: 1 } }]).ok).toBe(false);
  });

  it("supprime une ligne", () => {
    const res = appliquer([{ type: "tantieme.supprimer", cleCode: "100", lot: 2 }]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.jeu.tantiemes.some((t) => t.cleCode === "100" && t.lot === 2)).toBe(false);
  });

  it("permet de corriger un ecart de total en enchainant les modifs (Σ redevient le total attendu)", () => {
    // Cle 100 attendu 500 ; on casse puis on repare via deux modifs sequentielles.
    const res = appliquer([
      { type: "tantieme.modifier", cleCode: "100", lot: 1, valeur: 300 },
      { type: "tantieme.modifier", cleCode: "100", lot: 2, valeur: 200 },
    ]);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const somme = res.jeu.tantiemes.filter((t) => t.cleCode === "100").reduce((s, t) => s + t.valeur, 0);
      expect(somme).toBe(500);
    }
  });
});

describe("corrections OWNER", () => {
  it("modifie les champs d'identite (nom ecorche corrige)", () => {
    const res = appliquer([{ type: "owner.modifier", id: "o1", champs: { nom: "MARTINEZ", email: "a@b.fr" } }]);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const o = res.jeu.owners.find((x) => x.id === "o1")!;
      expect(o.nom).toBe("MARTINEZ");
      expect(o.email).toBe("a@b.fr");
    }
  });

  it("ajoute un owner", () => {
    const res = appliquer([{ type: "owner.ajouter", owner: { id: "o3", civilite: "m", nom: "DUPONT", pro: false } }]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.jeu.owners.some((o) => o.id === "o3")).toBe(true);
  });

  it("refuse de supprimer un owner avec attributions sans reattribution", () => {
    const res = appliquer([{ type: "owner.supprimer", id: "o1" }]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.erreurs[0]).toMatch(/reattribution explicite requise/);
  });

  it("supprime un owner en reattribuant ses lots", () => {
    const res = appliquer([{ type: "owner.supprimer", id: "o1", reattribuerVers: "o2" }]);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.jeu.owners.some((o) => o.id === "o1")).toBe(false);
      // o2 recupere lots 1 et 3 en plus du 2 (dedup ok).
      expect(res.jeu.attributions.filter((a) => a.ownerId === "o2").map((a) => a.lot).sort()).toEqual([1, 2, 3]);
    }
  });

  it("refuse une reattribution vers un owner inconnu ou vers lui-meme", () => {
    expect(appliquer([{ type: "owner.supprimer", id: "o1", reattribuerVers: "zzz" }]).ok).toBe(false);
    expect(appliquer([{ type: "owner.supprimer", id: "o1", reattribuerVers: "o1" }]).ok).toBe(false);
  });
});

describe("corrections OWNER - fusion (cas doublon d'extraction)", () => {
  it("fusionne deux owners : l'absorbe disparait, ses lots vont au survivant (dedup)", () => {
    // o2 possede aussi le lot 1 (doublon d'attribution avec o1) pour tester la dedup.
    const jeu = jeuBase();
    jeu.attributions.push({ ownerId: "o2", lot: 1 });
    const res = appliquerCorrections(jeu, [{ type: "owner.fusionner", survivantId: "o1", absorbeId: "o2" }]);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.jeu.owners.some((o) => o.id === "o2")).toBe(false);
      // lots 1,2,3 rattaches a o1, sans doublon (ownerId,lot).
      const cles = res.jeu.attributions.map((a) => `${a.ownerId}#${a.lot}`);
      expect(new Set(cles).size).toBe(cles.length);
      expect(res.jeu.attributions.every((a) => a.ownerId === "o1")).toBe(true);
      expect(res.notes.some((n) => n.includes("absorbe"))).toBe(true);
    }
  });

  it("refuse une fusion sur un id inconnu ou identique", () => {
    expect(appliquer([{ type: "owner.fusionner", survivantId: "o1", absorbeId: "zzz" }]).ok).toBe(false);
    expect(appliquer([{ type: "owner.fusionner", survivantId: "o1", absorbeId: "o1" }]).ok).toBe(false);
  });
});

describe("corrections ATTRIBUTION", () => {
  it("reattache un lot a un autre owner (owner d'origine unique)", () => {
    const res = appliquer([{ type: "attribution.reattacher", lot: 2, versOwnerId: "o1" }]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.jeu.attributions.find((a) => a.lot === 2)!.ownerId).toBe("o1");
  });

  it("refuse la reattribution ambigue (lot a plusieurs owners) sans deOwnerId", () => {
    const jeu = jeuBase();
    jeu.attributions.push({ ownerId: "o2", lot: 1 }); // lot 1 en indivision o1+o2
    const res = appliquerCorrections(jeu, [{ type: "attribution.reattacher", lot: 1, versOwnerId: "o2" }]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.erreurs[0]).toMatch(/plusieurs coproprietaires/);
  });

  it("reattache l'attribution precise en indivision via deOwnerId", () => {
    const jeu = jeuBase();
    jeu.owners.push({ id: "o3", civilite: "m", nom: "TIERS", pro: false });
    jeu.attributions.push({ ownerId: "o2", lot: 1 });
    const res = appliquerCorrections(jeu, [{ type: "attribution.reattacher", lot: 1, deOwnerId: "o1", versOwnerId: "o3" }]);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const owners = res.jeu.attributions.filter((a) => a.lot === 1).map((a) => a.ownerId).sort();
      expect(owners).toEqual(["o2", "o3"]);
    }
  });

  it("ajoute et supprime une attribution", () => {
    const ajout = appliquer([{ type: "attribution.ajouter", ownerId: "o2", lot: 3 }]);
    expect(ajout.ok).toBe(true);
    if (ajout.ok) expect(ajout.jeu.attributions.some((a) => a.ownerId === "o2" && a.lot === 3)).toBe(true);

    const supp = appliquer([{ type: "attribution.supprimer", ownerId: "o1", lot: 1 }]);
    expect(supp.ok).toBe(true);
    if (supp.ok) expect(supp.jeu.attributions.some((a) => a.ownerId === "o1" && a.lot === 1)).toBe(false);
  });

  it("refuse l'ajout d'une attribution en doublon ou sur references inconnues", () => {
    expect(appliquer([{ type: "attribution.ajouter", ownerId: "o1", lot: 1 }]).ok).toBe(false);
    expect(appliquer([{ type: "attribution.ajouter", ownerId: "zzz", lot: 1 }]).ok).toBe(false);
    expect(appliquer([{ type: "attribution.ajouter", ownerId: "o1", lot: 99 }]).ok).toBe(false);
  });
});

describe("liaisons450 (retro-compat + preservation)", () => {
  function jeuAvecLiaisons(): JeuDeDonnees {
    const jeu = jeuBase();
    jeu.liaisons450 = [
      { ownerId: "o1", statut: "lie", compteSource: "4501.100" },
      { ownerId: "o2", statut: "lie", compteSource: "4501.200" },
    ];
    return jeu;
  }

  it("preserve les liaisons450 lors d'une correction qui ne touche pas les owners", () => {
    const res = appliquerCorrections(jeuAvecLiaisons(), [{ type: "tantieme.modifier", cleCode: "001", lot: 1, valeur: 400 }]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.jeu.liaisons450).toHaveLength(2);
  });

  it("retire la liaison450 d'un owner supprime", () => {
    const res = appliquerCorrections(jeuAvecLiaisons(), [{ type: "owner.supprimer", id: "o1", reattribuerVers: "o2" }]);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.jeu.liaisons450!.some((l) => l.ownerId === "o1")).toBe(false);
      expect(res.notes.some((n) => n.includes("Liaison compte 450"))).toBe(true);
    }
  });

  it("reattache la liaison450 de l'absorbe au survivant s'il n'en a pas", () => {
    const jeu = jeuBase();
    jeu.owners.push({ id: "o3", civilite: "m", nom: "SANSLIEN", pro: false });
    jeu.liaisons450 = [{ ownerId: "o1", statut: "lie", compteSource: "4501.100" } satisfies LiaisonOwnerCompte];
    // survivant o3 (sans liaison) absorbe o1 (avec liaison) -> la liaison suit o3.
    const res = appliquerCorrections(jeu, [{ type: "owner.fusionner", survivantId: "o3", absorbeId: "o1" }]);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.jeu.liaisons450!.find((l) => l.compteSource === "4501.100")!.ownerId).toBe("o3");
    }
  });

  it("un jeu SANS liaisons450 s'edite sans casse (champ optionnel)", () => {
    const res = appliquer([{ type: "owner.supprimer", id: "o1", reattribuerVers: "o2" }]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.jeu.liaisons450).toBeUndefined();
  });
});

describe("transactionnalite (tout ou rien)", () => {
  it("n'applique RIEN si une seule correction du lot echoue", () => {
    const jeu = jeuBase();
    const res = appliquerCorrections(jeu, [
      { type: "tantieme.modifier", cleCode: "001", lot: 1, valeur: 500 }, // valide
      { type: "lot.modifier", numero: 99, champs: { usage: "office" } }, // invalide
    ]);
    expect(res.ok).toBe(false);
    // Le jeu d'origine n'a pas bouge.
    expect(jeu.tantiemes.find((t) => t.cleCode === "001" && t.lot === 1)!.valeur).toBe(400);
  });

  it("agrege plusieurs erreurs", () => {
    const res = appliquer([
      { type: "lot.modifier", numero: 98, champs: {} },
      { type: "cle.modifier", code: "zzz", champs: {} },
    ]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.erreurs).toHaveLength(2);
  });

  it("applique une sequence dependante (ajouter owner puis lui attribuer un lot)", () => {
    const res = appliquer([
      { type: "owner.ajouter", owner: { id: "o9", civilite: "m", nom: "NOUVEAU", pro: false } },
      { type: "attribution.reattacher", lot: 2, versOwnerId: "o9" },
    ]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.jeu.attributions.find((a) => a.lot === 2)!.ownerId).toBe("o9");
  });
});

describe("resumerCorrections (PII-free)", () => {
  it("compte les familles sans exposer de donnee", () => {
    const s = resumerCorrections([
      { type: "tantieme.modifier", cleCode: "001", lot: 1, valeur: 1 },
      { type: "tantieme.modifier", cleCode: "001", lot: 2, valeur: 1 },
      { type: "lot.ajouter", lot: { numero: 5, type: "X", usage: "other", commentaire: "" } },
      { type: "owner.fusionner", survivantId: "o1", absorbeId: "o2" },
    ]);
    expect(s).toBe("1 lot(s), 2 tantieme(s), 1 fusion(s)");
    expect(resumerCorrections([])).toBe("aucune");
  });
});
