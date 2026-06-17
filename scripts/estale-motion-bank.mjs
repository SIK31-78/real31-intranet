// Exploration LECTURE SEULE de la bibliotheque de resolutions eStale ("motion bank").
// Confirme l'acces via le compte de service et resume le contenu (sans aucun secret).
// Usage : node --env-file=.env.local scripts/estale-motion-bank.mjs

const EMAIL = process.env.ESTALE_EMAIL;
const PASSWORD = process.env.ESTALE_PASSWORD;
const BASE = (process.env.ESTALE_BASE_URL ?? "https://api.estale.app").replace(/\/$/, "");
if (!EMAIL || !PASSWORD) {
  console.error("ESTALE_EMAIL / ESTALE_PASSWORD manquants dans .env.local");
  process.exit(1);
}

async function login() {
  const res = await fetch(`${BASE}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login HTTP ${res.status}`);
  const cookies = res.headers.getSetCookie?.() ?? [];
  if (!cookies.length) throw new Error("Aucun cookie de session");
  return cookies.map((c) => c.split(";")[0]).join("; ");
}

async function gql(cookie, query) {
  const res = await fetch(`${BASE}/graphql/intranet`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ query }),
  });
  const json = await res.json();
  if (json.errors) throw new Error("GraphQL: " + json.errors.map((e) => e.message).join(" ; "));
  return json.data;
}

function resume(titre, items) {
  console.log(`\n=== ${titre} : ${items?.length ?? 0} resolutions ===`);
  if (!items?.length) return;
  const parMajorite = {};
  for (const it of items) parMajorite[it.majority] = (parMajorite[it.majority] ?? 0) + 1;
  console.log("  Par majorite :", JSON.stringify(parMajorite));
  console.log("  Defaut (isDefault) :", items.filter((i) => i.isDefault).length);
  console.log("  Echantillon (10 premiers) :");
  for (const it of items.slice(0, 10)) {
    console.log(`   - [${it.majority}]${it.isDefault ? " (defaut)" : ""} ${it.title}`);
  }
}

const cookie = await login();
console.log("Login OK (cookie non affiche).");

const data = await gql(
  cookie,
  `query {
    me {
      collaborator {
        motionsBank { id type title majority isDefault keywords }
        establishment { motionsBank { id type title majority isDefault keywords } }
      }
    }
  }`,
);

const collab = data?.me?.collaborator;
resume("Bank COLLABORATEUR (mes resolutions)", collab?.motionsBank);
resume("Bank ETABLISSEMENT (cabinet REAL31)", collab?.establishment?.motionsBank);
