// PILOTE JETABLE - E2E signature electronique (Temps 1). Ecritures REELLES eStale sur SE999.
// Sous-commandes (une a la fois, on observe l'etat entre chaque) :
//   create                         -> createMeeting "TEST-E2E-SIGNATURE" sur SE999, imprime meetingID
//   state <mid>                    -> etat complet (lecture seule)
//   setstart <mid> [ISO]           -> update(start=ISO|maintenant-1h) pour sortir du futur / demarrer
//   end <mid> [ISO]                -> transcript.setEnd(end=ISO|maintenant)
//   validate <mid>                 -> transcript.validate
//   froze <mid>                    -> transcript.froze
//   close <mid>                    -> close
//   setbody <mid>                  -> transcript.setBody(PDF bidon) puis relit signedBodyURL
//   clearbody <mid>                -> transcript.setBody(null) (retire le PV signe)
//   createfile <mid> <CATEGORY>    -> updateMeeting.createFile(CATEGORY, PDF bidon)
//   deletefile <mid> <fileID>      -> updateMeeting.deleteFile
//   download <mid> <outdir>        -> telecharge attendanceSheetURL + bodyURL (+ signedBodyURL) en PDF
// Usage : node --env-file=.env.local scripts/estale-e2e-signature.mjs <cmd> ...
// Copro test SE999 : f3f6eec5-112a-433f-801c-3cbdc1195bfa

import { writeFileSync } from "node:fs";

const EMAIL = process.env.ESTALE_EMAIL;
const PASSWORD = process.env.ESTALE_PASSWORD;
const BASE = (process.env.ESTALE_BASE_URL ?? "https://api.estale.app").replace(/\/$/, "");
const CONDO_ID = "f3f6eec5-112a-433f-801c-3cbdc1195bfa";

if (!EMAIL || !PASSWORD) { console.error("ESTALE_EMAIL / ESTALE_PASSWORD manquants"); process.exit(1); }

const [cmd, ...rest] = process.argv.slice(2);

