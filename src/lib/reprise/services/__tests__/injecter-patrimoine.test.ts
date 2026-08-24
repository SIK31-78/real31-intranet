import { describe, expect, it } from "vitest";
import type { JeuDeDonnees } from "@/lib/reprise/domain/patrimoine";
import { jeuCanonique } from "./fixtures/jeu-canonique";
import { injecterPatrimoine, type OperationInjection } from "../injecter-patrimoine";
import { DryRunEstaleEcritureProvider } from "@/lib/reprise/adapters/estale-ecriture/dry-run-provider";

const CONDO = "condo-test-42";

async function jeuMock(): Promise<JeuDeDonnees> {
  return jeuCanonique();
}

/** Index du premier op d'une mutation donnee (Infinity si absente) pour comparer l'ordre. */
function premierIndex(ops: OperationInjection[], mutation: OperationInjection["mutation"]): number {
  const i = ops.findIndex((o) => o.mutation === mutation);
  return i === -1 ? Number.POSITIVE_INFINITY : i;
}
function dernierIndex(ops: OperationInjection[], mutation: OperationInjection["mutation"]): number {
  for (let i = ops.length - 1; i >= 0; i--) if (ops[i]!.mutation === mutation) return i;
  return -1;
}

describe("injecterPatrimoine (dry-run)", () => {
  it("respecte l'ORDRE eStale : lots -> cles -> tantiemes -> owners -> links", async () => {
    const jeu = await jeuMock();
    const provider = new DryRunEstaleEcritureProvider();
    const rapport = await injecterPatrimoine(provider, CONDO, jeu);

    expect(rapport.succes).toBe(true);
    const ops = rapport.operations;

    // Tous les createLot avant le 1er createDK, etc. (bornes sup < bornes inf).
    expect(dernierIndex(ops, "createLot")).toBeLessThan(premierIndex(ops, "createDK"));
    expect(dernierIndex(ops, "createDK")).toBeLessThan(premierIndex(ops, "upsertLot"));
    expect(dernierIndex(ops, "upsertLot")).toBeLessThan(premierIndex(ops, "createOwner"));
    expect(dernierIndex(ops, "createOwner")).toBeLessThan(premierIndex(ops, "upsertOwner"));

    // seq strictement croissant et continu.
    ops.forEach((o, i) => expect(o.seq).toBe(i + 1));
  });

  it("a des COMPTEURS coherents avec le jeu (autant de creerLot que de lots, etc.)", async () => {
    const jeu = await jeuMock();
    const provider = new DryRunEstaleEcritureProvider();
    const rapport = await injecterPatrimoine(provider, CONDO, jeu);

    expect(rapport.compteurs.lots).toBe(jeu.lots.length); // 3
    expect(rapport.compteurs.cles).toBe(jeu.cles.length); // 1
    expect(rapport.compteurs.tantiemes).toBe(jeu.tantiemes.length); // 3
    expect(rapport.compteurs.owners).toBe(jeu.owners.length); // 3
    expect(rapport.compteurs.links).toBe(jeu.attributions.length); // 3

    // Le journal de l'adapter reflete exactement les memes volumes.
    const j = provider.journal;
    expect(j.filter((e) => e.type === "creerLot")).toHaveLength(jeu.lots.length);
    expect(j.filter((e) => e.type === "creerCle")).toHaveLength(jeu.cles.length);
    expect(j.filter((e) => e.type === "poserTantieme")).toHaveLength(jeu.tantiemes.length);
    expect(j.filter((e) => e.type === "creerOwner")).toHaveLength(jeu.owners.length);
    expect(j.filter((e) => e.type === "relierOwnerAuLot")).toHaveLength(3); // 3 attributions sur 3 lots distincts -> 3 groupes upsertOwner
  });

  it("cable les tantiemes sur les BONS IDs captures (cle + lot)", async () => {
    const jeu = await jeuMock();
    const provider = new DryRunEstaleEcritureProvider();
    await injecterPatrimoine(provider, CONDO, jeu);

    const tantiemes = provider.journal.filter((e) => e.type === "poserTantieme");
    // Le mock : cle "001" -> cle#1 ; lots 1,2,3 -> lot#1, lot#2, lot#3.
    for (const t of tantiemes) {
      expect(t.dkID).toBe("cle#1");
      expect(["lot#1", "lot#2", "lot#3"]).toContain(t.lotID);
    }
    // Les 3 valeurs EDD (450/400/150) doivent apparaitre sur les bons lots.
    const parLot = new Map(tantiemes.map((t) => [t.lotID, t.share]));
    expect(parLot.get("lot#1")).toBe(450);
    expect(parLot.get("lot#2")).toBe(400);
    expect(parLot.get("lot#3")).toBe(150);
  });

  it("cable les links sur les BONS ownerID captures", async () => {
    const jeu = await jeuMock();
    const provider = new DryRunEstaleEcritureProvider();
    await injecterPatrimoine(provider, CONDO, jeu);

    const links = provider.journal.filter((e) => e.type === "relierOwnerAuLot");
    // Mock : o1->lot1, o2->lot2, o3->lot3 ; owners crees dans l'ordre -> owner#1..#3.
    const map = new Map(links.map((l) => [l.lotID, l.data.map((d) => d.ownerID)]));
    expect(map.get("lot#1")).toEqual(["owner#1"]);
    expect(map.get("lot#2")).toEqual(["owner#2"]);
    expect(map.get("lot#3")).toEqual(["owner#3"]);

    // Owner unique par lot -> representative=true, part 100, division FREEHOLD.
    for (const l of links) {
      expect(l.data[0]!.representative).toBe(true);
      expect(l.data[0]!.share).toBe(100);
      expect(l.data[0]!.division).toBe("FREEHOLD");
    }
  });

  it("mappe usage/civilite vers les enums eStale et expose les IDs captures dans le rapport", async () => {
    const jeu = await jeuMock();
    const provider = new DryRunEstaleEcritureProvider();
    const rapport = await injecterPatrimoine(provider, CONDO, jeu);

    // Usage residential -> RESIDENTIAL, parking -> PARKING (via le journal creerLot).
    const lots = provider.journal.filter((e) => e.type === "creerLot");
    const uses = lots.map((l) => l.input.use);
    expect(uses).toContain("RESIDENTIAL");
    expect(uses).toContain("PARKING");

    // Civilite m&mme -> MandMME (couple DUPONT), m -> M (SCI BELLEVUE).
    const owners = provider.journal.filter((e) => e.type === "creerOwner");
    const civs = owners.map((o) => o.owner.civility);
    expect(civs).toContain("MandMME");
    expect(civs).toContain("M");

    // IDs captures exposes pour le cablage aval.
    expect(rapport.ids.cleParCode["001"]).toBe("cle#1");
    expect(rapport.ids.lotParNum["1"]).toBe("lot#1");
    expect(rapport.ids.ownerParId["o1"]).toBe("owner#1");
  });

  it("remonte des avertissements de mapping (resident inconnu, adresse incomplete)", async () => {
    const jeu = await jeuMock();
    const provider = new DryRunEstaleEcritureProvider();
    const rapport = await injecterPatrimoine(provider, CONDO, jeu);

    // Le mock n'a ni occupant ni adresse -> avertissements attendus.
    const codes = rapport.avertissements.map((a) => a.code);
    expect(codes).toContain("MAP_OWNER_RESIDENT_INCONNU");
    expect(codes).toContain("MAP_OWNER_ADRESSE_INCOMPLETE");
  });

  it("prepare le rollback (IDs crees, ordre inverse) sans l'executer", async () => {
    const jeu = await jeuMock();
    const provider = new DryRunEstaleEcritureProvider();
    const rapport = await injecterPatrimoine(provider, CONDO, jeu);

    // 3 lots + 1 cle + 3 owners = 7 entites a defaire.
    expect(rapport.rollback).toHaveLength(7);
    // Ordre inverse : owners d'abord (dernier cree), lots en dernier.
    expect(rapport.rollback[0]!.type).toBe("owner");
    expect(rapport.rollback[rapport.rollback.length - 1]!.type).toBe("lot");
  });

  it("multi-owners sur un meme lot : representative sur le 1er, parts a egalite", async () => {
    // Deux owners sur le lot 1 -> un seul upsertOwner avec 2 entrees.
    const provider = new DryRunEstaleEcritureProvider();
    const jeu: JeuDeDonnees = {
      lots: [{ numero: 1, type: "Appartement", usage: "residential", commentaire: "x" }],
      cles: [{ code: "001", libelle: "Charges", totalAttendu: 100 }],
      tantiemes: [{ cleCode: "001", lot: 1, valeur: 100 }],
      owners: [
        { id: "a", civilite: "m", nom: "A", pro: false },
        { id: "b", civilite: "mme", nom: "B", pro: false },
      ],
      attributions: [
        { ownerId: "a", lot: 1 },
        { ownerId: "b", lot: 1 },
      ],
    };
    const rapport = await injecterPatrimoine(provider, CONDO, jeu);
    expect(rapport.succes).toBe(true);

    const links = provider.journal.filter((e) => e.type === "relierOwnerAuLot");
    expect(links).toHaveLength(1);
    expect(links[0]!.data).toHaveLength(2);
    expect(links[0]!.data[0]!.representative).toBe(true);
    expect(links[0]!.data[1]!.representative).toBe(false);
    expect(links[0]!.data[0]!.share).toBe(50);
    expect(links[0]!.data[1]!.share).toBe(50);
    expect(rapport.compteurs.links).toBe(2);
    expect(rapport.avertissements.map((a) => a.code)).toContain("MAP_LINK_SHARE_EGALE");
  });

  it("capture l'erreur et n'echoue pas dur si une operation leve", async () => {
    const jeu = await jeuMock();
    // Provider qui casse a la creation d'owner.
    const provider = new DryRunEstaleEcritureProvider();
    const casse = Object.assign(Object.create(Object.getPrototypeOf(provider)), provider, {
      creerOwner: async () => {
        throw new Error("boom eStale owner");
      },
    });
    const rapport = await injecterPatrimoine(casse, CONDO, jeu);

    expect(rapport.succes).toBe(false);
    expect(rapport.erreur?.message).toMatch(/boom eStale owner/);
    // Lots + cles + tantiemes deja crees -> presents dans le rollback (4 entites : 3 lots + 1 cle).
    expect(rapport.rollback).toHaveLength(4);
    expect(rapport.compteurs.owners).toBe(0);
    expect(rapport.compteurs.links).toBe(0);
  });

  it("l'erreur remontee pointe l'operation qui a REELLEMENT echoue (pas la derniere reussie)", async () => {
    const jeu = await jeuMock();
    // Provider qui casse a la creation de la 1re cle (pas d'owner) : le bug corrige
    // attribuait a tort l'echec au dernier LOT cree (operation precedente reussie).
    const provider = new DryRunEstaleEcritureProvider();
    const casse = Object.assign(Object.create(Object.getPrototypeOf(provider)), provider, {
      creerCle: async () => {
        throw new Error("boom eStale cle");
      },
    });
    const rapport = await injecterPatrimoine(casse, CONDO, jeu);

    expect(rapport.succes).toBe(false);
    expect(rapport.erreur?.operation).toBe("createDK");
    expect(rapport.erreur?.cibleDomaine).toMatch(/^cle /);
    expect(rapport.erreur?.message).toMatch(/boom eStale cle/);
    // Les 3 lots sont bien dans le rollback (crees avant l'echec), aucune cle.
    expect(rapport.rollback).toHaveLength(3);
    expect(rapport.compteurs.cles).toBe(0);
  });

  it("reutilise la cle DEFAUT (mainDKID) au lieu de la recreer via createDK", async () => {
    const provider = new DryRunEstaleEcritureProvider();
    const jeu: JeuDeDonnees = {
      lots: [{ numero: 1, type: "Appartement", usage: "residential", commentaire: "x" }],
      cles: [{ code: "001", libelle: "Charges generales", totalAttendu: 100, defaut: true }],
      tantiemes: [{ cleCode: "001", lot: 1, valeur: 100 }],
      owners: [{ id: "a", civilite: "m", nom: "A", pro: false }],
      attributions: [{ ownerId: "a", lot: 1 }],
    };
    const rapport = await injecterPatrimoine(provider, CONDO, jeu, undefined, "dk#defaut-42");

    expect(rapport.succes).toBe(true);
    // Aucun appel createDK reel : le journal dry-run ne doit pas contenir de creerCle.
    expect(provider.journal.filter((e) => e.type === "creerCle")).toHaveLength(0);
    // La cle auto-creee par eStale porte un tantieme place-holder : on la met a jour avec
    // le vrai total EDD via updateDK.update, plutot que de la laisser telle quelle.
    const maj = provider.journal.filter((e) => e.type === "mettreAJourCle");
    expect(maj).toHaveLength(1);
    expect(maj[0]!.dkID).toBe("dk#defaut-42");
    expect(maj[0]!.input.tantieme).toBe(100);
    // La cle "001" est cablee sur le mainDKID fourni, pas sur un ID fabrique par creerCle.
    expect(rapport.ids.cleParCode["001"]).toBe("dk#defaut-42");
    // Le tantieme est bien pose sur ce meme dkID.
    const tantiemes = provider.journal.filter((e) => e.type === "poserTantieme");
    expect(tantiemes).toHaveLength(1);
    expect(tantiemes[0]!.dkID).toBe("dk#defaut-42");
    expect(rapport.compteurs.cles).toBe(1);
  });

  it("reutilise aussi la cle DEFAUT par repli sur le code 001 (sans flag 'defaut' explicite)", async () => {
    // Cas d'un jeu extrait AVANT l'ajout du flag "defaut" au prompt (deja persiste) : le
    // code "001" (convention cabinet = charges generales) doit suffire.
    const provider = new DryRunEstaleEcritureProvider();
    const jeu: JeuDeDonnees = {
      lots: [{ numero: 1, type: "Appartement", usage: "residential", commentaire: "x" }],
      cles: [{ code: "001", libelle: "Charges generales", totalAttendu: 100 }], // pas de "defaut"
      tantiemes: [{ cleCode: "001", lot: 1, valeur: 100 }],
      owners: [{ id: "a", civilite: "m", nom: "A", pro: false }],
      attributions: [{ ownerId: "a", lot: 1 }],
    };
    const rapport = await injecterPatrimoine(provider, CONDO, jeu, undefined, "dk#defaut-42");

    expect(rapport.succes).toBe(true);
    expect(provider.journal.filter((e) => e.type === "creerCle")).toHaveLength(0);
    expect(rapport.ids.cleParCode["001"]).toBe("dk#defaut-42");
  });

  it("tronque le libelle d'une cle a 80 caracteres (limite eStale) et reporte le reste en commentaire", async () => {
    // Incident reel : eStale plante (message generique) si DKInput.name depasse 80 car.
    const provider = new DryRunEstaleEcritureProvider();
    const libelleLong =
      "Chauffage / eau chaude-froide - frais communs repartis aux tantiemes, sans lot 1 (colonne 8)"; // 94 car
    const jeu: JeuDeDonnees = {
      lots: [{ numero: 1, type: "Appartement", usage: "residential", commentaire: "x" }],
      cles: [{ code: "701", libelle: libelleLong, totalAttendu: 100 }],
      tantiemes: [{ cleCode: "701", lot: 1, valeur: 100 }],
      owners: [{ id: "a", civilite: "m", nom: "A", pro: false }],
      attributions: [{ ownerId: "a", lot: 1 }],
    };
    const rapport = await injecterPatrimoine(provider, CONDO, jeu);

    expect(rapport.succes).toBe(true);
    const creerCle = provider.journal.find((e) => e.type === "creerCle");
    expect(creerCle?.input.name.length).toBeLessThanOrEqual(80);
    expect(creerCle?.input.name).toBe(libelleLong.slice(0, 80));
    expect(creerCle?.input.comment).toBe(libelleLong.slice(80).trim());
    expect(rapport.avertissements.map((a) => a.code)).toContain("MAP_CLE_NOM_TRONQUE");
  });

  it("une personne morale sans representant legal recoit 'SERVICE SYNDIC' par defaut", async () => {
    // Incident reel : eStale refuse de creer une societe sans representant legal (firstname).
    const provider = new DryRunEstaleEcritureProvider();
    const jeu: JeuDeDonnees = {
      lots: [{ numero: 1, type: "Appartement", usage: "residential", commentaire: "x" }],
      cles: [{ code: "001", libelle: "Charges generales", totalAttendu: 100, defaut: true }],
      tantiemes: [{ cleCode: "001", lot: 1, valeur: 100 }],
      owners: [{ id: "a", civilite: "m", nom: "IMMOBILIERE 3F", pro: true, raisonSociale: "IMMOBILIERE 3F", formeJuridique: "SA" }],
      attributions: [{ ownerId: "a", lot: 1 }],
    };
    const rapport = await injecterPatrimoine(provider, CONDO, jeu, undefined, "dk#defaut-42");

    expect(rapport.succes).toBe(true);
    const owner = provider.journal.find((e) => e.type === "creerOwner");
    expect(owner?.owner.firstname).toBe("SERVICE SYNDIC");
    expect(rapport.avertissements.map((a) => a.code)).toContain("MAP_OWNER_REPRESENTANT_DEFAUT");
  });

  it("decoupe le numero de voie : le numero pur va en housenumber, le suffixe (BIS/TER) rejoint la voie", async () => {
    // eStale limite housenumber a 5 car (constate via l'UI, "176 BIS" -> "176 B" tronque) :
    // on isole le numero ("176") et on reporte "BIS" en tete de la voie, sans rien perdre.
    const provider = new DryRunEstaleEcritureProvider();
    const jeu: JeuDeDonnees = {
      lots: [{ numero: 1, type: "Appartement", usage: "residential", commentaire: "x" }],
      cles: [{ code: "001", libelle: "Charges generales", totalAttendu: 100, defaut: true }],
      tantiemes: [{ cleCode: "001", lot: 1, valeur: 100 }],
      owners: [{ id: "a", civilite: "m", nom: "A", pro: false, adrNum: "176 BIS", adrVoie: "RUE GALLIENI" }],
      attributions: [{ ownerId: "a", lot: 1 }],
    };
    const rapport = await injecterPatrimoine(provider, CONDO, jeu, undefined, "dk#defaut-42");

    expect(rapport.succes).toBe(true);
    const owner = provider.journal.find((e) => e.type === "creerOwner");
    expect(owner?.address.housenumber).toBe("176");
    expect(owner?.address.street).toBe("BIS RUE GALLIENI");
    expect(rapport.avertissements.map((a) => a.code)).not.toContain("MAP_OWNER_NUM_TRONQUE");
  });

  it("garde un numero COMPOSE ('64-66', plage d'adresse) entier - ne le scinde PAS en pseudo-suffixe", async () => {
    // Incident reel : "-66" bascule a tort dans la voie ("BOULEVARD...") et l'a fait
    // depasser sa limite de longueur cote eStale (extensions.field="street", code="lte").
    const provider = new DryRunEstaleEcritureProvider();
    const jeu: JeuDeDonnees = {
      lots: [{ numero: 1, type: "Appartement", usage: "residential", commentaire: "x" }],
      cles: [{ code: "001", libelle: "Charges generales", totalAttendu: 100, defaut: true }],
      tantiemes: [{ cleCode: "001", lot: 1, valeur: 100 }],
      owners: [{ id: "a", civilite: "m", nom: "A", pro: false, adrNum: "64-66", adrVoie: "BOULEVARD DE LA MISSION MARCHAND" }],
      attributions: [{ ownerId: "a", lot: 1 }],
    };
    const rapport = await injecterPatrimoine(provider, CONDO, jeu, undefined, "dk#defaut-42");

    expect(rapport.succes).toBe(true);
    const owner = provider.journal.find((e) => e.type === "creerOwner");
    expect(owner?.address.housenumber).toBe("64-66");
    expect(owner?.address.street).toBe("BOULEVARD DE LA MISSION MARCHAND");
  });

  it("tronque quand meme si le numero pur (sans suffixe) depasse 5 caracteres (garde-fou de secours)", async () => {
    const provider = new DryRunEstaleEcritureProvider();
    const jeu: JeuDeDonnees = {
      lots: [{ numero: 1, type: "Appartement", usage: "residential", commentaire: "x" }],
      cles: [{ code: "001", libelle: "Charges generales", totalAttendu: 100, defaut: true }],
      tantiemes: [{ cleCode: "001", lot: 1, valeur: 100 }],
      owners: [{ id: "a", civilite: "m", nom: "A", pro: false, adrNum: "123456", adrVoie: "RUE X" }],
      attributions: [{ ownerId: "a", lot: 1 }],
    };
    const rapport = await injecterPatrimoine(provider, CONDO, jeu, undefined, "dk#defaut-42");

    const owner = provider.journal.find((e) => e.type === "creerOwner");
    expect(owner?.address.housenumber).toBe("12345");
    expect(rapport.avertissements.map((a) => a.code)).toContain("MAP_OWNER_NUM_TRONQUE");
  });
});
