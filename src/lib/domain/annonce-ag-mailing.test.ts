import { describe, expect, it } from "vitest";
import {
  choisirModeleAnnonce,
  dateLimiteDemandes,
  dateLongue,
  heureCourte,
  lieuAnnonce,
  refusAnnonce,
  refusGardeMailing,
  rendreAnnonceAg,
  signataire,
  type DonneesAnnonce,
} from "./annonce-ag-mailing";

const LGC = "13 rond-point du Souvenir Français, 92250 La Garenne-Colombes";

const base: DonneesAnnonce = {
  modele: "presentiel",
  agDateISO: "2026-12-10",
  heure: "18:30",
  lieu: { adresse: LGC, exterieur: false },
  gestionnaire: { nomComplet: "Sekou Koma" },
};

describe("garde d'activation", () => {
  it("refuse toute copro tant que ESTALE_MAILING_ACTIF n'est pas à 1", () => {
    expect(refusGardeMailing("S104", undefined)).toMatch(/pas encore activé/);
    expect(refusGardeMailing("S104", "true")).toMatch(/pas encore activé/);
    expect(refusGardeMailing("S104", "1")).toBeNull();
  });
  it("laisse toujours passer la copro de test SE999, quelle que soit l'écriture", () => {
    expect(refusGardeMailing("SE999", undefined)).toBeNull();
    expect(refusGardeMailing(" se0999 ", undefined)).toBeNull();
  });
});

describe("choix du modèle", () => {
  it("le mode posé sur la date prime sur AG CONNECT", () => {
    expect(choisirModeleAnnonce({ modeReunion: "presentiel", agConnect: true }).modele).toBe("presentiel");
    expect(choisirModeleAnnonce({ modeReunion: "hybride", agConnect: false }).modele).toBe("hybride");
    expect(choisirModeleAnnonce({ modeReunion: "visio" }).modele).toBe("hybride");
  });
  it("sans mode, AG CONNECT décide", () => {
    expect(choisirModeleAnnonce({ agConnect: true }).modele).toBe("hybride");
    expect(choisirModeleAnnonce({}).modele).toBe("presentiel");
  });
});

describe("date limite", () => {
  it("AG moins 45 jours (barème ODJ_CS), mois et année traversés", () => {
    expect(dateLimiteDemandes("2026-12-10")).toBe("2026-10-26");
    expect(dateLimiteDemandes("2027-01-20")).toBe("2026-12-06");
  });
});

describe("lieu", () => {
  it("le lieu libre prime sur la salle", () => {
    expect(
      lieuAnnonce({ lieuLibre: " Salle municipale, 1 rue X ", salleEmail: "real31lgc@real31.fr", agenceCode: "ML" }),
    ).toEqual({ adresse: "Salle municipale, 1 rue X", exterieur: true });
  });
  it("sinon l'adresse de la salle réservée", () => {
    expect(lieuAnnonce({ salleEmail: "REAL31ML@real31.fr" })?.adresse).toMatch(/Maisons-Laffitte/);
    expect(lieuAnnonce({ salleEmail: "real31JF@real31.fr" })?.adresse).toMatch(/Jules Ferry/);
  });
  it("sinon l'agence de la copro, LGC compris, et null si on ne sait pas", () => {
    expect(lieuAnnonce({ agenceCode: "lgc" })).toEqual({ adresse: LGC, exterieur: false });
    expect(lieuAnnonce({ agenceCode: "HLS" })?.adresse).toMatch(/Houilles/);
    expect(lieuAnnonce({ agenceCode: "ASN" })).toBeNull();
    expect(lieuAnnonce({})).toBeNull();
  });
});

describe("formats", () => {
  it("dates et heures en toutes lettres", () => {
    expect(dateLongue("2026-12-10")).toBe("jeudi 10 décembre 2026");
    expect(dateLongue("2026-10-01")).toBe("jeudi 1er octobre 2026");
    expect(heureCourte("18:30")).toBe("18h30");
    expect(heureCourte("09:00")).toBe("9h");
  });
  it("Prénom NOM", () => {
    expect(signataire("Sekou Koma")).toBe("Sekou KOMA");
    expect(signataire("Anne-Laure de la Tour")).toBe("Anne-Laure DE LA TOUR");
  });
});

