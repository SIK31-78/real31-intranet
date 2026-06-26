// Import one-shot de l'annuaire Crypto -> table intranet_crypto_contacts (email -> copro).
// Reconstruit `email -> notre code copro (referenceCrypto)` en joignant 3 exports Crypto
// (data/, git-ignores, PII) + le referentiel copro :
//
//   Tiers (IdRef -> EMail)
//     |> MandatCopro (IDTiers -> IdSociete)
//        |> Immeuble (IdEntite = IdSociete -> Registre_Numero = RNIC)
//           |> Copropriete (registrationNumber = RNIC -> referenceCrypto = S###)
//
// Anti-ambiguite cote RESOLVEUR (pas ici) : on importe TOUTES les paires (email, copro) ;
// un email lie a >1 copro produit plusieurs lignes -> le resolveur l'ignore a la synchro.
//
// Lancer depuis la racine du repo : node scripts/import-crypto-contacts.mjs
// Lit la cle service_role depuis .env.local. Ecrit dans la base partagee (a faire valider).

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

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

// Latin-1 : les exports Crypto sont en Windows-1252 (accents). On decode proprement les noms.
const lire = (p) => JSON.parse(fs.readFileSync("data/" + p, "latin1"));
const norm = (s) => (s || "").toString().replace(/\s+/g, "").toUpperCase();

console.log("Lecture des exports Crypto (Tiers, MandatCopro, Immeuble)...");
const tiers = lire("crypto-contacts.txt");
const mandats = lire("MandatCopro.txt");
const immeubles = lire("Immeuble.txt");

const emailDe = new Map();
const nomDe = new Map();
for (const t of tiers) {
  const e = (t.EMail || "").trim().toLowerCase();
  if (e && e.includes("@")) {
    emailDe.set(String(t.IdRef), e);
    nomDe.set(String(t.IdRef), (t.Identite || "").trim() || null);
  }
}
const rnicParEntite = new Map();
for (const x of immeubles) {
  const r = norm(x.Registre_Numero);
  if (r) rnicParEntite.set(String(x.IdEntite), r);
}

console.log("Lecture du referentiel copro (RNIC -> referenceCrypto)...");
const { data: copros, error } = await sb.from("Copropriete").select("referenceCrypto, registrationNumber");
if (error) {
  console.error("Lecture Copropriete :", error.message);
  process.exit(1);
}
const refParRnic = new Map();
for (const d of copros) {
  const r = norm(d.registrationNumber);
  if (r && d.referenceCrypto) refParRnic.set(r, d.referenceCrypto.trim());
}

// --- construit les paires (email, copro_code, nom) uniques ---
const vues = new Set();
const rows = [];
for (const r of mandats) {
  const email = emailDe.get(String(r.IDTiers));
  if (!email) continue;
  const rnic = rnicParEntite.get(String(r.IdSociete));
  if (!rnic) continue;
  const code = refParRnic.get(rnic);
  if (!code) continue;
  const k = email + "|" + code;
  if (vues.has(k)) continue;
  vues.add(k);
  rows.push({ email, copro_code: code, nom: nomDe.get(String(r.IDTiers)) ?? null });
}
console.log(`${rows.length} paires (email, copro) a importer.`);

// --- upsert par lots ---
const TAILLE = 500;
for (let i = 0; i < rows.length; i += TAILLE) {
  const lot = rows.slice(i, i + TAILLE);
  const { error: e2 } = await sb
    .from("intranet_crypto_contacts")
    .upsert(lot, { onConflict: "email,copro_code" });
  if (e2) {
    console.error("Upsert lot", i, ":", e2.message);
    process.exit(1);
  }
  console.log(`  ${Math.min(i + TAILLE, rows.length)}/${rows.length}`);
}
console.log("Import termine.");
