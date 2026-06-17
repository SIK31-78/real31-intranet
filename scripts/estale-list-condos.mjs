// LECTURE SEULE : liste toutes mes copros eStale (reference + nom). Aide a retrouver
// la bonne reference (ex. la copro test). Filtre optionnel par sous-chaine.
// Usage : node --env-file=.env.local scripts/estale-list-condos.mjs [filtre]

const EMAIL = process.env.ESTALE_EMAIL;
const PASSWORD = process.env.ESTALE_PASSWORD;
const BASE = (process.env.ESTALE_BASE_URL ?? "https://api.estale.app").replace(/\/$/, "");
const FILTRE = (process.argv[2] ?? "").toLowerCase();

async function login() {
  const res = await fetch(`${BASE}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login HTTP ${res.status}`);
  return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}

const cookie = await login();
const res = await fetch(`${BASE}/graphql/intranet`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie },
  body: JSON.stringify({
    query: `{ me { collaborator { condos(archived: false) { reference name } } } }`,
  }),
});
const json = await res.json();
if (json.errors) {
  console.error("GraphQL:", json.errors.map((e) => e.message).join(" ; "));
  process.exit(1);
}
const condos = json.data.me.collaborator.condos
  .filter((c) => !FILTRE || `${c.reference} ${c.name}`.toLowerCase().includes(FILTRE))
  .sort((a, b) => a.reference.localeCompare(b.reference));

console.log(`${condos.length} copro(s)${FILTRE ? ` contenant "${FILTRE}"` : ""} :`);
for (const c of condos) console.log(`  ${c.reference}  -  ${c.name}`);
