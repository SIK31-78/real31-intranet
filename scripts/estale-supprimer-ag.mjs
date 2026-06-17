// ECRITURE : supprime une AG (Meeting) par son id. Garde-fou --go (dry-run sinon).
// Usage : node --env-file=.env.local scripts/estale-supprimer-ag.mjs <meetingId> [--go]

const EMAIL = process.env.ESTALE_EMAIL;
const PASSWORD = process.env.ESTALE_PASSWORD;
const BASE = (process.env.ESTALE_BASE_URL ?? "https://api.estale.app").replace(/\/$/, "");
const GO = process.argv.includes("--go");
const ID = process.argv.find((a) => /^[0-9a-f-]{36}$/i.test(a));
if (!ID) {
  console.error("Donne l'id de l'AG a supprimer.");
  process.exit(1);
}

async function login() {
  const res = await fetch(`${BASE}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login HTTP ${res.status}`);
  return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}
async function gql(cookie, query, variables) {
  const res = await fetch(`${BASE}/graphql/intranet`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ query, ...(variables ? { variables } : {}) }),
  });
  const json = await res.json();
  if (json.errors) throw new Error("GraphQL: " + json.errors.map((e) => e.message).join(" ; "));
  return json.data;
}

const cookie = await login();
if (!GO) {
  console.log(`[DRY-RUN] Supprimerait l'AG ${ID}. Relancer avec --go.`);
  process.exit(0);
}
const data = await gql(cookie, `mutation($id: ID!) { updateMeeting(id: $id) { delete { id reference name } } }`, {
  id: ID,
});
console.log(`[SUPPRIME] AG ${ID} retiree. Copro : ${data.updateMeeting.delete.reference} - ${data.updateMeeting.delete.name}`);
