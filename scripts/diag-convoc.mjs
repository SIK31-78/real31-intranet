// Diagnostic lecture seule : reproduit le calcul "convoc en retard" du dashboard
// pour CHAQUE gestionnaire, et detaille ce qui le declenche (AG imminente sans
// CONVOC marquee accomplie dans l'intranet). Distingue : AG deja tenue (donnee
// perimee) vs convoc reellement geree hors intranet.
// Lancer : node --env-file=.env.local scripts/diag-convoc.mjs
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: "public" },
});

const HORIZON = 90;
const CONVOC_AVANT = 22; // 21 jours francs + 1 (approx, sans recul jour ouvre)
const today = new Date().toISOString().slice(0, 10);

function moinsJours(iso, n) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10);
}
function joursEntre(a, b) {
  const [ay, am, ad] = a.slice(0, 10).split("-").map(Number);
  const [by, bm, bd] = b.slice(0, 10).split("-").map(Number);
  return (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000;
}

const { data: users } = await sb.from("User").select("id, firstName, lastName, email");
const { data: copros } = await sb
  .from("Copropriete")
  .select("referenceCrypto, referenceEstale, name, managerId, nextAGDate, lastAGDate");

const parManager = new Map();
for (const c of copros ?? []) {
  if (!c.managerId) continue;
  (parManager.get(c.managerId) ?? parManager.set(c.managerId, []).get(c.managerId)).push(c);
}

console.log(`today = ${today}\n`);
const lignes = [];
for (const u of users ?? []) {
  const liste = parManager.get(u.id) ?? [];
  const avenir = liste.filter((c) => {
    const d = c.nextAGDate?.slice(0, 10);
    return d && d >= today && joursEntre(today, d) <= HORIZON;
  });
  const enRetard = avenir
    .map((c) => {
      const ag = c.nextAGDate.slice(0, 10);
      const limite = moinsJours(ag, CONVOC_AVANT);
      return { c, ag, limite, retard: limite < today };
    })
    .filter((x) => x.retard);
  if (liste.length > 0)
    lignes.push({ u, total: liste.length, avenir: avenir.length, retard: enRetard.length, enRetard });
}

lignes.sort((a, b) => b.retard - a.retard);
console.log("Gestionnaire".padEnd(28), "copros", "AG<=90j", "convocRetard");
for (const l of lignes) {
  console.log(
    `${(l.u.firstName + " " + l.u.lastName).padEnd(28)} ${String(l.total).padStart(6)} ${String(l.avenir).padStart(7)} ${String(l.retard).padStart(12)}`,
  );
}

// Detail du gestionnaire qui a le plus de retards (probablement celui affiche).
const top = lignes[0];
if (top) {
  console.log(`\n=== Detail : ${top.u.firstName} ${top.u.lastName} (${top.retard} convoc en retard) ===`);
  for (const x of top.enRetard) {
    const code = x.c.referenceCrypto ?? x.c.referenceEstale ?? "?";
    const tenue = x.c.lastAGDate ? x.c.lastAGDate.slice(0, 10) : "-";
    const flag = x.c.lastAGDate && x.c.lastAGDate.slice(0, 10) >= x.limite ? "  [derniere AG >= limite convoc : AG deja tenue ?]" : "";
    console.log(`   ${code.padEnd(8)} AG=${x.ag}  limiteConvoc=${x.limite}  derniereAG=${tenue}${flag}  ${x.c.name}`);
  }
}

const { count: nbSup } = await sb
  .from("intranet_supervision_items")
  .select("*", { count: "exact", head: true });
console.log(`\nintranet_supervision_items : ${nbSup ?? 0} lignes au total`);
