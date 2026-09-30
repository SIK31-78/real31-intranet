// Qui se sert encore de l'EDITEUR ODJ en ligne, maintenant que le CS se prepare dans Word ?
//
// Decision Sekou 2026-09-30 : on garde les deux outils et on attend deux semaines avant
// de trancher le sort de l'editeur. Ce script est la mesure qui evite d'attendre "au
// jugement" : il dit qui saisit, sur quelles copros, et ce que le Word ne saurait pas
// reprendre. Sans lui, la decision se prendrait sur une impression.
//
// LECTURE SEULE. Usage :
//   node --env-file=.env.local scripts/odj-usage-editeur.mjs [depuis-AAAA-MM-JJ]
// Defaut : depuis le 2026-09-22 (mise en prod du Word).

import { readFileSync } from "node:fs";

const DEPUIS = process.argv[2] ?? "2026-09-22";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const cle = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !cle) {
  console.error("Identifiants Supabase absents (.env.local).");
  process.exit(1);
}

const reponse = await fetch(`${url}/rest/v1/intranet_odj_champs?select=*&limit=5000`, {
  headers: { apikey: cle, Authorization: `Bearer ${cle}` },
});
const lignes = await reponse.json();
if (!Array.isArray(lignes)) {
  console.error("Lecture impossible :", lignes.message ?? lignes);
  process.exit(1);
}

/** Ce que le Word NE SAIT PAS rendre : les libertes de mise en page de l'editeur. */
const HORS_WORD = /^(libre|note|bloc|masque|libelle|titre-section)\./;
/** Cles techniques, pas des saisies de contenu. */
const TECHNIQUE = /^__/;

const depuis = lignes.filter((l) => String(l.marque_at ?? "") >= DEPUIS && !TECHNIQUE.test(l.champ_id));
const horsWord = lignes.filter((l) => HORS_WORD.test(l.champ_id));

const parPersonne = new Map();
for (const l of depuis) {
  const qui = l.marque_par || "(inconnu)";
  const e = parPersonne.get(qui) ?? { saisies: 0, copros: new Set(), derniere: "" };
  e.saisies += 1;
  e.copros.add(l.copropriete_id);
  if (String(l.marque_at) > e.derniere) e.derniere = String(l.marque_at);
  parPersonne.set(qui, e);
}

console.log(`ÉDITEUR ODJ EN LIGNE - usage depuis le ${DEPUIS}\n`);
if (parPersonne.size === 0) {
  console.log("  Aucune saisie. Personne ne s'en sert : l'éditeur peut être retiré.");
} else {
  console.log(`  ${depuis.length} saisies, ${new Set(depuis.map((l) => l.copropriete_id)).size} copropriétés\n`);
  const tri = [...parPersonne.entries()].sort((a, b) => b[1].saisies - a[1].saisies);
  for (const [qui, e] of tri) {
    console.log(
      `  ${qui.padEnd(8)} ${String(e.saisies).padStart(4)} saisies  ${String(e.copros.size).padStart(2)} copro(s)` +
        `  dernière : ${e.derniere.slice(0, 16).replace("T", " ")}  [${[...e.copros].join(" ")}]`,
    );
  }
  console.log("\n  => Quelqu'un s'en sert encore : comprendre ce que le Word ne lui donne pas avant de retirer.");
}

console.log(`\nCONTENUS QUE LE WORD NE REPREND PAS (tout l'historique)\n`);
const parCopro = new Map();
for (const l of horsWord) {
  const nature = l.champ_id.split(".")[0];
  const e = parCopro.get(l.copropriete_id) ?? {};
  e[nature] = (e[nature] ?? 0) + 1;
  parCopro.set(l.copropriete_id, e);
}
if (parCopro.size === 0) {
  console.log("  Aucun : le Word couvre tout ce qui a été saisi.");
} else {
  console.log(`  ${horsWord.length} lignes sur ${parCopro.size} copropriétés\n`);
  const total = (m) => Object.values(m).reduce((s, v) => s + v, 0);
  for (const [copro, m] of [...parCopro.entries()].sort((a, b) => total(b[1]) - total(a[1]))) {
    const detail = Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .map(([n, v]) => `${n} ${v}`)
      .join(", ");
    console.log(`  ${copro.padEnd(7)} ${String(total(m)).padStart(3)}  (${detail})`);
  }
  console.log("\n  Ces contenus seraient PERDUS de vue si l'écran était retiré (la donnée reste en base).");
}
