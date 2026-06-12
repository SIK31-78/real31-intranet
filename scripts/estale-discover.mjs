// Decouverte des endpoints eStale : teste les combinaisons login + GraphQL
// plausibles et indique lesquelles repondent. N'affiche AUCUN secret (ni email,
// ni mot de passe, ni valeur de cookie - uniquement statuts et noms).
// Usage : node --env-file=.env.local scripts/estale-discover.mjs

const EMAIL = process.env.ESTALE_EMAIL;
const PASSWORD = process.env.ESTALE_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error("ESTALE_EMAIL / ESTALE_PASSWORD manquants dans .env.local");
  process.exit(1);
}

const BASES = [...new Set([process.env.ESTALE_BASE_URL, "https://estale.app", "https://api.estale.app"].filter(Boolean))]
  .map((b) => b.replace(/\/$/, ""));
const LOGIN_PATHS = ["/api/login", "/login", "/intranet-api/login", "/api/v1/login"];
const GQL_PATHS = ["/intranet-gql/", "/intranet-gql", "/graphql/intranet", "/graphql"];

function cookieNames(setCookies) {
  return setCookies.map((c) => c.split("=")[0]).join(", ");
}

async function tryLogin(base, path) {
  try {
    const res = await fetch(base + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
      redirect: "manual",
    });
    const setCookies = res.headers.getSetCookie?.() ?? [];
    const ct = res.headers.get("content-type") ?? "";
    let extrait = "";
    if (ct.includes("json")) {
      const body = await res.text();
      extrait = body.slice(0, 120).replace(/[\r\n]/g, " ");
    }
    return { status: res.status, cookies: setCookies, ct, extrait };
  } catch (e) {
    return { erreur: e.message };
  }
}

async function tryGql(base, path, cookie) {
  try {
    const res = await fetch(base + path, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ query: "{ me { __typename } }" }),
    });
    const body = (await res.text()).slice(0, 200).replace(/[\r\n]/g, " ");
    return { status: res.status, body };
  } catch (e) {
    return { erreur: e.message };
  }
}

let session = null; // { base, cookie }

for (const base of BASES) {
  console.log(`\n=== BASE ${base} ===`);
  for (const lp of LOGIN_PATHS) {
    const r = await tryLogin(base, lp);
    if (r.erreur) { console.log(`  LOGIN ${lp} -> erreur reseau: ${r.erreur}`); continue; }
    const ok = r.status >= 200 && r.status < 300 && r.cookies.length > 0;
    console.log(`  LOGIN ${lp} -> HTTP ${r.status}${r.cookies.length ? ` | cookies: ${cookieNames(r.cookies)}` : ""}${r.extrait ? ` | corps: ${r.extrait}` : ""}${ok ? "  <== CANDIDAT" : ""}`);
    if (ok && !session) {
      session = { base, cookie: r.cookies.map((c) => c.split(";")[0]).join("; ") };
    }
  }
}

console.log("\n=== GRAPHQL (avec session si obtenue, sinon a blanc) ===");
for (const base of BASES) {
  for (const gp of GQL_PATHS) {
    const cookie = session && session.base === base ? session.cookie : undefined;
    const r = await tryGql(base, gp, cookie);
    if (r.erreur) { console.log(`  GQL ${base}${gp} -> erreur reseau: ${r.erreur}`); continue; }
    console.log(`  GQL ${base}${gp}${cookie ? " (cookie)" : ""} -> HTTP ${r.status} | ${r.body}`);
  }
}
console.log(session ? `\nSession obtenue sur ${session.base} (cookies non affiches).` : "\nAucun login reussi : verifier identifiants / endpoints.");
