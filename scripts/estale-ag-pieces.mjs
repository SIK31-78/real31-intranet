// LECTURE SEULE : sort, pour une copro, les pieces necessaires a la creation d'une AG
// (collaborateur, cles de repartition, exercices, AG existantes / template). Aucun write.
// Usage : node --env-file=.env.local scripts/estale-ag-pieces.mjs [REFERENCE=S299]

const EMAIL = process.env.ESTALE_EMAIL;
const PASSWORD = process.env.ESTALE_PASSWORD;
const BASE = (process.env.ESTALE_BASE_URL ?? "https://api.estale.app").replace(/\/$/, "");
const REF = (process.argv[2] ?? "S299").trim();
if (!EMAIL || !PASSWORD) {
  console.error("ESTALE_EMAIL / ESTALE_PASSWORD manquants dans .env.local");
  process.exit(1);
}

function normaliserRef(ref) {
  const m = ref.trim().toUpperCase().match(/^([A-Z]+)0*(\d+)$/);
  return m ? `${m[1]}${m[2]}` : ref.trim().toUpperCase();
}

async function login() {
  const res = await fetch(`${BASE}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login HTTP ${res.status}`);
  const cookies = res.headers.getSetCookie?.() ?? [];
  return cookies.map((c) => c.split(";")[0]).join("; ");
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
console.log("Login OK.\n");

// 1. Collaborateur + resolution de la copro par reference.
const moi = await gql(cookie, `{ me { collaborator { id condos(archived: false) { id reference } } } }`);
const collabId = moi.me.collaborator.id;
const cible = normaliserRef(REF);
const condo = moi.me.collaborator.condos.find((c) => normaliserRef(c.reference) === cible);
console.log(`Collaborateur (participant) id : ${collabId}`);
if (!condo) {
  console.error(`Copro ${REF} introuvable dans mes condos eStale.`);
  process.exit(1);
}
console.log(`Copro ${REF} -> condoID ${condo.id}\n`);

// 2. Cles de repartition, exercices, AG existantes.
const data = await gql(
  cookie,
  `query Pieces($id: ID!) {
    condo(id: $id) {
      dks { id name code isDefault }
      accountingV2 { periodCurrent exercices { id period } }
      meetings { id name category startAt motions { id } }
    }
  }`,
  { id: condo.id },
);

const c = data.condo;

console.log("=== Cles de repartition (dks) ===");
for (const k of c.dks) {
  console.log(`  ${k.isDefault ? "*" : " "} [${k.code}] ${k.name}  (id ${k.id})`);
}

console.log("\n=== Exercices comptables ===");
console.log(`  periodCurrent : ${JSON.stringify(c.accountingV2.periodCurrent)}`);
for (const e of c.accountingV2.exercices) {
  console.log(`  ${JSON.stringify(e.period)}  id ${e.id}`);
}

console.log("\n=== AG existantes (chercher ton template) ===");
for (const m of c.meetings) {
  console.log(`  [${m.category}] "${m.name}"  debut ${m.startAt ?? "-"}  ${m.motions.length} motions  (id ${m.id})`);
}
