// Tests de LA BATTERIE des 11 auto-checks comptables (S0303). Deux exigences :
//   1. un cas NOMINAL entierement vert, construit par le VRAI pipeline (GL -> plan ->
//      construireEntries -> generation xlsx -> RELECTURE -> batterie) : c'est le dry-run
//      de bout en bout du volet compta au niveau domaine/adapters ;
//   2. CHAQUE check a au moins un cas qui le fait ECHOUER (le filet doit prouver qu'il
//      attrape - en particulier le n.6, seul a voir un mapping faux mais bijectif).
// Donnees synthetiques.
import { describe, expect, it } from "vitest";
import type { ControleCompte, LigneEcriture } from "../ecriture";
import { resoudreComptes, type ContexteEstale } from "../mapping-compta";
import { construireEntries } from "../entries";
import { detecterPairesRepartition } from "../omission-paires";
import { raccorderExercices } from "../controle-comptes";
import type { LigneRgd } from "../rgd";
import { executerBatterieCompta, type BatterieCompta, type DonneesBatterie } from "../auto-checks-compta";
import { genererEntriesBuffer, parserEntries } from "@/lib/reprise/adapters/xlsx/entries-xlsx";

// --- Scenario nominal synthetique --------------------------------------------------
// 2 coproprietaires, 1 fournisseur, 1 banque, 1 charge classe 6 avec RGD, 1 produit 701
// (route eclatement). Equilibre : reports 450 (D 100 + D 50) contre report banque (C 150) ;
// mouvements equilibres.
const CTX: ContexteEstale = {
  fournisseurs: [{ nomenclature: "4010001", intitule: "ACME NETTOYAGE" }],
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

const LIGNES: LigneEcriture[] = [
  l("4501.100", "2025-02-01", 250, "debit", "Appel T1 Martin"),
  l("4501.200", "2025-02-01", 130, "debit", "Appel T1 Novak"),
  l("7010000", "2025-02-01", 380, "credit", "Appels T1"),
  l("6060000", "2025-03-05", 120, "debit", "Electricite"),
  l("4010.111", "2025-03-05", 120, "credit", "Facture electricite"),
];
const CONTROLES: ControleCompte[] = [
  { compte: "4501.100", reportDebit: 100 },
  { compte: "4501.200", reportDebit: 50 },
  { compte: "5120.000", reportCredit: 150 },
];
const RGD: LigneRgd[] = [{ date: "2025-03-05", compte: "6060000", ttc: 120, tva: 20, deductible: 20 }];

function planNominal() {
  return resoudreComptes(
    [
      { compte: "4501.100", intitule: "MARTIN PAUL" },
      { compte: "4501.200", intitule: "NOVAK ELENA" },
      { compte: "4010.111", intitule: "ACME NETTOYAGE" },
      { compte: "5120.000" },
      { compte: "6060000" },
      { compte: "7010000" },
    ],
    CTX,
  );
}

/** Le pipeline REEL : construction -> generation xlsx -> RELECTURE -> batterie. */
async function batterieNominale(mutation?: (d: DonneesBatterie) => void): Promise<BatterieCompta> {
  const plan = planNominal();
  const r = construireEntries(LIGNES, CONTROLES, plan, { dateOuverture: "2025-01-01", rgd: RGD });
  expect(r.ok).toBe(true);
  const relu = await parserEntries(await genererEntriesBuffer(r.lignes));
  expect(relu.ok).toBe(true);
  const d: DonneesBatterie = {
    nonReconnues: [{ source: "grand livre 2025.pdf", nb: 0 }],
    gl: { lignes: LIGNES, controles: CONTROLES },
    omission: detecterPairesRepartition(LIGNES, CONTROLES),
    plan,
    entriesRelues: relu.lignes,
    rgd: RGD,
  };
  mutation?.(d);
  return executerBatterieCompta(d);
}

function statutDe(b: BatterieCompta, code: string) {
  return b.checks.find((c) => c.code === code)!;
}

describe("batterie nominale (pipeline reel, fichier relu)", () => {
  it("est verte sur les 11 checks (le raccord N-1/N reste non_execute sans second GL)", async () => {
    const b = await batterieNominale();
    expect(b.nbEchecs).toBe(0);
    expect(b.ok).toBe(true);
    expect(statutDe(b, "RACCORD_EXERCICES").statut).toBe("non_execute");
    expect(b.checks).toHaveLength(11);
    // Le detail de la ventilation par cle est explicite (artefact de verification).
    expect(statutDe(b, "VENTILATION_CLES").details[0]).toMatch(/cle/);
  });
});

describe("chaque check sait echouer", () => {
  it("1. NON_RECONNUES : une ligne ecartee sans explication = echec", async () => {
    const b = await batterieNominale((d) => {
      d.nonReconnues = [{ source: "grand livre 2025.pdf", nb: 3 }];
    });
    expect(statutDe(b, "NON_RECONNUES").statut).toBe("echec");
    expect(b.ok).toBe(false);
  });

  it("2. EQUILIBRE_GLOBAL : un GL desequilibre (reports inclus) = echec", async () => {
    const b = await batterieNominale((d) => {
      d.gl = { lignes: d.gl.lignes, controles: [...d.gl.controles, { compte: "5120.000", reportCredit: 10 }] };
    });
    expect(statutDe(b, "EQUILIBRE_GLOBAL").statut).toBe("echec");
  });

  it("3. RACCORD_EXERCICES : un ecart de raccord N-1/N = echec", async () => {
    const raccordement = raccorderExercices(
      { lignes: [l("4500001", "2024-06-01", 300, "debit")], controles: [] },
      { lignes: [], controles: [{ compte: "4500001", reportDebit: 250 }] },
    );
    const b = await batterieNominale((d) => {
      d.raccordement = raccordement;
    });
    expect(statutDe(b, "RACCORD_EXERCICES").statut).toBe("echec");
    expect(statutDe(b, "RACCORD_EXERCICES").details[0]).toMatch(/4500001/);
  });

  it("4. PAIRES_CLASSE_6 : un compte 6 dont report+cloture ne s'annulent pas = echec", async () => {
    const lignes = [l("6060000", "2025-06-15", 299, "credit")];
    const controles = [{ compte: "6060000", reportDebit: 300 }];
    const b = await batterieNominale((d) => {
      d.omission = detecterPairesRepartition(lignes, controles);
    });
    expect(statutDe(b, "PAIRES_CLASSE_6").statut).toBe("echec");
  });

  it("5. FORMAT_ENTRIES : date hors JJ/MM/AAAA, montant nul, TVA negative = echec", async () => {
    const b = await batterieNominale((d) => {
      d.entriesRelues = [
        ...d.entriesRelues,
        { date: "2025-01-01", libelle: "x", compte: "4500001", type: "debit", montantTTC: 0, tva: -5 },
      ];
    });
    const c = statutDe(b, "FORMAT_ENTRIES");
    expect(c.statut).toBe("echec");
    expect(c.details.some((x) => /JJ\/MM\/AAAA/.test(x))).toBe(true);
    expect(c.details.some((x) => /positif strict/.test(x))).toBe(true);
    expect(c.details.some((x) => /valeur ABSOLUE/.test(x))).toBe(true);
  });

  it("6. BALANCE_PAR_CIBLE : un mapping faux mais BIJECTIF (cibles permutees) - le seul filet qui le voit", async () => {
    const b = await batterieNominale((d) => {
      // Permute les cibles des deux coproprietaires DANS LE FICHIER (4500001 <-> 4500002) :
      // equilibre global intact, balance par classe intacte, total 45x intact.
      d.entriesRelues = d.entriesRelues.map((x) => ({
        ...x,
        compte: x.compte === "4500001" ? "4500002" : x.compte === "4500002" ? "4500001" : x.compte,
      }));
    });
    // L'equilibre global (check 2) et le volume restent verts : l'erreur est invisible ailleurs.
    expect(statutDe(b, "EQUILIBRE_GLOBAL").statut).toBe("ok");
    const c = statutDe(b, "BALANCE_PAR_CIBLE");
    expect(c.statut).toBe("echec");
    expect(c.details.some((x) => x.includes("4500001"))).toBe(true);
    expect(c.details.some((x) => x.includes("4500002"))).toBe(true);
  });

  it("7. ATTENTE_AGREGES : un agregat d'attente qui ne retombe pas sur la somme des sources = echec", async () => {
    const b = await batterieNominale((d) => {
      // Retire la ligne banque du fichier : le 4719999 ne porte plus la somme des sources.
      d.entriesRelues = d.entriesRelues.filter((x) => x.compte !== "4719999");
    });
    expect(statutDe(b, "ATTENTE_AGREGES").statut).toBe("echec");
    expect(statutDe(b, "ATTENTE_AGREGES").details[0]).toMatch(/4719999/);
  });

  it("8. TVA_VS_RGD : une TVA de fichier qui derive du RGD = echec ; RGD absent = non_execute", async () => {
    const b = await batterieNominale((d) => {
      d.entriesRelues = d.entriesRelues.map((x) => (x.tva !== undefined ? { ...x, tva: 19 } : x));
    });
    expect(statutDe(b, "TVA_VS_RGD").statut).toBe("echec");

    const sans = await batterieNominale((d) => {
      delete d.rgd;
    });
    expect(statutDe(sans, "TVA_VS_RGD").statut).toBe("non_execute");
  });

  it("9. APPARIEMENT_RGD : une ligne RGD orpheline hors 716 = echec ; les travaux GL restent legitimes", async () => {
    const b = await batterieNominale((d) => {
      d.rgd = [...d.rgd!, { date: "2025-04-01", compte: "6150000", ttc: 77 }];
    });
    expect(statutDe(b, "APPARIEMENT_RGD").statut).toBe("echec");
    expect(statutDe(b, "APPARIEMENT_RGD").details[0]).toMatch(/6150000/);

    // Une ecriture GL de travaux (671) sans RGD est un residu ATTENDU, pas un echec.
    const travaux = await batterieNominale((d) => {
      d.gl = { lignes: [...d.gl.lignes, l("6710000", "2025-05-01", 900, "debit")], controles: d.gl.controles };
    });
    expect(statutDe(travaux, "APPARIEMENT_RGD").statut).toBe("ok");
  });

  it("10. VENTILATION_CLES : une ligne de classe 6 sans cle = echec", async () => {
    const b = await batterieNominale((d) => {
      d.entriesRelues = d.entriesRelues.map((x) => {
        if (!x.compte.startsWith("6")) return x;
        const sans = { ...x };
        delete sans.cle;
        return sans;
      });
    });
    expect(statutDe(b, "VENTILATION_CLES").statut).toBe("echec");
  });

  it("11. VOLUME : un fichier vide = echec (jamais un succes), 10 000 lignes aussi", async () => {
    const vide = await batterieNominale((d) => {
      d.entriesRelues = [];
    });
    expect(statutDe(vide, "VOLUME").statut).toBe("echec");

    const trop = await batterieNominale((d) => {
      const modele = d.entriesRelues[0]!;
      d.entriesRelues = Array.from({ length: 10_000 }, () => ({ ...modele }));
    });
    expect(statutDe(trop, "VOLUME").statut).toBe("echec");
  });
});
