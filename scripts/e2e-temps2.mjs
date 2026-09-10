// TEMPS 2 du test E2E signature : recupere le PDF signe sur OneSpan (package prod)
// puis le reinjecte dans l'AG eStale test via transcript.setBody, et verifie
// signedBodyURL. Aucun secret/token logge.
//   node --env-file=.env.local scripts/e2e-temps2.mjs
const OS_PKG = "oJCEqqRVs23MGk9Ick-LDpNA7Zc=";
const MEETING = "eb66061d-b942-40c6-bd48-f42e00e41227";
const OS = "https://apps.esignlive.eu";
const EBASE = (process.env.ESTALE_BASE_URL ?? "https://api.estale.app").replace(/\/$/, "");

const isPdf = (b) => Buffer.from(b.slice(0, 5)).toString() === "%PDF-";

// --- 1) OneSpan : token + statut + download du PDF signe ---
const basic = Buffer.from(`${process.env.ONESPAN_ID_CLIENT}:${process.env.ONESPAN_API_KEY}`).toString("base64");
const tok = (await (await fetch(`${OS}/oauth2/token`, {
  method: "POST",
  headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
  body: "grant_type=client_credentials",
})).json()).access_token;
const A = { Authorization: `Bearer ${tok}` };
const pkg = await (await fetch(`${OS}/api/packages/${OS_PKG}`, { headers: A })).json();
console.log("OneSpan package statut :", pkg.status);
const docId = (pkg.documents || [])[0]?.id;
const signed = Buffer.from(await (await fetch(`${OS}/api/packages/${OS_PKG}/documents/${docId}/pdf`, { headers: A })).arrayBuffer());
console.log(`PDF signe telecharge : ${signed.length} o, %PDF=${isPdf(signed)}`);

// --- 2) eStale : login ---
const lr = await fetch(`${EBASE}/api/login`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: process.env.ESTALE_EMAIL, password: process.env.ESTALE_PASSWORD }),
});
const cookie = (lr.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

async function readTranscript() {
  const q = `query($c:ID!,$m:ID!){ condo(id:$c){ meeting(id:$m){ transcript{ signedBodyURL isHandSigned validated } } } }`;
  const r = await fetch(`${EBASE}/graphql/intranet`, {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ query: q, variables: { c: "f3f6eec5-112a-433f-801c-3cbdc1195bfa", m: MEETING } }),
  });
  return (await r.json()).data.condo.meeting.transcript;
}

const before = await readTranscript();
console.log(`\nAVANT  -> signedBodyURL=${before.signedBodyURL ? "REMPLI" : "(vide)"}  isHandSigned=${before.isHandSigned}`);

// --- 3) setBody(le vrai PDF signe) en multipart GraphQL ---
const mut = `mutation SB($m:ID!,$file:Upload){ updateMeeting(id:$m){ transcript{ setBody(file:$file){ transcript{ signedBodyURL isHandSigned } } } } }`;
const fd = new FormData();
fd.append("operations", JSON.stringify({ query: mut, variables: { m: MEETING, file: null } }));
fd.append("map", JSON.stringify({ "0": ["variables.file"] }));
fd.append("0", new Blob([signed], { type: "application/pdf" }), "pv-signe-onespan.pdf");
const up = await fetch(`${EBASE}/graphql/intranet`, { method: "POST", headers: { cookie }, body: fd });
const upj = await up.json();
if (upj.errors) { console.error("setBody ERREUR:", upj.errors.map((e) => e.message).join(" ; ")); process.exit(1); }
console.log("setBody envoye (PDF signe OneSpan).");

const after = await readTranscript();
console.log(`APRES  -> signedBodyURL=${after.signedBodyURL ? "REMPLI" : "(vide)"}  isHandSigned=${after.isHandSigned}`);
console.log(after.signedBodyURL && after.isHandSigned
  ? "\n✅ CHAINE COMPLETE : signe sur tablette (OneSpan) -> reinjecte dans eStale -> signedBodyURL rempli."
  : "\n⚠️ signedBodyURL non rempli, a investiguer.");
