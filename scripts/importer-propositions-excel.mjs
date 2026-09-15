// Reprend l'Excel « Suivi Proposition reprise syndic » (feuille Generale, 1 161 lignes
// depuis 2012) dans intranet_proposition : la memoire commerciale du cabinet (ADR-039).
//
// Usage :
//   node --env-file=.env.local scripts/importer-propositions-excel.mjs "docs/Suivi Proposition reprise syndic.xlsx"
//
// Idempotent : une ligne deja importee (meme adresse + meme date de premier contact) est
// sautee. Statuts et origines normalises par le domaine ; les libelles inconnus (« Autre »)
// deviennent « en cours » avec le libelle d'origine dans le journal. Prealable :
// supabase/sql/intranet_propositions.sql.

import ExcelJS from "exceljs";

const SOURCE = process.argv[2] ?? "docs/Suivi Proposition reprise syndic.xlsx";
const U = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const K = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
if (!U || !K) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants (node --env-file=.env.local).");
const H = { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json" };

// Copie des regles du domaine (proposition.ts) : un script ne charge pas le TS.
function statut(brut) {
  const s = String(brut ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s.startsWith("accept")) return "accepte_cs";
  if (s === "elu" || s === "élu") return "elu";
  if (s.startsWith("en cours")) return "en_cours";
  if (s.startsWith("report")) return "reporte";
  if (s.includes("real")) return "refuse_real31";
  if (s.includes("ag")) return "refuse_ag";
  if (s.includes("cs")) return "refuse_cs";
  if (s.startsWith("refus")) return "refuse_cs";
  return null;
}
function origine(brut) {
  const s = String(brut ?? "").trim().toLowerCase();
  if (!s || s === "nc") return undefined;
  if (s.startsWith("bouche")) return "bouche_a_oreille";
  if (s.startsWith("vitrine")) return "vitrine";
  if (s.startsWith("internet")) return "internet";
  if (s.startsWith("d")) return "deja_client";
  return "autre";
}
const valeur = (c) => { const v = c?.value; if (v == null) return null; if (v instanceof Date) return v; if (typeof v === "object") return v.result ?? v.text ?? (v.richText ? v.richText.map((t) => t.text).join("") : null); return v; };
const jourISO = (v) => {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 30000 && v < 60000) return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10);
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? "")); return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};
const nombre = (v) => { const n = Number(String(v ?? "").replace(/\s/g, "").replace(",", ".")); return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : null; };
const texte = (v) => { const s = String(v ?? "").trim(); return s && s.toLowerCase() !== "nc" ? s : null; };

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(SOURCE);
const ws = wb.getWorksheet("Général");
if (!ws) throw new Error("Feuille « Général » introuvable.");

const existantes = await (await fetch(`${U}/rest/v1/intranet_proposition?select=immeuble,premier_contact&limit=5000`, { headers: H })).json();
const deja = new Set((Array.isArray(existantes) ? existantes : []).map((p) => `${(p.immeuble?.adresse ?? "").toLowerCase()}|${p.premier_contact ?? ""}`));

// La colonne « Contact » de l'Excel melange nom, telephone(s) et e-mail(s) dans une cellule :
// on en sort le premier telephone et le premier e-mail, le reste est le nom.
function contact(brut) {
  if (!brut) return {};
  const emails = brut.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? [];
  const tels = brut.match(/(?:\+33|0)\s?[1-9](?:[\s.,-]?\d{2}){4}/g) ?? [];
  let nom = brut;
  for (const x of [...emails, ...tels]) nom = nom.replace(x, " ");
  nom = nom.replace(/<\s*>/g, " ").replace(/\s[\/\-–]\s(?=[\/\-–(]|$)/g, " ").replace(/[\s\/\-–:;,]+$/g, "").replace(/^[\s\/\-–:;,]+/g, "").replace(/\s{2,}/g, " ").trim();
  return {
    ...(nom ? { nom } : {}),
    ...(tels[0] ? { telephone: tels[0].replace(/[\s.,-]/g, "").replace(/^(\d{2})(?=\d)/, "$1 ").replace(/(\d{2})(?=\d)/g, "$1 ").trim() } : {}),
    ...(emails[0] ? { email: emails[0].toLowerCase() } : {}),
  };
}

let lues = 0, creees = 0, sautees = 0, sansStatut = 0;
const lot = [];
ws.eachRow((row, i) => {
  if (i < 4) return; // 1-2 : formules de synthese, 3 : en-tetes
  const adresse = texte(valeur(row.getCell(1)));
  if (!adresse) return;
  lues++;
  const premierContact = jourISO(valeur(row.getCell(5)));
  const cle = `${adresse.toLowerCase()}|${premierContact ?? ""}`;
  if (deja.has(cle)) { sautees++; return; }
  deja.add(cle);
  const statutBrut = valeur(row.getCell(9));
  let st = statut(statutBrut);
  const journal = [{ quandISO: new Date().toISOString(), par: "import Excel", texte: `Repris de « Suivi Proposition reprise syndic » (statut d'origine : ${texte(statutBrut) ?? "vide"})` }];
  if (!st) { st = "en_cours"; sansStatut++; }
  const tarifTtc = nombre(valeur(row.getCell(8)));
  const commentaires = [texte(valeur(row.getCell(13))), texte(valeur(row.getCell(14)))].filter(Boolean).join(" — ");
  lot.push({
    statut: st,
    agence: texte(valeur(row.getCell(2))),
    gestionnaire: null,
    origine: origine(valeur(row.getCell(11))) ?? null,
    immeuble: { adresse, ...(nombre(valeur(row.getCell(3))) !== null ? { lotsPrincipaux: Math.round(nombre(valeur(row.getCell(3)))) } : {}) },
    contact: contact(texte(valeur(row.getCell(4)))),
    prix: { ...(tarifTtc !== null ? { honorairesTtc: Math.round(tarifTtc * 100) / 100 } : {}) },
    premier_contact: premierContact,
    remise_proposition: jourISO(valeur(row.getCell(6))),
    ag_prevue: jourISO(valeur(row.getCell(12))),
    decision: null,
    commentaires: commentaires || null,
    copropriete_id: null,
    journal,
    cree_par: "import Excel",
    created_at: premierContact ? `${premierContact}T09:00:00+01:00` : undefined,
    updated_at: premierContact ? `${premierContact}T09:00:00+01:00` : undefined,
  });
});

for (let i = 0; i < lot.length; i += 200) {
  // Les cles varient d'une ligne a l'autre (created_at absent sans date de premier contact) :
  // PostgREST exige alors la liste des colonnes + `missing=default`.
  const tranche = lot.slice(i, i + 200).map((p) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)));
  const colonnes = [...new Set(tranche.flatMap((p) => Object.keys(p)))].join(",");
  const r = await fetch(`${U}/rest/v1/intranet_proposition?columns=${colonnes}`, { method: "POST", headers: { ...H, Prefer: "return=minimal, missing=default" }, body: JSON.stringify(tranche) });
  if (r.status >= 300) throw new Error(`Supabase ${r.status} : ${(await r.text()).slice(0, 300)}`);
  creees += tranche.length;
}
console.log(`${lues} lignes lues, ${creees} propositions creees, ${sautees} deja presentes, ${sansStatut} sans statut reconnu (mises « en cours », statut d'origine dans le journal).`);
