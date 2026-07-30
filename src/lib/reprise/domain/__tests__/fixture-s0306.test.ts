// VERROU de la fixture S0306 (etape 0 du chantier extraction, etude §5).
//
// La fixture (data/samples/S0306/, commitee) est l'etage anonymise du jeu PROUVE par la
// reprise manuelle (bouclage arithmetique + PV + registre). Ce test la fige : si un
// re-export, une retouche a la main ou une re-anonymisation casse un invariant ou une
// propriete de test, on le sait ICI, pas dans six mois quand plus personne n'a les PDF.
//
// Il verrouille aussi la NON-REIDENTIFICATION : l'incident du 2026-07-30 (les
// owner_ref_temp porteaient les VRAIS patronymes, formant une table de re-identification
// complete) ne doit pas pouvoir se reproduire silencieusement. On ne peut pas tester
// "aucun vrai nom" (les citer ici les publierait) ; on teste l'invariant structurel qui
// rend la fuite impossible : chaque ref DERIVE du pseudonyme de sa propre ligne.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const BASE = join(process.cwd(), "data", "samples", "S0306");
const lire = <T>(f: string): T => JSON.parse(readFileSync(join(BASE, f), "utf8")) as T;

type OwnerFixture = {
  owner_ref_temp: string;
  nom: string;
  prenom?: string;
  civilite: string;
  adr_ville?: string;
  raison_sociale?: string;
};
const owners = lire<{ owners: OwnerFixture[] }>("owners.json").owners;
const lots = lire<{ lots: { numero_lot: number }[] }>("lots.json").lots;
const cles = lire<{
  cles: { code: string; total_annonce: number; tantiemes: { numero_lot: number; tantieme: number }[] }[];
}>("cles.json").cles;
const attributions = lire<{ attributions: { owner_ref_temp: string; numero_lot: number }[] }>(
  "attributions.json",
).attributions;
const liens450 = lire<{ liens: { owner_ref_temp: string }[] }>("owners_comptes450.json").liens;
const contrePreuves = lire<{
  totaux_tantiemes_par_owner: Record<string, number>;
  corruptions_attendues_detectables: { nom_vrai: string; nom_corrompu: string }[];
}>("contre-preuves.json");
const indexation = lire<{
  documents: { nom: string; apports: string[] }[];
  couverture_apports_requis: { patrimoine_requis: string[] };
  refus_actionnables_attendus: {
    cle: string;
    plages_manquantes: [number, number][];
    total_annonce: number;
    somme_couverte: number;
    message_attendu: string;
  }[];
}>("indexation-attendue.json");

/** Slug d'un pseudonyme, meme regle que la generation des refs. */
const slug = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

/** Distance de Damerau-Levenshtein (les transpositions comptent 1) - le critere du filet noms. */
function damerau(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cout);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
      }
    }
  }
  return d[a.length]![b.length]!;
}

type OracleCle200 = {
  cle: { code: string; total_annonce: number };
  nb_lots: number;
  tantiemes: { numero_lot: number; tantieme: number }[];
  lots_exclus: { parkings_exterieurs: number[]; rdc: number[]; total_exclus: number };
  reserves: { numero_lot: number; tantieme: number; statut: string; consigne_harnais: string }[];
  attendu_sur_le_pdf_extrait: {
    oracle: string;
    motif: string;
    somme_couverte: number;
    plages_manquantes: [number, number][];
  };
};
const oracle = lire<OracleCle200>("oracle-cle-200.json");

