// POC REVERSIBLE : prouver l'upload multipart GraphQL (spec graphql-multipart-request)
// vers eStale. Cree un PDF de test attache au meeting (createFile), verifie sa presence,
// PUIS le supprime (deleteFile) et re-verifie l'absence. L'AG doit finir a son etat initial.
// LECTURE + 1 ecriture reversible. Ne touche QUE le meeting autorise. Aucun secret logge.
//
// Usage :
//   node --env-file=.env.local scripts/estale-upload-poc.mjs
//
// Cible autorisee par Sekou (AG future) :
//   condo   f3f6eec5-112a-433f-801c-3cbdc1195bfa
//   meeting 9ba932a3-b4f6-4402-8f2c-c2415032c01f

const EMAIL = process.env.ESTALE_EMAIL;
const PASSWORD = process.env.ESTALE_PASSWORD;
const BASE = (process.env.ESTALE_BASE_URL ?? "https://api.estale.app").replace(/\/$/, "");

const CONDO_ID = "f3f6eec5-112a-433f-801c-3cbdc1195bfa";
const MEETING_ID = "9ba932a3-b4f6-4402-8f2c-c2415032c01f";
// Categorie testee (argv[2]). Defaut = la cible demandee. INVITATION_ATTENDANCE_SHEET
// sert de diagnostic (deja presente sur cette AG future -> forcement acceptee).
const CATEGORY = (process.argv[2] ?? "TRANSCRIPT_ATTENDANCE_SHEET").trim();

if (!EMAIL || !PASSWORD) {
  console.error("ESTALE_EMAIL / ESTALE_PASSWORD manquants dans .env.local");
  process.exit(1);
}

// --- PDF de test STRUCTURELLEMENT VALIDE (avec table xref et offsets exacts) ---
// Un PDF sans xref est rejete par beaucoup de bibliotheques serveur (comptage de pages,
// generation de miniature...). On construit donc un vrai petit PDF 1 page valide.
function makeTestPdf() {
  const objs = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</Font<</F1 5 0 R>>>>/Contents 4 0 R>>",
    "<</Length 58>>\nstream\nBT /F1 18 Tf 60 760 Td (REAL31 test upload) Tj ET\nendstream",
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xrefStart = body.length;
  let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  body += xref;
  body += `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

async function login() {
  const res = await fetch(`${BASE}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login HTTP ${res.status}`);
  const cookies = res.headers.getSetCookie?.() ?? [];
  if (cookies.length === 0) throw new Error("Login : aucun cookie de session recu");
  return cookies.map((c) => c.split(";")[0]).join("; ");
}

// Appel GraphQL JSON classique (queries + mutations sans upload).
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

// Upload multipart GraphQL (spec jaydenseric/graphql-multipart-request-spec).
// extraHeaders : pour retenter avec anti-CSRF si le serveur l'exige.
async function gqlUpload(cookie, query, variables, fileField, fileBuffer, filename, extraHeaders = {}) {
  const fd = new FormData();
  // operations : l'operation GraphQL, avec le champ upload mis a null (sera injecte via map)
  fd.append("operations", JSON.stringify({ query, variables: { ...variables, [fileField]: null } }));
  // map : associe la part "0" au chemin de la variable upload
  fd.append("map", JSON.stringify({ "0": [`variables.${fileField}`] }));
  // part "0" : le binaire
  fd.append("0", new Blob([fileBuffer], { type: "application/pdf" }), filename);

  const res = await fetch(`${BASE}/graphql/intranet`, {
    method: "POST",
    // PAS de content-type : fetch pose lui-meme le boundary multipart/form-data
    headers: { cookie, ...extraHeaders },
    body: fd,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Reponse non-JSON (HTTP ${res.status}) : ${text.slice(0, 300)}`);
  }
  if (json.errors) {
    const err = new Error("GraphQL: " + json.errors.map((e) => e.message).join(" ; "));
    err.graphql = json.errors;
    err.httpStatus = res.status;
    throw err;
  }
  return json.data;
}

const DOCS_QUERY = `query Docs($condo: ID!, $meeting: ID!) {
  condo(id: $condo) {
    meeting(id: $meeting) {
      id
      isFutur
      documents { fileID category file { id filename contentType size } }
    }
  }
}`;

async function readDocs(cookie) {
  const data = await gql(cookie, DOCS_QUERY, { condo: CONDO_ID, meeting: MEETING_ID });
  return data.condo.meeting;
}

