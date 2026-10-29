import { describe, expect, it } from "vitest";
import {
  chiffreATraiter,
  enRetard,
  joursOuvresEcoules,
  marqueLu,
  repartirChiffre,
  traitesAuChargement,
  travailDistribue,
  type StatutDistribue,
} from "./mes-emails-liste";
import { construireBoites, regrouperPartagees } from "./boites-mail";

describe("traitesAuChargement (REA-422 : plus d'onglet « Conclus »)", () => {
  const boites = [
    { id: "moi@real31.fr", personnelle: true },
    { id: "syndic4@real31.fr", personnelle: false },
  ];
  it("boîte partagée : « Marquer traité » sort le mail de « À traiter »", () => {
    const r = traitesAuChargement(
      [
        { id: "p1", boite: "syndic4@real31.fr", statutTraitement: "classe" },
        { id: "p2", boite: "syndic4@real31.fr", statutTraitement: "repondu" },
        { id: "p3", boite: "syndic4@real31.fr" },
      ],
      boites,
    );
    expect([...r]).toEqual(["p1"]);
  });
  it("boîte perso : Outlook fait foi, un mail encore en réception reste à traiter", () => {
    const r = traitesAuChargement(
      [
        { id: "m1", boite: "moi@real31.fr", statutTraitement: "classe" },
        { id: "m2", statutTraitement: "classe" },
      ],
      boites,
    );
    expect(r.size).toBe(0);
  });
});

describe("joursOuvresEcoules / enRetard : le rouge au-delà de 2 jours ouvrés", () => {
  // Mercredi 28/10/2026, 10 h à Paris.
  const mercredi = new Date("2026-10-28T09:00:00Z");
  it("le jour de réception ne compte pas, le week-end non plus", () => {
    expect(joursOuvresEcoules("2026-10-28T07:00:00Z", mercredi)).toBe(0);
    expect(joursOuvresEcoules("2026-10-26T07:00:00Z", mercredi)).toBe(2); // lundi
    expect(joursOuvresEcoules("2026-10-23T07:00:00Z", mercredi)).toBe(3); // vendredi
    expect(joursOuvresEcoules("2026-10-24T07:00:00Z", mercredi)).toBe(3); // samedi : lundi, mardi, mercredi
  });
  it("jour de Paris : reçu lundi à 23 h 30 (heure de Paris) compte comme lundi", () => {
    expect(joursOuvresEcoules("2026-10-26T22:30:00Z", mercredi)).toBe(2);
  });
  it("en retard : strictement plus de 2 jours ouvrés", () => {
    expect(enRetard("2026-10-26T07:00:00Z", mercredi)).toBe(false);
    expect(enRetard("2026-10-23T07:00:00Z", mercredi)).toBe(true);
    expect(enRetard(undefined, mercredi)).toBe(false);
  });
});

describe("chiffreATraiter : le chiffre unique de l'écran (décision 1, 29/10/2026)", () => {
  const boites = construireBoites("moi@real31.fr", "syndic2@real31.fr");
  const maintenant = new Date("2026-10-28T09:00:00Z");
  const liste = [
    { id: "perso", boite: "moi@real31.fr", date: "2026-10-28", recuLe: "2026-10-28T08:00:00Z" },
    { id: "a", boite: "syndic2@real31.fr", date: "2026-10-28", recuLe: "2026-10-28T08:00:00Z" },
    { id: "b", boite: "syndic2@real31.fr", date: "2026-10-22", recuLe: "2026-10-22T08:00:00Z" },
    { id: "c", boite: "syndic2@real31.fr", date: "2026-10-27", recuLe: "2026-10-27T08:00:00Z" },
    { id: "sans-boite", date: "2026-10-01" },
  ];
  it("la boîte de travail seulement, lus ou non ; la boîte perso ne compte pas", () => {
    expect(chiffreATraiter(liste, boites, new Set(), { maintenant })).toEqual({ principal: 3, enRetard: 1, aRepartir: 0 });
  });
  it("baisse dès qu'un mail sort (traité, Comptabilité, Pas pour moi…)", () => {
    expect(chiffreATraiter(liste, boites, new Set(["a", "b"]), { maintenant })).toEqual({ principal: 1, enRetard: 0, aRepartir: 0 });
  });
  it("les mails non chargés (au-delà du plafond de lecture) comptent, en retard", () => {
    expect(chiffreATraiter(liste, boites, new Set(), { maintenant, horsListe: { "syndic2@real31.fr": 5, "moi@real31.fr": 9 } })).toEqual({
      principal: 8,
      enRetard: 6,
      aRepartir: 0,
    });
  });
  it("par onglet", () => {
    expect(chiffreATraiter(liste, boites, new Set(), { maintenant, onglet: "moi@real31.fr" }).principal).toBe(0);
    expect(chiffreATraiter(liste, boites, new Set(), { maintenant, onglet: "syndic2@real31.fr" }).principal).toBe(3);
  });
  it("l'onglet Comptabilité d'un comptable regroupe ses boîtes", () => {
    const compta = regrouperPartagees(construireBoites("moi@real31.fr", "syndic2@real31.fr,syndic4@real31.fr"), "Comptabilité");
    const avecS4 = [...liste, { id: "f", boite: "syndic4@real31.fr", date: "2026-10-28" }];
    expect(chiffreATraiter(avecS4, compta, new Set(), { maintenant, onglet: "syndic2@real31.fr" }).principal).toBe(4);
  });
});

