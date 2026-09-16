import { describe, expect, it } from "vitest";
import { adressePourContrat, coproContratDepuisProposition, cycleOffre, lieuxAgAgence, obstaclesOffre, texteMailOffre } from "./offre";
import type { Proposition } from "./proposition";

const base: Proposition = {
  id: "p1",
  statut: "en_cours",
  agence: "LGC",
  immeuble: { adresse: "16 rue Sébastopol", codePostal: "92400", commune: "Courbevoie", immatriculation: "AB0175828", lotsPrincipaux: 8, lotsStationnement: 4, finMandatActuelISO: "2026-12-31", prochaineAgISO: "2026-11-20" },
  contact: { nom: "Mme BOURCHTOFF", email: "l@x.fr" },
  prix: { honorairesTtc: 4944, grilleTtc: 4515, gesteCommercialTtc: -429, timbresTtc: 173.6, fraisPostauxReels: true },
  journal: [],
  creeParNom: "test",
  creeLeISO: "2026-09-16",
  majLeISO: "2026-09-16",
};

describe("cycleOffre", () => {
  it("part du lendemain de la fin du mandat en place, un an", () => {
    expect(cycleOffre(base, {}, "2026-09-16")).toEqual({
      dateAgISO: "2026-11-20",
      debutISO: "2027-01-01",
      finISO: "2027-12-31",
      honorairesGestionTtc: 4944,
      forfaitPostauxTtc: 0,
      fraisPostauxReels: true,
    });
  });
  it("sans mandat connu, part de l'AG ; duree et AG imposables", () => {
    const p = { ...base, immeuble: { ...base.immeuble, finMandatActuelISO: undefined } };
    expect(cycleOffre(p, { dateAgISO: "2026-10-05", dureeMois: 24 }, "2026-09-16")).toMatchObject({ dateAgISO: "2026-10-05", debutISO: "2026-10-05", finISO: "2028-10-04" });
  });
  it("un mandat deja echu ne repousse pas le debut", () => {
    const p = { ...base, immeuble: { ...base.immeuble, finMandatActuelISO: "2025-06-30" } };
    expect(cycleOffre(p, {}, "2026-09-16").debutISO).toBe("2026-11-20");
  });
  it("forfait timbres quand les frais ne sont pas au reel", () => {
    const p = { ...base, prix: { ...base.prix, fraisPostauxReels: false } };
    expect(cycleOffre(p, {}, "2026-09-16")).toMatchObject({ forfaitPostauxTtc: 173.6, fraisPostauxReels: false });
  });
});

describe("contrat prospect", () => {
  it("remplit le gabarit avec l'immeuble et les inclusions par defaut", () => {
    const c = coproContratDepuisProposition(base);
    expect(c).toMatchObject({ adresse1: "16 rue Sébastopol", codePostal: "92400", ville: "Courbevoie", immatriculation: "AB0175828", agence: "LGC", lotsPrincipaux: 8, lotsAutres: 4, nbVisites: 1, dureeAgHeures: 2, nbCs: 1, dureeCsHeures: 1, finMaxAgHeure: 20, assurance: "" });
    expect(coproContratDepuisProposition({ ...base, immeuble: { ...base.immeuble, assurance: "AXA", assuranceDateISO: "2024-01-01" } })).toMatchObject({ assurance: "AXA", assuranceDateISO: "2024-01-01" });
  });
  it("retire le suffixe de commune ou d'agence de l'adresse", () => {
    expect(adressePourContrat("16, rue Sébastopol - Courbevoie", "Courbevoie")).toBe("16, rue Sébastopol");
    expect(adressePourContrat("62, rue Jean Bonal - LGC", "La Garenne-Colombes")).toBe("62, rue Jean Bonal");
    expect(adressePourContrat("24, rue de Champagne - Asnières", "Asnières-sur-Seine")).toBe("24, rue de Champagne");
    expect(adressePourContrat("2 avenue Rhin-et-Danube", "Courbevoie")).toBe("2 avenue Rhin-et-Danube");
  });
  it("dit ce qui manque", () => {
    expect(obstaclesOffre(base)).toEqual([]);
    expect(obstaclesOffre({ ...base, prix: {}, immeuble: { adresse: "x" }, contact: {} })).toEqual(["le nombre de lots principaux", "les honoraires retenus (enregistrer le prix)", "un moyen de joindre le contact"]);
  });
});

describe("texteMailOffre", () => {
  const cycle = cycleOffre(base, {}, "2026-09-16");
  const mail = texteMailOffre(base, cycle, { nom: "Emmanuel LOPES" });
  it("civilite, montant, lieu d'AG de l'agence, frais reels, signature", () => {
    expect(mail).toContain("Bonjour Madame,");
    // toLocaleString separe les milliers d'une espace fine insecable.
    expect(mail).toMatch(/Gestion courante : 4.944,00 € TTC par an pour 8 lots principaux \(contrat du 01\/01\/2027 au 31\/12\/2027\)\./);
    expect(mail).toContain("13 rond-point du Souvenir Français ou 38 rue Jules Ferry");
    expect(mail).toContain("refacturés au réel");
    expect(mail).toContain("Emmanuel LOPES\nREAL 31 Immobilier");
  });
  it("forfait timbres quand il y en a un, Monsieur pour M.", () => {
    const p = { ...base, contact: { nom: "M. DUPONT" }, prix: { ...base.prix, fraisPostauxReels: false } };
    const m = texteMailOffre(p, cycleOffre(p, {}, "2026-09-16"), { nom: "X" });
    expect(m).toContain("Bonjour Monsieur,");
    expect(m).toContain("Forfait frais postaux : 173,60 € TTC par an");
  });
  it("lieux d'AG : LGC a deux adresses, ASN aucune", () => {
    expect(lieuxAgAgence("LGC")).toHaveLength(2);
    expect(lieuxAgAgence("ASN")).toEqual([]);
  });
});