function printDocs(label, m) {
  const docs = m.documents ?? [];
  console.log(`  [${label}] documents = ${docs.length}`);
  for (const d of docs) {
    console.log(`     - fileID=${d.fileID} cat=${d.category} name=${d.file.filename} type=${d.file.contentType} size=${d.file.size}`);
  }
}

const UPLOAD_MUTATION = `mutation Up($meeting: ID!, $file: Upload!) {
  updateMeeting(id: $meeting) {
    createFile(fileCategory: ${CATEGORY}, file: $file) {
      id
      documents { fileID category file { id filename contentType size } }
    }
  }
}`;

const DELETE_MUTATION = `mutation Del($meeting: ID!, $fileID: ID!) {
  updateMeeting(id: $meeting) {
    deleteFile(fileID: $fileID) { id }
  }
}`;

// --- Deroule ---
const cookie = await login();
console.log("Login OK.\n");

const before = await readDocs(cookie);
console.log(`Meeting ${before.id} isFutur=${before.isFutur}`);
printDocs("AVANT", before);
const beforeIDs = new Set((before.documents ?? []).map((d) => d.fileID));

// 1) UPLOAD (avec fallback anti-CSRF si rejet)
const pdf = makeTestPdf();
console.log(`\nPDF de test : ${pdf.length} octets, application/pdf`);
let uploadData;
const attempts = [
  { label: "multipart nu", headers: {} },
  { label: "multipart + Apollo-Require-Preflight", headers: { "apollo-require-preflight": "true" } },
  { label: "multipart + GraphQL-Preflight", headers: { "apollo-require-preflight": "true", "x-apollo-operation-name": "Up", "graphql-require-preflight": "true" } },
];
let lastErr;
for (const a of attempts) {
  try {
    console.log(`\n>> Tentative upload : ${a.label}`);
    uploadData = await gqlUpload(cookie, UPLOAD_MUTATION, { meeting: MEETING_ID }, "file", pdf, "test-upload-real31.pdf", a.headers);
    console.log("   OK.");
    break;
  } catch (e) {
    lastErr = e;
    console.log(`   ECHEC (HTTP ${e.httpStatus ?? "?"}) : ${e.message}`);
  }
}
if (!uploadData) {
  console.error("\nUpload impossible apres toutes les tentatives. Derniere erreur ci-dessus.");
  if (lastErr?.graphql) console.error(JSON.stringify(lastErr.graphql, null, 2));
  process.exit(2);
}

const afterUploadDocs = uploadData.updateMeeting.createFile.documents ?? [];
printDocs("APRES UPLOAD (retour mutation)", { documents: afterUploadDocs });

// 2) Identifier le fichier cree (nouveau fileID)
const created = afterUploadDocs.find((d) => !beforeIDs.has(d.fileID));
if (!created) {
  console.error("\nUpload accepte mais aucun nouveau document detecte ?! On ne peut pas cibler la suppression en surete. STOP (verif manuelle requise).");
  process.exit(3);
}
console.log(`\nFichier cree : fileID=${created.fileID} name=${created.file.filename}`);

// 3) Re-lecture independante (confirme la persistence cote serveur)
const afterRead = await readDocs(cookie);
printDocs("APRES UPLOAD (relecture)", afterRead);
const stillThere = (afterRead.documents ?? []).some((d) => d.fileID === created.fileID);
console.log(`  -> fichier present a la relecture : ${stillThere}`);

// 4) SUPPRESSION (reversibilite)
console.log(`\n>> deleteFile(${created.fileID})`);
await gql(cookie, DELETE_MUTATION, { meeting: MEETING_ID, fileID: created.fileID });
console.log("   OK.");

// 5) Verif etat final == etat initial
const finalDocs = await readDocs(cookie);
printDocs("FINAL", finalDocs);
const gone = !(finalDocs.documents ?? []).some((d) => d.fileID === created.fileID);
const finalIDs = new Set((finalDocs.documents ?? []).map((d) => d.fileID));
const sameAsBefore = beforeIDs.size === finalIDs.size && [...beforeIDs].every((id) => finalIDs.has(id));

console.log("\n=== RESULTAT ===");
console.log(`  upload multipart : ${uploadData ? "OK" : "KO"}`);
console.log(`  fichier supprime : ${gone ? "OK (absent)" : "KO (encore present !)"}`);
console.log(`  AG revenue a l'etat initial : ${gone && sameAsBefore ? "OUI" : "NON (verif manuelle)"}`);
if (!(gone && sameAsBefore)) process.exit(4);
console.log("\nFini. AG remise a son etat initial.");
