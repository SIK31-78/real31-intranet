// Reprend le registre national d'immatriculation des coproprietes (ANAH, open data) dans
// intranet_registre_copros, extrait Ile-de-France. A relancer chaque trimestre quand
// l'ANAH publie le fichier suivant (ADR-039).
//
// Usage :
//   node --env-file=.env.local scripts/importer-registre-copros.mjs [--departements=75,77,78,91,92,93,94,95] [--url=<csv>]
//
// Le CSV national fait ~450 Mo : il est lu EN FLUX, jamais stocke ; seules les lignes des
// departements retenus sont envoyees a Supabase (upsert par immatriculation, lots de 500).
// Prealable : supabase/sql/intranet_propositions.sql.

const DATASET = "62da71c068871f4c54258c7c";
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const DEPARTEMENTS = (args.departements ?? "75,77,78,91,92,93,94,95").split(",");
const U = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const K = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
if (!U || !K) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants (node --env-file=.env.local).");

async function urlDernierFichier() {
  if (args.url) return args.url;
  const d = await (await fetch(`https://www.data.gouv.fr/api/1/datasets/${DATASET}/`)).json();
  // Le fichier trimestriel le plus recent : « Fichier Tn AAAA.csv », le plus gros.
  const csv = d.resources.filter((r) => r.format === "csv" && /fichier|rnc-data/i.test(r.title)).sort((a, b) => (b.last_modified ?? "").localeCompare(a.last_modified ?? ""))[0];
  if (!csv) throw new Error("Aucun fichier CSV trouve sur data.gouv.");
  console.log(`Fichier : ${csv.title} (${Math.round(csv.filesize / 1e6)} Mo, ${csv.last_modified?.slice(0, 10)})`);
  return csv.url;
}

function parseLigne(l) {
  const out = []; let f = "", q = false;
  for (let i = 0; i < l.length; i++) { const c = l[i];
    if (q) { if (c === '"' && l[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
    else if (c === '"') q = true; else if (c === ",") { out.push(f); f = ""; } else f += c; }
  out.push(f); return out;
}

/** Meme normalisation que l'adapter (normaliserRecherche). */
const normaliser = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/\b(rue|r|av|ave|avenue|bd|bld|boulevard|pl|place|all|allee|imp|impasse|ch|chemin|sq|square|res|residence)\b\.?/g, " ")
  .replace(/[^a-z0-9]+/g, " ").trim();
const entier = (v) => { const n = Number(v); return v !== "" && Number.isFinite(n) ? Math.round(n) : null; };
const reel = (v) => { const n = Number(v); return v !== "" && Number.isFinite(n) ? n : null; };
const jour = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const texte = (v) => { const s = (v ?? "").trim(); return s && s !== "non connu" ? s : null; };

async function envoyer(lot) {
  const r = await fetch(`${U}/rest/v1/intranet_registre_copros?on_conflict=immatriculation`, {
    method: "POST",
    headers: { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(lot),
  });
  if (r.status >= 300) throw new Error(`Supabase ${r.status} : ${(await r.text()).slice(0, 300)}`);
}

const url = await urlDernierFichier();
const reponse = await fetch(url);
if (!reponse.ok || !reponse.body) throw new Error(`Telechargement : ${reponse.status}`);
const decodeur = new TextDecoder("utf-8");
let reste = "", entetes = null, idx = null, lus = 0, retenus = 0, lot = [];
const importeLe = new Date().toISOString();

for await (const chunk of reponse.body) {
  reste += decodeur.decode(chunk, { stream: true });
  let i;
  while ((i = reste.indexOf("\n")) >= 0) {
    const ligne = reste.slice(0, i).replace(/\r$/, ""); reste = reste.slice(i + 1);
    if (!ligne) continue;
    if (!entetes) { entetes = parseLigne(ligne); idx = Object.fromEntries(entetes.map((c, k) => [c, k])); continue; }
    lus++;
    // Filtre rapide sur le code commune (INSEE) avant de parser toute la ligne.
    const m = /^"[^"]*","(\d{2})/.exec(ligne);
    if (!m || !DEPARTEMENTS.includes(m[1])) continue;
    const r = parseLigne(ligne);
    const adresse = (r[idx.numero_et_voie_adresse_de_reference] ?? "").trim();
    const cp = (r[idx.code_postal_adresse_de_reference] ?? "").trim();
    const commune = (r[idx.commune_adresse_de_reference] ?? "").trim();
    const immat = (r[idx.numero_d_immatriculation] ?? "").trim();
    if (!immat || !adresse) continue;
    const compl = [r[idx.adresse_complementaire_1], r[idx.adresse_complementaire_2], r[idx.adresse_complementaire_3]].map(texte).filter(Boolean);
    lot.push({
      immatriculation: immat,
      nom_usage: texte(r[idx.nom_d_usage_de_la_copropriete]),
      adresse, code_postal: cp, commune,
      adresses_compl: compl,
      lots_total: entier(r[idx.nombre_total_de_lots]),
      lots_principaux: entier(r[idx.nombre_total_de_lots_a_usage_d_habitation_de_bureaux_ou_de_comm]),
      lots_habitation: entier(r[idx.nombre_de_lots_a_usage_d_habitation]),
      lots_stationnement: entier(r[idx.nombre_de_lots_de_stationnement]),
      periode_construction: texte(r[idx.periode_de_construction]),
      syndic_type: texte(r[idx.type_de_syndic_benevole_professionnel_non_connu]),
      syndic_nom: texte(r[idx.raison_sociale_du_representant_legal]),
      syndic_siret: texte(r[idx.siret_du_representant_legal]),
      mandat: texte(r[idx.mandat_en_cours_dans_la_copropriete]),
      fin_mandat: jour(r[idx.date_de_fin_du_dernier_mandat]),
      date_maj_registre: jour(r[idx.date_de_la_derniere_maj]),
      longitude: reel(r[idx.long]), latitude: reel(r[idx.lat]),
      recherche: normaliser(`${adresse} ${cp} ${commune} ${compl.join(" ")} ${r[idx.nom_d_usage_de_la_copropriete] ?? ""}`),
      importe_le: importeLe,
    });
    retenus++;
    if (lot.length >= 500) { await envoyer(lot); lot = []; process.stdout.write(`\r${retenus} lignes envoyees (${lus} lues)`); }
  }
}
if (lot.length) await envoyer(lot);
console.log(`\n${retenus} coproprietes importees sur ${lus} lues (departements ${DEPARTEMENTS.join(", ")}).`);
