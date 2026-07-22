// LECTURE SEULE. Verifie sur une AG si les "signing" (emargement) des owners/presents
// et des representants externes sont remplis, et l'etat isSigned des attendances.
// Usage : node --env-file=.env.local scripts/estale-check-signing.mjs [CONDO_ID] [MEETING_ID]
const EMAIL = process.env.ESTALE_EMAIL;
const PASSWORD = process.env.ESTALE_PASSWORD;
const BASE = (process.env.ESTALE_BASE_URL ?? "https://api.estale.app").replace(/\/$/, "");
const CONDO_ID = (process.argv[2] ?? "f3f6eec5-112a-433f-801c-3cbdc1195bfa").trim();
const MEETING_ID = (process.argv[3] ?? "bfad0358-92e1-4c89-8128-09a29ba0019e").trim();
if (!EMAIL || !PASSWORD) { console.error("creds manquants"); process.exit(1); }

async function login() {
  const res = await fetch(`${BASE}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });
  if (!res.ok) throw new Error(`Login HTTP ${res.status}`);
  const cookies = res.headers.getSetCookie?.() ?? [];
  return cookies.map((c) => c.split(";")[0]).join("; ");
}
async function gql(cookie, query, variables) {
  const res = await fetch(`${BASE}/graphql/intranet`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ query, variables }) });
  const json = await res.json();
  if (json.errors) throw new Error("GraphQL: " + json.errors.map((e) => e.message).join(" ; "));
  return json.data;
}
const flag = (v) => (v ? `REMPLI(${v.contentType ?? "?"})` : "(vide)");
const cookie = await login();
const data = await gql(cookie, `query($c:ID!,$m:ID!){ condo(id:$c){ meeting(id:$m){
  attendances { owner{fullname} isSigned whitePower }
  externalRepresentatives { firstname lastname signingID signing{contentType filename} }
  transcript { owners { owner{fullname} isPresent signingID signing{contentType filename} } }
}}}`, { c: CONDO_ID, m: MEETING_ID });
const m = data.condo.meeting;
console.log("=== ATTENDANCES ===");
for (const a of m.attendances) console.log(`  ${a.owner.fullname.padEnd(28)} isSigned=${a.isSigned} whitePower=${a.whitePower}`);
console.log("\n=== MeetingOwner.signing (emargement present ?) ===");
for (const o of m.transcript.owners) console.log(`  ${o.owner.fullname.padEnd(28)} isPresent=${o.isPresent} signingID=${o.signingID ?? "-"} signing=${flag(o.signing)}`);
console.log("\n=== REPRESENTANTS EXTERNES.signing ===");
if (!m.externalRepresentatives.length) console.log("  (aucun)");
for (const r of m.externalRepresentatives) console.log(`  ${r.firstname} ${r.lastname} signingID=${r.signingID ?? "-"} signing=${flag(r.signing)}`);