describe("travailDistribue : le chiffre sans plafond, depuis le journal et les statuts", () => {
  const statuts = new Map<string, StatutDistribue>([
    ["t1", { statut: "classe", marqueAt: "2026-10-28T08:00:00Z" }],
    ["t2", { statut: "classe", marqueAt: "2026-10-27T08:00:00Z" }],
    ["r", { statut: "repondu" }],
  ]);
  const statutDe = (id: string) => statuts.get(id) ?? null;
  it("à traiter = distribués moins traités (répondu reste à traiter) ; traités du jour comptés", () => {
    const ids = ["n1", "t1", "r", "t2", ...Array.from({ length: 100 }, (_, i) => `vieux${i}`)];
    const r = travailDistribue(ids, statutDe, "2026-10-28");
    expect(r.aTraiter).toHaveLength(102);
    expect(r.aTraiter.slice(0, 2)).toEqual(["n1", "r"]);
    expect(r.traitesAujourdhui).toBe(1);
  });
});

describe("repartirChiffre : le chiffre personnel (révision de Sekou du 29/10/2026)", () => {
  const entrees = [
    { etat: { attribueA: "moi" }, retard: true },
    { etat: { attribueA: "moi", horsChiffre: true }, retard: true },
    { etat: { attribueA: null }, retard: false },
    { retard: false },
    { etat: { attribueA: "binome" }, retard: true },
  ];
  it("provisoire (pas encore d'attribution) : le binôme, sans les mails en attente ou de côté", () => {
    expect(repartirChiffre(entrees, { type: "provisoire" })).toEqual({ principal: 4, enRetard: 2, aRepartir: 0 });
  });
  it("attribution : à moi en principal, non attribués à répartir, ceux d'un autre nulle part", () => {
    expect(repartirChiffre(entrees, { type: "attribution", moi: "moi" })).toEqual({ principal: 1, enRetard: 1, aRepartir: 2 });
  });
  it("le chiffre de l'écran suit le même mode", () => {
    const boites = construireBoites("moi@real31.fr", "syndic2@real31.fr");
    const l = [
      { id: "a", boite: "syndic2@real31.fr", date: "2026-10-28" },
      { id: "b", boite: "syndic2@real31.fr", date: "2026-10-28" },
    ];
    const r = chiffreATraiter(l, boites, new Set(), {
      maintenant: new Date("2026-10-28T09:00:00Z"),
      etatDe: (m) => ({ attribueA: m.id === "a" ? "moi" : null }),
      mode: { type: "attribution", moi: "moi" },
    });
    expect(r).toEqual({ principal: 1, enRetard: 0, aRepartir: 1 });
  });
});

describe("marqueLu : lu seulement quand on ouvre le mail (décision 2)", () => {
  it("clic ou réponse : oui ; affichage d'office : non ; déjà lu : rien à faire", () => {
    expect(marqueLu("clic", false)).toBe(true);
    expect(marqueLu("reponse", false)).toBe(true);
    expect(marqueLu("affichage", false)).toBe(false);
    expect(marqueLu("clic", true)).toBe(false);
  });
});