describe("rendu présentiel", () => {
  const r = rendreAnnonceAg(base);
  it("porte la date, l'heure, l'agence, la date limite et la dématérialisation", () => {
    expect(r.texte).toContain("se tiendra en présentiel le :\njeudi 10 décembre 2026 à 18h30");
    expect(r.texte).toContain(`En présentiel à l'agence REAL31 : ${LGC}.`);
    expect(r.texte).toContain("avant le lundi 26 octobre 2026.");
    expect(r.texte).toContain("réduits de 10 € par personne");
    expect(r.texte).toContain("supplément de 3 €");
    expect(r.texte.endsWith("Cordialement,\nSekou KOMA")).toBe(true);
    expect(r.texte).not.toContain("AG CONNECT");
    expect(r.dateLimiteISO).toBe("2026-10-26");
  });
  it("HTML : un paragraphe par ligne, texte échappé", () => {
    expect(r.html.startsWith("<p>Madame, Monsieur,</p><p><br></p>")).toBe(true);
    expect(r.html).toContain("l&#39;agence REAL31");
    expect(r.html).not.toMatch(/<script/);
  });
  it("lieu libre : pas d'« à l'agence REAL31 »", () => {
    const t = rendreAnnonceAg({ ...base, lieu: { adresse: "Loge, 4 rue Y", exterieur: true } }).texte;
    expect(t).toContain("En présentiel : Loge, 4 rue Y.");
    expect(t).not.toContain("à l'agence");
  });
  it("le modèle présentiel n'a pas de ligne directe", () => {
    const t = rendreAnnonceAg({ ...base, gestionnaire: { nomComplet: "Sekou Koma", ligneDirecte: "01 02" } }).texte;
    expect(t).not.toContain("Ligne directe");
  });
});

describe("rendu hybride", () => {
  const h: DonneesAnnonce = { ...base, modele: "hybride" };
  it("présentiel + visio AG CONNECT + date limite", () => {
    const t = rendreAnnonceAg(h).texte;
    expect(t).toContain("en présentiel et en visio :\nle jeudi 10 décembre 2026 à 18h30");
    expect(t).toContain(`En présentiel : à l'agence REAL 31, ${LGC}`);
    expect(t).toContain("En visio : via AG CONNECT.");
    expect(t).toContain("par écrit avant le lundi 26 octobre 2026.");
    expect(t).not.toContain("10 € par personne");
  });
  it("ligne directe si connue, omise sinon", () => {
    expect(rendreAnnonceAg({ ...h, gestionnaire: { nomComplet: "Sekou Koma", ligneDirecte: "01 47 84 31 31" } }).texte)
      .toMatch(/Sekou KOMA\nLigne directe : 01 47 84 31 31$/);
    expect(rendreAnnonceAg(h).texte).not.toContain("Ligne directe");
    expect(rendreAnnonceAg({ ...h, gestionnaire: { nomComplet: "Sekou Koma", ligneDirecte: "  " } }).texte)
      .not.toContain("Ligne directe");
  });
  it("lieu libre", () => {
    const t = rendreAnnonceAg({ ...h, lieu: { adresse: "Salle des fêtes", exterieur: true } }).texte;
    expect(t).toContain("En présentiel : Salle des fêtes\nEn visio");
  });
});

describe("préconditions", () => {
  const lieu = { adresse: LGC, exterieur: false };
  it("refuse sans date, sans heure, sans lieu", () => {
    expect(refusAnnonce({ heure: "18:00", lieu, aujourdhuiISO: "2026-10-12" })).toMatch(/Aucune date/);
    expect(refusAnnonce({ agDateISO: "2026-12-10", lieu, aujourdhuiISO: "2026-10-12" })).toMatch(/heure/);
    expect(refusAnnonce({ agDateISO: "2026-12-10", heure: "18:00", lieu: null, aujourdhuiISO: "2026-10-12" })).toMatch(/Lieu/);
  });
  it("refuse quand la date limite est passée, accepte sinon", () => {
    expect(refusAnnonce({ agDateISO: "2026-11-10", heure: "18:00", lieu, aujourdhuiISO: "2026-10-12" })).toMatch(/déjà passée/);
    expect(refusAnnonce({ agDateISO: "2026-12-10", heure: "18:00", lieu, aujourdhuiISO: "2026-10-12" })).toBeNull();
  });
});
