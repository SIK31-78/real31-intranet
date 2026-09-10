// PILOTE JETABLE OneSpan - cérémonie in-person PROD "Real 31" (SES simple, stylet CAPTURE).
// Suit la séquence VALIDÉE docs/onespan-signature-electronique.md §4bis. NE LOGGUE AUCUN token/secret.
// Sous-commandes :
//   account                         -> GET /api/account (où on est)
//   create <pdf> [pdf2...]          -> POST /api/packages multipart (SENT, inPerson, bureau, CAPTURE) -> packageID + rôles
//   roles <packageId>               -> liste les rôles (id/type/index) du package
//   url <packageId> [roleId]        -> GET signingUrl du rôle SENDER (ou roleId donné) -> URL cérémonie tablette
//   delete <packageId>              -> DELETE /api/packages/{id}
// Usage : node --env-file=.env.local scripts/onespan-ceremonie.mjs <cmd> ...

import { readFileSync } from "node:fs";
import { basename } from "node:path";

const ID_CLIENT = process.env.ONESPAN_ID_CLIENT;
const API_KEY = process.env.ONESPAN_API_KEY; // = le SECRET, ne jamais logger
const TOKEN_URL = "https://apps.esignlive.eu/oauth2/token";
const API = "https://apps.esignlive.eu/api";

if (!ID_CLIENT || !API_KEY) { console.error("ONESPAN_ID_CLIENT / ONESPAN_API_KEY manquants"); process.exit(1); }

const [cmd, ...rest] = process.argv.slice(2);

async function token() {
  const basic = Buffer.from(`${ID_CLIENT}:${API_KEY}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`token HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  if (!j.access_token) throw new Error("pas d'access_token");
  return j.access_token; // JAMAIS logué
}

async function api(tok, path, opts = {}) {
  const res = await fetch(`${API}${path}`, { ...opts, headers: { Authorization: `Bearer ${tok}`, Accept: "application/json", ...(opts.headers ?? {}) } });
  const text = await res.text();
  let j; try { j = text ? JSON.parse(text) : {}; } catch { j = { _raw: text.slice(0, 300) }; }
  if (!res.ok) { const e = new Error(`${path} HTTP ${res.status}: ${JSON.stringify(j).slice(0, 300)}`); e.status = res.status; throw e; }
  return j;
}

const BUREAU = [
  { id: "president", label: "Président", email: "president.se999@real31.fr", firstName: "President", lastName: "TEST-SE999" },
  { id: "secretaire", label: "Secrétaire", email: "secretaire.se999@real31.fr", firstName: "Secretaire", lastName: "TEST-SE999" },
  { id: "scrutateur", label: "Scrutateur", email: "scrutateur.se999@real31.fr", firstName: "Scrutateur", lastName: "TEST-SE999" },
];

const tok = await token();

if (cmd === "account") {
  const a = await api(tok, "/account");
  console.log("Compte OneSpan :", JSON.stringify({ name: a.name, id: a.id }, null, 2));
} else if (cmd === "create") {
  const pdfPaths = rest.length ? rest : [];
  if (!pdfPaths.length) { console.error("donne au moins 1 PDF"); process.exit(1); }
  const short = Math.random().toString(36).slice(2, 7);
  const documents = pdfPaths.map((p, di) => ({
    id: `doc${di + 1}`,
    name: basename(p),
    // chaque membre du bureau signe le document à une position différente (stylet)
    approvals: BUREAU.map((b, ri) => ({
      role: b.id,
      fields: [{ type: "SIGNATURE", subtype: "CAPTURE", page: 0, left: 60, top: 600 + ri * 60, width: 200, height: 50 }],
    })),
  }));
  const payload = {
    name: `TEST-E2E-REAL31-${short}`,
    type: "PACKAGE",
    status: "SENT",
    settings: { ceremony: { inPerson: true } },
    roles: BUREAU.map((b, i) => ({
      id: b.id,
      index: i + 1,
      type: "SIGNER",
      signers: [{ email: b.email, firstName: b.firstName, lastName: b.lastName }],
    })),
    documents,
  };
  const fd = new FormData();
  fd.append("payload", JSON.stringify(payload));
  for (const p of pdfPaths) fd.append("file", new Blob([readFileSync(p)], { type: "application/pdf" }), basename(p));
  const res = await fetch(`${API}/packages`, { method: "POST", headers: { Authorization: `Bearer ${tok}`, Accept: "application/json" }, body: fd });
  const text = await res.text();
  let j; try { j = JSON.parse(text); } catch { j = { _raw: text.slice(0, 400) }; }
  if (!res.ok) { console.error(`POST /packages HTTP ${res.status}: ${JSON.stringify(j).slice(0, 400)}`); process.exit(2); }
  const pkgId = j.id ?? j.packageId ?? j.package;
  console.log(`[CRÉÉ] package "${payload.name}"  documents=${pdfPaths.length}  inPerson=true  status=SENT`);
  console.log("packageID =", pkgId);
  const roles = await api(tok, `/packages/${pkgId}/roles`);
  console.log("\nRôles :");
  for (const r of (roles.results ?? roles.roles ?? roles ?? [])) {
    const t = (r.type ?? (r.signers?.length ? "SIGNER" : "?"));
    console.log(`  id=${r.id}  type=${t}  index=${r.index}  name=${r.name ?? r.signers?.[0]?.firstName ?? ""}`);
  }
} else if (cmd === "roles") {
  const roles = await api(tok, `/packages/${rest[0]}/roles`);
  for (const r of (roles.results ?? roles.roles ?? roles ?? [])) {
    console.log(`  id=${r.id}  type=${r.type ?? (r.signers?.length ? "SIGNER" : "?")}  index=${r.index}  name=${r.name ?? r.signers?.[0]?.firstName ?? ""}`);
  }
} else if (cmd === "url") {
  const pkgId = rest[0];
  let roleId = rest[1];
  if (!roleId) {
    const roles = await api(tok, `/packages/${pkgId}/roles`);
    const list = roles.results ?? roles.roles ?? roles ?? [];
    const sender = list.find((r) => (r.type ?? "").toUpperCase().includes("SENDER")) ?? list.find((r) => r.index === 0);
    if (!sender) { console.error("rôle SENDER introuvable. Rôles:", JSON.stringify(list.map((r) => ({ id: r.id, type: r.type, index: r.index })))); process.exit(3); }
    roleId = sender.id;
    console.log(`Rôle SENDER détecté : id=${roleId} type=${sender.type} index=${sender.index}`);
  }
  const s = await api(tok, `/packages/${pkgId}/roles/${roleId}/signingUrl`);
  console.log("\n>>> URL CÉRÉMONIE (auto-login, à ouvrir sur la tablette) :");
  console.log(s.url ?? JSON.stringify(s));
} else if (cmd === "delete") {
  await api(tok, `/packages/${rest[0]}`, { method: "DELETE" });
  console.log("package supprimé :", rest[0]);
} else {
  console.error("cmd inconnue:", cmd);
  process.exit(1);
}
