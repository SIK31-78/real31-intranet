// Pointage physique de l'armoire LGC du 18/09/2026 (Sekou) : parmi les 37 trousseaux que
// PowerApps disait sortis, 16 le sont vraiment, les autres sont dans l'armoire. On enregistre
// le RETOUR de ceux qui sont presents (pret clos + mouvement, meme ordre que le service), on
// ne touche pas aux 16 absents.
//
//   node scripts/cles-pointage-2026-09-18.mjs            # dry-run
//   node scripts/cles-pointage-2026-09-18.mjs --ecrire

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ABSENTS = new Set(["J012", "R071", "R056", "R072", "R083", "R059", "R055", "J051", "J053", "R054", "R060", "R093", "R037", "J013", "R042", "J032"]);
const ECRIRE = process.argv.includes("--ecrire");
const PAR = { id: null, nom: "Sekou KOMA" };

for (const l of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const g = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (g) process.env[g[1]] = g[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: users } = await sb.from("User").select("id, name").ilike("name", "%KOMA%");
PAR.id = users?.[0]?.id ?? null;

const { data: prets, error } = await sb
  .from("intranet_cles_pret")
  .select("id, trousseau_id, entreprise_id, type, sorti_le, retour_prevu_le, trousseau:intranet_cles_trousseau(numero, agence_code), entreprise:intranet_cles_entreprise(nom)")
  .is("rendu_le", null);
if (error) { console.error(error.message); process.exit(1); }

const ouverts = prets.map((p) => ({ ...p, numero: p.trousseau?.numero, agence: p.trousseau?.agence_code, entrepriseNom: p.entreprise?.nom }));
const presents = ouverts.filter((p) => !ABSENTS.has(p.numero));
const absents = ouverts.filter((p) => ABSENTS.has(p.numero));
const inconnus = [...ABSENTS].filter((n) => !ouverts.some((p) => p.numero === n));

console.log(`Prêts ouverts : ${ouverts.length} · présents dans l'armoire (retour à enregistrer) : ${presents.length} · absents confirmés : ${absents.length}`);
if (inconnus.length) console.log(`Numéros donnés absents mais SANS prêt ouvert en base : ${inconnus.join(", ")}`);
console.log("\nRetours à enregistrer :");
for (const p of presents) console.log(`  ${p.numero} · ${p.type === "interne" ? "interne" : p.entrepriseNom ?? "?"} · sorti le ${p.sorti_le.slice(0, 10)}`);
console.log("\nRestent sortis :");
for (const p of absents) console.log(`  ${p.numero} · ${p.type === "interne" ? "interne" : p.entrepriseNom ?? "?"} · sorti le ${p.sorti_le.slice(0, 10)}`);

if (!ECRIRE) { console.log("\nDry-run : rien n'a été écrit. Relancer avec --ecrire."); process.exit(0); }

const maintenant = new Date().toISOString();
let n = 0;
for (const p of presents) {
  const commentaire = "Pointage physique de l'armoire du 18/09/2026 : trousseau présent, retour non saisi dans PowerApps";
  const { error: e1 } = await sb.from("intranet_cles_pret").update({ rendu_le: maintenant, recu_par_id: PAR.id, recu_par_nom: PAR.nom, retour_conforme: "complet", commentaire_retour: commentaire }).eq("id", p.id);
  if (e1) { console.error(`${p.numero} : ${e1.message}`); continue; }
  const { error: e2 } = await sb.from("intranet_cles_mouvement").insert({
    trousseau_id: p.trousseau_id, type: "retour", par_user_id: PAR.id, par_nom: PAR.nom, agence_code: p.agence ?? "LGC", entreprise_id: p.entreprise_id, pret_id: p.id,
    details: { entrepriseNom: p.entrepriseNom, conformite: "complet", commentaire, retourPrevuLeISO: p.retour_prevu_le, pointage: "2026-09-18" },
  });
  if (e2) { console.error(`${p.numero} mouvement : ${e2.message}`); continue; }
  n++;
}
console.log(`\n✓ ${n} retours enregistrés.`);
