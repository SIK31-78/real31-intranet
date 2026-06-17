// ECRITURE REELLE dans eStale (cf. ADR-024) : cree UNE AG de test sur la copro test
// (S299 par defaut), rattachee a l'exercice courant, cle par defaut, participant = moi.
// Garde-fou : n'ecrit QUE si on passe --go. Sans --go = dry-run (montre l'input, n'ecrit rien).
// L'AG est clairement nommee "TEST INTRANET" et supprimable dans eStale.
// Usage : node --env-file=.env.local scripts/estale-creer-ag-test.mjs [REF=S299] [--go]

const EMAIL = process.env.ESTALE_EMAIL;
const PASSWORD = process.env.ESTALE_PASSWORD;
const BASE = (process.env.ESTALE_BASE_URL ?? "https://api.estale.app").replace(/\/$/, "");
const GO = process.argv.includes("--go");
const REF = (process.argv.find((a) => /^[A-Za-z]+\d+$/.test(a)) ?? "S299").trim();
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

// Resolution live de toutes les pieces (rien d'ecrit ici).
const moi = await gql(cookie, `{ me { collaborator { id condos(archived: false) { id reference } } } }`);
const collabId = moi.me.collaborator.id;
const condo = moi.me.collaborator.condos.find((c) => normaliserRef(c.reference) === normaliserRef(REF));
if (!condo) throw new Error(`Copro ${REF} introuvable.`);

const data = await gql(
  cookie,
  `query($id: ID!) { condo(id: $id) {
     dks { id name isDefault }
     accountingV2 { exercices { id period } }
  } }`,
  { id: condo.id },
);
const dkDefaut = data.condo.dks.find((k) => k.isDefault) ?? data.condo.dks[0];
const ex2026 = data.condo.accountingV2.exercices.find((e) => String(e.period?.[0] ?? "").startsWith("2026"));

const input = {
  condoID: condo.id,
  accountingID: ex2026?.id,
  dkID: dkDefaut?.id,
  name: "TEST INTRANET - a supprimer (mode CS)",
  category: "ORDINARY",
  participantsIDs: [collabId],
};

console.log("Input createMeeting qui SERAIT envoye :");
console.log(JSON.stringify({ ...input, _dk: dkDefaut?.name, _exercice: ex2026?.period }, null, 2));

if (!GO) {
  console.log("\n[DRY-RUN] Aucune ecriture. Relancer avec --go pour creer reellement l'AG.");
  process.exit(0);
}

const res = await gql(
  cookie,
  `mutation Creer($input: MeetingCreateInput!) {
     createMeeting(input: $input) { id name category startAt motions { id } }
  }`,
  { input },
);
console.log("\n[ECRIT] AG creee :");
console.log(JSON.stringify(res.createMeeting, null, 2));
console.log("\n-> Verifie dans eStale (copro " + REF + ") et supprime-la quand tu veux.");