function makeTestPdf(label = "REAL31 TEST-E2E") {
  const objs = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</Font<</F1 5 0 R>>>>/Contents 4 0 R>>",
    `<</Length ${40 + label.length}>>\nstream\nBT /F1 18 Tf 60 760 Td (${label}) Tj ET\nendstream`,
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(body.length); body += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xrefStart = body.length;
  let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  body += xref + `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF\n`;
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
  if (!cookies.length) throw new Error("Login : aucun cookie");
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

async function gqlUpload(cookie, query, variables, filePath, fileBuffer, filename) {
  const fd = new FormData();
  fd.append("operations", JSON.stringify({ query, variables: { ...variables, [filePath]: null } }));
  fd.append("map", JSON.stringify({ "0": [`variables.${filePath}`] }));
  fd.append("0", new Blob([fileBuffer], { type: "application/pdf" }), filename);
  const res = await fetch(`${BASE}/graphql/intranet`, { method: "POST", headers: { cookie }, body: fd });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { throw new Error(`non-JSON (HTTP ${res.status}): ${text.slice(0, 300)}`); }
  if (json.errors) { const e = new Error("GraphQL: " + json.errors.map((x) => x.message).join(" ; ")); e.httpStatus = res.status; throw e; }
  return json.data;
}

const STATE_Q = `query S($condo: ID!, $m: ID!) { condo(id:$condo){ reference meeting(id:$m){
  id name category mode startAt endAt
  isStarted isEnded isClosed isFutur canVote canClose canUnClose isVoteStarted isDeletable
  nbAttendances participants{ id } dk{ id name } accounting{ id }
  documents{ fileID category file{ id filename contentType size } }
  transcript{ validated canValidate canUnvalidate canFroze isFrozing isHandSigned isDigitallySigned
    bodyURL signedBodyURL attendanceSheetURL previewURL individualLetterURL note } } } }`;

async function readState(cookie, mid) {
  const d = await gql(cookie, STATE_Q, { condo: CONDO_ID, m: mid });
  return { ref: d.condo.reference, m: d.condo.meeting };
}

function printState({ ref, m }) {
  const t = m.transcript;
  console.log(`COPRO ${ref} | AG "${m.name}" (${m.category}/${m.mode}) id=${m.id}`);
  console.log(`  start=${m.startAt ?? "-"} end=${m.endAt ?? "-"}`);
  console.log(`  isFutur=${m.isFutur} isStarted=${m.isStarted} isEnded=${m.isEnded} isClosed=${m.isClosed} isVoteStarted=${m.isVoteStarted}`);
  console.log(`  canVote=${m.canVote} canClose=${m.canClose} canUnClose=${m.canUnClose} isDeletable=${m.isDeletable} nbAttendances=${m.nbAttendances}`);
  console.log(`  transcript: validated=${t.validated} canValidate=${t.canValidate} canFroze=${t.canFroze} isFrozing=${t.isFrozing} isHandSigned=${t.isHandSigned} isDigitallySigned=${t.isDigitallySigned}`);
  console.log(`  bodyURL=${t.bodyURL ? "REMPLI" : "vide"} signedBodyURL=${t.signedBodyURL ? "REMPLI" : "vide"} attendanceSheetURL=${t.attendanceSheetURL ? "REMPLI" : "vide"}`);
  console.log(`  documents(${(m.documents ?? []).length}):`);
  for (const doc of m.documents ?? []) console.log(`     - fileID=${doc.fileID} cat=${doc.category} name=${doc.file.filename} type=${doc.file.contentType} size=${doc.file.size}`);
}

const cookie = await login();

if (cmd === "create") {
  const moi = await gql(cookie, `{ me { collaborator { id condos(archived:false){ id reference } } } }`);
  const collabId = moi.me.collaborator.id;
  const condo = moi.me.collaborator.condos.find((c) => c.id === CONDO_ID);
  if (!condo) throw new Error("SE999 introuvable dans mes copros");
  const d = await gql(cookie, `query($id:ID!){ condo(id:$id){ dks{ id name isDefault } accountingV2{ exercices{ id period } } } }`, { id: CONDO_ID });
  const dk = d.condo.dks.find((k) => k.isDefault) ?? d.condo.dks[0];
  const exs = d.condo.accountingV2.exercices;
  const ex = exs.find((e) => String(e.period?.[0] ?? "").startsWith("2026")) ?? exs[exs.length - 1];
  const input = { condoID: CONDO_ID, accountingID: ex?.id, dkID: dk?.id, name: "TEST-E2E-SIGNATURE", category: "ORDINARY", participantsIDs: [collabId] };
  console.log("Input:", JSON.stringify({ ...input, _dk: dk?.name, _ex: ex?.period }, null, 2));
  const res = await gql(cookie, `mutation C($input: MeetingCreateInput!){ createMeeting(input:$input){ id name category startAt } }`, { input });
  console.log("\n[CREE]", JSON.stringify(res.createMeeting, null, 2));
  console.log("\nmeetingID =", res.createMeeting.id);
} else if (cmd === "state") {
  printState(await readState(cookie, rest[0]));
} else if (cmd === "setstart") {
  const mid = rest[0];
  const iso = rest[1] ?? new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { m } = await readState(cookie, mid);
  const input = { name: m.name, mode: m.mode, start: iso, dkID: m.dk.id, participantsIDs: (m.participants ?? []).map((p) => p.id) };
  console.log("update input:", JSON.stringify(input));
  await gql(cookie, `mutation U($id:ID!,$input:MeetingUpdateInput!){ updateMeeting(id:$id){ update(input:$input){ id startAt isFutur isStarted } } }`, { id: mid, input });
  printState(await readState(cookie, mid));
} else if (cmd === "end") {
  const mid = rest[0];
  const iso = rest[1] ?? new Date().toISOString();
  await gql(cookie, `mutation E($id:ID!,$end:Timestamptz!){ updateMeeting(id:$id){ transcript{ setEnd(end:$end){ id endAt isEnded } } } }`, { id: mid, end: iso });
  printState(await readState(cookie, mid));
} else if (cmd === "validate") {
  await gql(cookie, `mutation V($id:ID!){ updateMeeting(id:$id){ transcript{ validate{ id } } } }`, { id: rest[0] });
  printState(await readState(cookie, rest[0]));
} else if (cmd === "froze") {
  await gql(cookie, `mutation F($id:ID!){ updateMeeting(id:$id){ transcript{ froze{ id } } } }`, { id: rest[0] });
  printState(await readState(cookie, rest[0]));
} else if (cmd === "close") {
  await gql(cookie, `mutation C($id:ID!){ updateMeeting(id:$id){ close{ id isClosed } } }`, { id: rest[0] });
  printState(await readState(cookie, rest[0]));
} else if (cmd === "setbody") {
  const mid = rest[0];
  const pdf = makeTestPdf("REAL31 TEST-E2E PV signe (bidon)");
  await gqlUpload(cookie, `mutation SB($id:ID!,$file:Upload){ updateMeeting(id:$id){ transcript{ setBody(file:$file){ id transcript{ signedBodyURL isHandSigned } } } } }`, { id: mid }, "file", pdf, "test-pv-signe.pdf");
  console.log("setBody OK.");
  printState(await readState(cookie, mid));
} else if (cmd === "clearbody") {
  await gql(cookie, `mutation CB($id:ID!){ updateMeeting(id:$id){ transcript{ setBody(file:null){ id transcript{ signedBodyURL } } } } }`, { id: rest[0] });
  console.log("clearbody OK."); printState(await readState(cookie, rest[0]));
} else if (cmd === "createfile") {
  const mid = rest[0]; const cat = rest[1];
  const pdf = makeTestPdf(`REAL31 TEST-E2E ${cat} (bidon)`);
  const q = `mutation CF($id:ID!,$file:Upload!){ updateMeeting(id:$id){ createFile(fileCategory:${cat}, file:$file){ id documents{ fileID category file{ filename contentType size } } } } }`;
  const d = await gqlUpload(cookie, q, { id: mid }, "file", pdf, `test-${cat}.pdf`);
  const docs = d.updateMeeting.createFile.documents ?? [];
  console.log(`createfile ${cat} OK. documents=${docs.length}`);
  for (const doc of docs) console.log(`   - fileID=${doc.fileID} cat=${doc.category} name=${doc.file.filename}`);
} else if (cmd === "deletefile") {
  await gql(cookie, `mutation DF($id:ID!,$f:ID!){ updateMeeting(id:$id){ deleteFile(fileID:$f){ id } } }`, { id: rest[0], f: rest[1] });
  console.log("deletefile OK.");
} else if (cmd === "download") {
  const mid = rest[0]; const outdir = rest[1] ?? ".";
  const { m } = await readState(cookie, mid);
  const t = m.transcript;
  const targets = [
    ["attendance-sheet", t.attendanceSheetURL],
    ["body-pv", t.bodyURL],
    ["signed-body", t.signedBodyURL],
    ["preview", t.previewURL],
  ];
  for (const [name, url] of targets) {
    if (!url) { console.log(`  ${name}: (vide, saute)`); continue; }
    const full = url.startsWith("http") ? url : `${BASE}${url}`;
    const res = await fetch(full, { headers: { cookie } });
    const buf = Buffer.from(await res.arrayBuffer());
    const magic = buf.slice(0, 5).toString("latin1");
    const out = `${outdir}/e2e-${name}.pdf`;
    writeFileSync(out, buf);
    console.log(`  ${name}: HTTP ${res.status} ${buf.length}o magic="${magic}" -> ${out}`);
  }
} else {
  console.error("cmd inconnue:", cmd);
  process.exit(1);
}
