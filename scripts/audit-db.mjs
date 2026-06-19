// Audit lecture seule de la base patron (schema public, App A). Affiche les
// COLONNES et leur TYPE uniquement - jamais les valeurs (donnees du patron).
// Lancer : node --env-file=.env.local scripts/audit-db.mjs
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: "public" },
});

// Colonnes de Copropriete que l'intranet exploite deja.
const UTILISEES = new Set([
  "id", "referenceCrypto", "referenceEstale", "externalIdEstale", "dataSource", "name",
  "address1", "address2", "postalCode", "city", "status", "managerId", "assistantId",
  "accountantId", "mainLotsCount", "otherLotsCount", "accountingStartDate", "accountingEndDate",
  "syndicInitialDate", "lastAGDate", "nextAGDate", "lastCSDate", "nextCSDate", "ppt",
]);

function typeDe(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return "date(iso)";
    return `string(${v.length})`;
  }
  return typeof v;
}

async function compte(table) {
  const { count, error } = await sb.from(table).select("*", { count: "exact", head: true });
  console.log(`\n### ${table} : ${error ? "ERREUR " + error.message : count + " lignes"}`);
}

async function colonnes(table, marquer = false) {
  // 3 lignes pour limiter les colonnes "null" partout (un seul echantillon manquerait des champs).
  const { data, error } = await sb.from(table).select("*").limit(3);
  if (error) return console.log(`  ERREUR ${error.message}`);
  const cles = new Set();
  for (const row of data ?? []) for (const k of Object.keys(row)) cles.add(k);
  const ref = data?.[0] ?? {};
  console.log(`  (${cles.size} colonnes)`);
  for (const k of [...cles].sort()) {
    const t = typeDe(ref[k]);
    const tag = marquer ? (UTILISEES.has(k) ? "  [utilisee]" : "  [NON UTILISEE]") : "";
    console.log(`    ${k} : ${t}${tag}`);
  }
}

await compte("Copropriete");
await colonnes("Copropriete", true);
await compte("User");
await colonnes("User");