describe("oracle de la cle 200 - la verite du benchmark OCR", () => {
  it("boucle EXACTEMENT a 10 000 sur 96 lots", () => {
    expect(oracle.tantiemes).toHaveLength(96);
    expect(oracle.nb_lots).toBe(96);
    expect(oracle.tantiemes.reduce((s, t) => s + t.tantieme, 0)).toBe(10_000);
    expect(oracle.cle.total_annonce).toBe(10_000);
    expect(new Set(oracle.tantiemes.map((t) => t.numero_lot)).size).toBe(96); // pas de doublon
  });

  it("exclut a bon droit les 22 lots non desservis (96 + 22 = 118)", () => {
    const exclus = [...oracle.lots_exclus.parkings_exterieurs, ...oracle.lots_exclus.rdc];
    expect(exclus).toHaveLength(oracle.lots_exclus.total_exclus);
    expect(oracle.nb_lots + exclus.length).toBe(118);
    // Aucun lot exclu ne figure dans les tantiemes : les deux ensembles sont disjoints.
    const avecTantieme = new Set(oracle.tantiemes.map((t) => t.numero_lot));
    for (const e of exclus) expect(avecTantieme.has(e)).toBe(false);
  });

  it("garde tracable la valeur DEDUITE du lot 305 et sa consigne d'arbitrage", () => {
    // Une valeur deduite ne peut pas servir a condamner une lecture OCR : si un moteur rend
    // 194 avec une confiance haute, c'est un ARBITRAGE HUMAIN, pas un faux positif du moteur.
    const r = oracle.reserves.find((x) => x.numero_lot === 305)!;
    expect(r.tantieme).toBe(195);
    expect(r.statut).toContain("DEDUIT");
    expect(r.consigne_harnais).toContain("ARBITRAGE HUMAIN");
    // La deduction se verifie DEUX fois : le bouclage, et le +1 des paires de l'escalier B.
    const val = (lot: number) => oracle.tantiemes.find((t) => t.numero_lot === lot)!.tantieme;
    for (const [a, b] of [[301, 306], [302, 307], [303, 308], [304, 305]]) {
      expect(val(b!) - val(a!)).toBe(1);
    }
  });

  it("attend un REFUS sur le PDF extrait : la page 2 n'existe dans aucun document", () => {
    const a = oracle.attendu_sur_le_pdf_extrait;
    expect(a.oracle).toBe("REFUS");
    expect(a.motif).toBe("tableau_incomplet");
    expect(a.somme_couverte).toBe(2_800);
    // 50 lots a 56 = 2 800 : l'arithmetique du refus est verifiable.
    expect(50 * 56).toBe(a.somme_couverte);
    expect(a.plages_manquantes[0]).toEqual([51, 66]);
  });
});

