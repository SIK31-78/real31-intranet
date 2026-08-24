// Tests du service produire-compta : le dry-run COMPLET du volet compta - GL extrait +
// plan resolu -> entries.xlsx genere PUIS RELU -> batterie des 11 checks -> fiche
// d'eclatements -> cibles de calage. Aucune ecriture, aucun reseau. Donnees synthetiques.
import { describe, expect, it } from "vitest";
import type { JeuEcritures, LigneEcriture } from "@/lib/reprise/domain/ecriture";
import { resoudreComptes, type ContexteEstale } from "@/lib/reprise/domain/mapping-compta";
import { parserEntries } from "@/lib/reprise/adapters/xlsx/entries-xlsx";
import { produireCompta } from "../produire-compta";

const CTX: ContexteEstale = {
  fournisseurs: [],
  coproprietaires: [
    { nomenclature: "4500001", intitule: "MARTIN PAUL" },
    { nomenclature: "4500002", intitule: "NOVAK ELENA" },
  ],
};

const l = (compte: string, date: string, montant: number, sens: "debit" | "credit", libelle = "Ecriture"): LigneEcriture => ({
  date,
  compte,
  libelle,
  sens,
  montant,
  classe: Number(compte[0]) as LigneEcriture["classe"],
});

/** GL synthetique equilibre : 450 x2, banque, 701 (eclatement), avec reports. */
function glNominal(): JeuEcritures {
  return {
    lignes: [
      l("4501.100", "2025-02-01", 250, "debit", "Appel Martin"),
      l("4501.200", "2025-02-01", 130, "debit", "Appel Novak"),
      l("7010000", "2025-02-01", 380, "credit", "Appels"),
      l("5120.000", "2025-03-01", 40, "debit", "Encaissement"),
      l("4501.100", "2025-03-01", 40, "credit", "Reglement Martin"),
    ],
    notes: [],
    controles: [
      { compte: "4501.100", reportDebit: 100 },
      { compte: "4501.200", reportDebit: 50 },
      { compte: "5120.000", reportCredit: 150 },
    ],
    intitules: { "4501.100": "MARTIN PAUL", "4501.200": "NOVAK ELENA" },
  };
}

function planNominal() {
  return resoudreComptes(
    [
      { compte: "4501.100", intitule: "MARTIN PAUL" },
      { compte: "4501.200", intitule: "NOVAK ELENA" },
      { compte: "5120.000" },
      { compte: "7010000" },
    ],
    CTX,
  );
}

describe("produireCompta (dry-run complet)", () => {
  it("produit le fichier, la batterie verte, la fiche d'eclatements et les cibles de calage", async () => {
    const r = await produireCompta(glNominal(), planNominal(), {
      dateOuverture: "2025-01-01",
      nonReconnues: [{ source: "gl.pdf", nb: 0 }],
    });

    expect(r.erreurs).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.batterie?.nbEchecs).toBe(0);
    expect(r.entriesXlsx).toBeDefined();

    // Le fichier genere est RELISIBLE et porte les memes lignes que celles jugees.
    const relu = await parserEntries(r.entriesXlsx!);
    expect(relu.ok).toBe(true);
    expect(relu.lignes).toEqual(r.lignesRelues);

    // CIBLES DE CALAGE (soldes signes par compte cible) :
    //   4500001 : report 100 + 250 - 40 = 310 ; 4500002 : 50 + 130 = 180 ;
    //   4719999 (banque agregee) : -150 + 40 = -110.
    expect(r.cibles).toEqual({ "4500001": 310, "4500002": 180, "4719999": -110 });

    // Fiche d'eclatements : le 701 (route bloc C), solde -380, sens credit.
    expect(r.fiche?.comptes.map((c) => c.compteSource)).toEqual(["7010000"]);
    expect(r.fiche?.comptes[0]).toMatchObject({ sens: "credit", montant: 380 });
    // La balance ne tombe a 0 qu'apres les classes 1 et 7 : le complement est explicite.
    expect(r.fiche?.totalSigne).toBe(-380);
    // cibles + eclatement = 0 (equilibre global du GL).
    const sommeCibles = Object.values(r.cibles).reduce((s, v) => s + v, 0);
    expect(Math.round((sommeCibles + r.fiche!.totalSigne) * 100) / 100).toBe(0);
  });

  it("OMISSION DES PAIRES appliquee de bout en bout (repartition N-1 comptabilisee dans ce GL)", async () => {
    // GL en cours : reports classe 6 + bloc de cloture au 15/06 qui les annule exactement.
    const gl: JeuEcritures = {
      lignes: [
        l("6060000", "2025-06-15", 300, "credit", "texte libre"),
        l("6060000", "2025-07-01", 80, "debit", "Charge nouvelle"),
        l("4501.100", "2025-07-01", 80, "credit", "Reglement"),
      ],
      notes: [],
      controles: [
        { compte: "6060000", reportDebit: 300 },
        { compte: "4501.100", reportDebit: 0 },
      ],
      intitules: { "4501.100": "MARTIN PAUL" },
    };
    const plan = resoudreComptes(
      [
        { compte: "6060000" },
        { compte: "4501.100", intitule: "MARTIN PAUL" },
      ],
      CTX,
    );
    const r = await produireCompta(gl, plan, { dateOuverture: "2025-01-01" });

    expect(r.omission.applicable).toBe(true);
    expect(r.omission.paires).toHaveLength(1);
    // Le bloc du 15/06 et le report 6060000 sont ABSENTS du fichier ; la charge reelle reste.
    expect(r.lignesRelues.some((x) => x.date === "15/06/2025")).toBe(false);
    expect(r.lignesRelues.some((x) => /Report a nouveau/.test(x.libelle) && x.compte === "6060000")).toBe(false);
    expect(r.lignesRelues.some((x) => x.libelle === "Charge nouvelle")).toBe(true);
    // Balance par cible : 6060000 ne porte plus que la charge nouvelle (+80).
    expect(r.cibles["6060000"]).toBe(80);
    expect(r.batterie?.checks.find((c) => c.code === "PAIRES_CLASSE_6")?.statut).toBe("ok");
  });

  it("REFUSE de produire quand le plan n'est pas pret (revue non tranchee)", async () => {
    const plan = resoudreComptes([{ compte: "4501.300", intitule: "MARTIN" }], CTX); // ambigu -> warning
    const r = await produireCompta({ lignes: [l("4501.300", "2025-02-01", 10, "debit")], notes: [] }, plan, {
      dateOuverture: "2025-01-01",
    });
    expect(r.ok).toBe(false);
    expect(r.entriesXlsx).toBeUndefined();
    expect(r.erreurs[0]).toMatch(/non pret/);
  });

  it("un echec de batterie rend ok=false MEME si le fichier a pu etre genere", async () => {
    // Volume : GL vide -> 0 ligne produite -> check 11 en echec.
    const plan = resoudreComptes([], CTX);
    const r = await produireCompta({ lignes: [], notes: [] }, plan, {});
    expect(r.ok).toBe(false);
    expect(r.erreurs.some((e) => /VOLUME/.test(e))).toBe(true);
  });
});
