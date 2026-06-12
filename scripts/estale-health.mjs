// Sante de l'integration eStale : login compte de service + query me + liste des
// condos accessibles. N'affiche aucun secret. A relancer apres tout changement
// d'identifiants ou en cas de doute sur l'API.
// Usage : node --env-file=.env.local scripts/estale-health.mjs

const BASE = (process.env.ESTALE_BASE_URL ?? "https://api.estale.app").replace(/\/$/, "");

const login = await fetch(`${BASE}/api/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: process.env.ESTALE_EMAIL, password: process.env.ESTALE_PASSWORD }),
});
if (!login.ok) {
  console.error(`Login KO (HTTP ${login.status})`);
  process.exit(1);
}
const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
console.log("Login OK (cookie de session obtenu)");

const res = await fetch(`${BASE}/graphql/intranet`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie },
  body: JSON.stringify({
    query: `{
      me {
        fullname
        collaborator {
          role
          nbCondo
          condos(archived: false) { id name reference }
        }
      }
    }`,
  }),
});
const { data, errors } = await res.json();
if (errors?.length) {
  console.error("Erreurs GraphQL:", errors.map((e) => e.message).join(" ; "));
  process.exit(1);
}
const me = data.me;
console.log(`me : ${me.fullname} | role collaborateur : ${me.collaborator.role} | nbCondo : ${me.collaborator.nbCondo}`);
console.log("Condos accessibles :");
for (const c of me.collaborator.condos) {
  console.log(`  ${c.reference} | ${c.name} | id=${c.id}`);
}