describe("fixture S0306 - jeu prouve, anonymise", () => {
  it("les invariants prouves par la reprise manuelle tiennent", () => {
    expect(lots).toHaveLength(118);
    expect(new Set(lots.map((l) => l.numero_lot)).size).toBe(118); // pas de doublon
    expect(owners).toHaveLength(44);
    expect(attributions).toHaveLength(118);

    const cle001 = cles.find((c) => c.code === "001")!;
    const cle200 = cles.find((c) => c.code === "200")!;
    expect(cle001.tantiemes).toHaveLength(118);
    expect(cle001.tantiemes.reduce((s, t) => s + t.tantieme, 0)).toBe(100_000);
    expect(cle001.total_annonce).toBe(100_000);
    expect(cle200.tantiemes).toHaveLength(96);
    expect(cle200.tantiemes.reduce((s, t) => s + t.tantieme, 0)).toBe(10_000);
    expect(cle200.total_annonce).toBe(10_000);

    // 0 orphelin : chaque lot a au moins un proprietaire.
    const attribues = new Set(attributions.map((a) => a.numero_lot));
    expect(lots.filter((l) => !attribues.has(l.numero_lot))).toHaveLength(0);
  });

  it("les refs sont coherentes entre les 4 fichiers (aucune ref fantome)", () => {
    const refs = new Set(owners.map((o) => o.owner_ref_temp));
    expect(refs.size).toBe(44); // unicite
    for (const a of attributions) expect(refs.has(a.owner_ref_temp)).toBe(true);
    expect(new Set(liens450.map((l) => l.owner_ref_temp))).toEqual(refs);
    expect(new Set(Object.keys(contrePreuves.totaux_tantiemes_par_owner))).toEqual(refs);
  });

  it("NON-REIDENTIFICATION : chaque ref derive du pseudonyme de sa ligne, jamais d'autre chose", () => {
    // C'est le verrou anti table-de-correspondance : une ref qui ne commence pas par le
    // slug du nom pseudonymise porte forcement une information EXTERIEURE a la ligne
    // (l'incident du 30/07 : les vrais patronymes en refs).
    for (const o of owners) {
      expect(
        o.owner_ref_temp.startsWith(slug(o.nom)),
        `ref "${o.owner_ref_temp}" ne derive pas du pseudonyme "${o.nom}"`,
      ).toBe(true);
    }
  });

  it("contre-preuve : la somme cle 001 par owner colle aux totaux imprimes, 0 ecart sur 44", () => {
    const parLot = new Map(cles.find((c) => c.code === "001")!.tantiemes.map((t) => [t.numero_lot, t.tantieme]));
    const parOwner = new Map<string, number>();
    for (const a of attributions) {
      parOwner.set(a.owner_ref_temp, (parOwner.get(a.owner_ref_temp) ?? 0) + (parLot.get(a.numero_lot) ?? 0));
    }
    for (const [ref, total] of Object.entries(contrePreuves.totaux_tantiemes_par_owner)) {
      expect(parOwner.get(ref), `owner ${ref}`).toBe(total);
    }
  });

  it("preserve les pieges : homonymes memes/differentes adresses, prenom compose, morales", () => {
    const groupes = new Map<string, OwnerFixture[]>();
    for (const o of owners) {
      const cle = `${o.nom}|${o.prenom ?? ""}`;
      groupes.set(cle, [...(groupes.get(cle) ?? []), o]);
    }
    const homonymes = [...groupes.values()].filter((g) => g.length > 1);
    expect(homonymes).toHaveLength(2);
    // L'un des groupes a des adresses DIFFERENTES (dedup : element distinctif), l'autre la
    // MEME adresse (le cas qui a fait perdre un owner - discrimine par les tantiemes).
    const villes = homonymes.map((g) => new Set(g.map((o) => o.adr_ville)).size);
    expect(villes.sort()).toEqual([1, 2]);
    // Le groupe meme-adresse reste deux refs distinctes (jamais fusionne).
    for (const g of homonymes) expect(new Set(g.map((o) => o.owner_ref_temp)).size).toBe(g.length);

    // Prenom compose : "Jean Michel" reste UN prenom (le pipeline l'avait scinde en
    // "Jean & Michel", deux prenoms de couple). Le piege vaut MEME pour un couple m&mme :
    // c'est le prenom de monsieur, pas ceux de deux personnes.
    const compose = owners.find((o) => o.prenom === "Jean Michel");
    expect(compose).toBeDefined();
    expect(compose!.prenom).not.toContain("&");
    // 3 personnes morales (raison sociale), sans prenom.
    const morales = owners.filter((o) => o.raison_sociale);
    expect(morales).toHaveLength(3);
    for (const m of morales) expect(m.prenom ?? "").toBe("");
  });

  it("porte les paires du filet noms, toutes a distance de Damerau <= 2", () => {
    const paires = contrePreuves.corruptions_attendues_detectables;
    expect(paires.length).toBeGreaterThanOrEqual(5);
    for (const p of paires) {
      expect(p.nom_corrompu).not.toBe(p.nom_vrai);
      expect(damerau(p.nom_vrai, p.nom_corrompu), `${p.nom_vrai} -> ${p.nom_corrompu}`).toBeLessThanOrEqual(2);
    }
  });

  it("indexation attendue : 14 documents, couverture des requis, refus actionnable calcule", () => {
    expect(indexation.documents).toHaveLength(14);
    expect(indexation.couverture_apports_requis.patrimoine_requis).toContain("tantiemes_par_lot");

    // Le refus de la cle 200 est ACTIONNABLE (§3bis) : plages exactes + arithmetique coherente.
    const refus = indexation.refus_actionnables_attendus.find((r) => r.cle === "200")!;
    expect(refus.plages_manquantes.length).toBeGreaterThan(0);
    expect(refus.somme_couverte).toBeLessThan(refus.total_annonce);
    expect(refus.message_attendu).toContain("51-66"); // la plage calculee, pas un refus vague
    // Les plages manquantes designent des lots qui existent vraiment.
    const nums = new Set(lots.map((l) => l.numero_lot));
    for (const [debut, fin] of refus.plages_manquantes) {
      expect(nums.has(debut)).toBe(true);
      expect(nums.has(fin)).toBe(true);
    }
  });
});
