import { describe, expect, it } from "vitest";
import {
  choisirDossierBpo,
  dossierAgenceBpo,
  dossierDuMois,
  jourDeParis,
  jourDuDossier,
  moisALire,
  nomFichierBpo,
  sousDossierParDefaut,
  type DossierDate,
} from "./depot-bpo";

// Le dépôt des factures Crypto pour BPO (règles de Sekou du 19/10/2026).

const d = (nom: string, annee: number, mois: number): DossierDate | null => {
  const jour = jourDuDossier(nom, annee, mois);
  return jour ? { nom, chemin: ["Compta", "LGC", String(annee), `${mois}`, nom], jour } : null;
};
const novembre = ["02-11", "04-11", "06-11", "09-11", "30-11"].map((n) => d(n, 2026, 11)!);

describe("choisirDossierBpo : le dossier du jour, sinon le prochain, jamais un passé", () => {
  it("le dossier du jour quand il existe", () => {
    expect(choisirDossierBpo(novembre, { annee: 2026, mois: 11, jour: 4 })?.nom).toBe("04-11");
  });
  it("sinon le prochain dossier daté (un jour sur deux)", () => {
    expect(choisirDossierBpo(novembre, { annee: 2026, mois: 11, jour: 5 })?.nom).toBe("06-11");
    expect(choisirDossierBpo(novembre, { annee: 2026, mois: 11, jour: 7 })?.nom).toBe("09-11");
  });
  it("jamais un dossier passé : rien à venir, rien de choisi", () => {
    expect(choisirDossierBpo(novembre.slice(0, 3), { annee: 2026, mois: 11, jour: 10 })).toBeNull();
  });
  it("passe au mois suivant, et à l'année suivante", () => {
    const decembre = [d("02-12", 2026, 12)!];
    expect(choisirDossierBpo([...novembre.slice(0, 4), ...decembre], { annee: 2026, mois: 11, jour: 28 })?.nom).toBe("02-12");
    const janvier = [d("04-01", 2027, 1)!];
    expect(choisirDossierBpo([d("30-12", 2026, 12)!, ...janvier], { annee: 2026, mois: 12, jour: 31 })?.nom).toBe("04-01");
  });
  it("jamais un dossier collecté « BPO OK », même daté du jour", () => {
    expect(jourDuDossier("04-11 BPO OK le 05-11", 2026, 11)).toBeNull();
    const collecte: DossierDate = { nom: "04-11 BPO OK le 05-11", chemin: [], jour: { annee: 2026, mois: 11, jour: 4 } };
    expect(choisirDossierBpo([collecte, d("06-11", 2026, 11)!], { annee: 2026, mois: 11, jour: 4 })?.nom).toBe("06-11");
  });
});

describe("lecture des noms de dossiers", () => {
  it("un dossier daté n'a que la forme JJ-MM du mois où il est rangé", () => {
    expect(jourDuDossier("02-11", 2026, 11)).toEqual({ annee: 2026, mois: 11, jour: 2 });
    expect(jourDuDossier(" 02-11 ", 2026, 11)).toEqual({ annee: 2026, mois: 11, jour: 2 });
    expect(jourDuDossier("02-12", 2026, 11)).toBeNull();
    expect(jourDuDossier("02-11 bis", 2026, 11)).toBeNull();
    expect(jourDuDossier("facture.pdf", 2026, 11)).toBeNull();
  });
  it("le dossier du mois par son numéro, accent ou pas", () => {
    const noms = ["01-janvier", "08-aout", "11-novembre", "12-décembre", "2026 - Raccourci.lnk"];
    expect(dossierDuMois(noms, 8)).toBe("08-aout");
    expect(dossierDuMois(noms, 12)).toBe("12-décembre");
    expect(dossierDuMois(noms, 3)).toBeNull();
  });
  it("les mois à lire : le courant et le suivant, année comprise", () => {
    expect(moisALire({ annee: 2026, mois: 12, jour: 30 })).toEqual([
      { annee: 2026, mois: 12 },
      { annee: 2027, mois: 1 },
    ]);
  });
  it("le jour de Paris, pas celui d'UTC", () => {
    expect(jourDeParis(new Date("2026-11-02T23:30:00Z"))).toEqual({ annee: 2026, mois: 11, jour: 3 });
  });
});

describe("agence, initiales, nom de fichier", () => {
  it("HLS passe par LGC ; une agence sans dépôt connu n'en a pas", () => {
    expect(dossierAgenceBpo("hls")).toBe("LGC");
    expect(dossierAgenceBpo("LGC")).toBe("LGC");
    expect(dossierAgenceBpo("ML")).toBe("ML");
    expect(dossierAgenceBpo("ASN")).toBeNull();
    expect(dossierAgenceBpo(undefined)).toBeNull();
  });
  it("le sous-dossier des initiales s'il existe, jamais créé", () => {
    expect(sousDossierParDefaut(["CB", "MA", "NP"], "ma")).toBe("MA");
    expect(sousDossierParDefaut(["CB", "NP"], "MA")).toBeNull();
    expect(sousDossierParDefaut(["CB"], "")).toBeNull();
  });
  it("nettoie le nom de fichier", () => {
    expect(nomFichierBpo('Facture: n°12/2026 "EDF".pdf')).toBe("Facture n°12 2026 EDF .pdf");
    expect(nomFichierBpo("...")).toBe("piece-jointe");
  });
});
