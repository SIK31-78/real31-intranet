// Import one-shot des listes de diffusion Crypto -> table intranet_listes_diffusion.
// Fallback pour les destinataires du mail au conseil syndical (increment 2 "dates CS/AG").
// eStale reste la source PRIMAIRE (owner.email) ; cette table sert quand la copro n'est
// pas encore sur eStale (parc Crypto jusqu'en janvier).
//
// Les regles de parsing / classification / nettoyage sont le MIROIR de la logique testee
// dans src/lib/domain/listes-diffusion.ts (ce module TS ne peut pas etre importe ici, .mjs).
//
// Lancer depuis la racine du repo : node scripts/import-listes-diffusion.mjs
// Lit la cle service_role depuis .env.local. Ecrit dans la base partagee (a faire valider).
// PII : ce script ne journalise AUCUNE adresse (compteurs agreges seulement).

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const FICHIER = "data/Export crypto/listes_diffusion_20260630.csv";

// --- env ---
for (const l of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const g = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (g) process.env[g[1]] = g[2].replace(/^["']|["']$/g, "");
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants dans .env.local");
  process.exit(1);
}
const sb = createClient(url, key);

// --- regles (miroir de src/lib/domain/listes-diffusion.ts) ---
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normaliserRefCopro(ref) {
  const m = ref.trim().toUpperCase().match(/^([A-Z]+)0*(\d+)$/);
  return m ? `${m[1]}${m[2]}` : ref.trim().toUpperCase();
}
function classifierListe(designation) {
  const d = (designation || "").toLowerCase();
  if (d.includes("conseil syndic")) return "conseil_syndical";
  if (d.includes("propri")) return "proprietaires";
  return "autre";
}
function extraireRefCopro(designation) {
  const m = (designation || "").match(/\bS\s?0*\d+\b/i);
  return m ? normaliserRefCopro(m[0].replace(/\s+/g, "")) : null;
}
function estEmailInterne(email) {
  return email.trim().toLowerCase().endsWith("@real31.fr");
}
function destinatairesListe(a, cc, cci) {
  const vus = new Set();
  const out = [];
  for (const brut of [...a, ...cc, ...cci]) {
    const e = brut.trim();
    const cle = e.toLowerCase();
    if (!e || !RE_EMAIL.test(e) || estEmailInterne(e) || vus.has(cle)) continue;
    vus.add(cle);
    out.push(e);
  }
  return out;
}

// --- parsing ---
const brut = fs.readFileSync(FICHIER, "utf8").replace(/^﻿/, "");
const lignes = brut.split(/\r?\n/).filter((l) => l.trim().length > 0);
lignes.shift(); // entete
const emails = (champ) => (champ ?? "").split(",").map((e) => e.trim()).filter(Boolean);

const rows = [];
let cs = 0;
let proprio = 0;
let autre = 0;
let matchees = 0;
let nonMatchees = 0;
for (const l of lignes) {
  const c = l.split(";");
  const designation = (c[1] ?? "").trim();
  const type = classifierListe(designation);
  const coproCode = extraireRefCopro(designation);
  if (type === "conseil_syndical") cs++;
  else if (type === "proprietaires") proprio++;
  else autre++;
  if (coproCode) matchees++;
  else nonMatchees++;
  rows.push({
    idref: (c[0] ?? "").trim(),
    designation,
    gestionnaire: (c[2] ?? "").trim() || null,
    immeuble_code: (c[3] ?? "").trim() || null,
    immeuble_ville: (c[4] ?? "").trim() || null,
    copro_code: coproCode,
    type_liste: type,
    emails: destinatairesListe(emails(c[7]), emails(c[8]), emails(c[9])),
  });
}

console.log(`${rows.length} listes lues.`);
console.log(`  classification : ${cs} conseil_syndical, ${proprio} proprietaires, ${autre} autre.`);
console.log(`  rapprochement copro : ${matchees} avec reference S###, ${nonMatchees} sans.`);

// --- garde anti-ecrasement des editions manuelles -----------------------------------
// Une ligne editee depuis l'intranet porte edite_le IS NOT NULL (cf.
// supabase/sql/intranet_listes_diffusion_edite.sql). Un rejeu d'import ne doit PAS ecraser
// ses emails. supabase-js .upsert() ne sait pas exprimer un "ON CONFLICT ... WHERE
// edite_le IS NULL" ; on obtient le meme resultat en EXCLUANT du lot les idref deja edites
// (equivalent semantique : la ligne editee reste intacte). Deterministe, sans fonction SQL.
let idrefsEdites = new Set();
{
  const { data, error } = await sb
    .from("intranet_listes_diffusion")
    .select("idref")
    .not("edite_le", "is", null);
  if (error) {
    // Colonne edite_le absente (SQL pas encore lance) : pas encore de protection possible
    // -> on continue SANS garde (comportement d'avant la fonctionnalite). Lancer
    // intranet_listes_diffusion_edite.sql active la protection aux prochains rejeux.
    console.warn(
      "  ! garde edite_le indisponible (" +
        error.message +
        ") - import SANS protection des editions. Lance supabase/sql/intranet_listes_diffusion_edite.sql.",
    );
  } else {
    idrefsEdites = new Set((data ?? []).map((r) => r.idref));
    if (idrefsEdites.size > 0) {
      console.log(`  ${idrefsEdites.size} liste(s) editee(s) dans l'intranet : preservee(s) du rejeu.`);
    }
  }
}
const aImporter = rows.filter((r) => !idrefsEdites.has(r.idref));
const preservees = rows.length - aImporter.length;

// --- upsert par lots (idref = cle primaire) ---
const TAILLE = 500;
for (let i = 0; i < aImporter.length; i += TAILLE) {
  const lot = aImporter.slice(i, i + TAILLE);
  const { error } = await sb.from("intranet_listes_diffusion").upsert(lot, { onConflict: "idref" });
  if (error) {
    console.error("Upsert lot", i, ":", error.message);
    process.exit(1);
  }
  console.log(`  ${Math.min(i + TAILLE, aImporter.length)}/${aImporter.length}`);
}
console.log(`Import termine (${aImporter.length} ecrites, ${preservees} preservees).`);
