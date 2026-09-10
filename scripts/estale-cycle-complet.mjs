// PILOTE JETABLE - Cycle de vie complet d'une AG eStale par l'API (SE999).
// Ecritures REELLES. Sous-commandes (une a la fois, on observe l'etat entre chaque).
//   create                         -> createMeeting "TEST-CYCLE-COMPLET", imprime meetingID
//   state <mid>                    -> etat complet (lecture seule) : meeting + invitation + transcript + motions + owners + attendances + votes
//   owners <mid>                   -> liste les ownerID des coproprietaires (pour presences/votes)
//   addmotion <mid> [titre] [maj]  -> createMotion (type generic) votable
//   setstart <mid> [ISO]           -> update(start passe) pour demarrer
//   invvalidate <mid>              -> updateMeeting.invitation.validate (valide la convocation)
//   invfroze <mid>                 -> updateMeeting.invitation.froze
//   invsend <mid>                  -> updateMeeting.invitation.send(tous les owners)
//   present <mid> <ownerID>        -> createAttendancePresent
//   represented <mid> <ownerID> <repID> [white] -> createAttendanceRepresented (repID = owner representant)
//   openvotes <mid>                -> ouvre le vote de TOUTES les motions (updateMotion.open)
//   vote <mid> <status>            -> upsertVotes(status) pour TOUS les owners sur TOUTES les motions (AGREED/AGAINST/ABSTAIN)
//   closevotes <mid>               -> ferme le vote de toutes les motions (updateMotion.close)
//   end <mid> [ISO]                -> transcript.setEnd
//   validatepv <mid>              -> transcript.validate  (vise validated=true)
//   frozepv <mid>                  -> transcript.froze
//   close <mid>                    -> close
//   createfile <mid> <CATEGORY>    -> updateMeeting.createFile(CATEGORY, PDF bidon)
//   deletefile <mid> <fileID>      -> updateMeeting.deleteFile
//   delete <mid>                   -> updateMeeting.delete (supprime l'AG)
// Usage : node --env-file=.env.local scripts/estale-cycle-complet.mjs <cmd> ...
// Copro test SE999 : f3f6eec5-112a-433f-801c-3cbdc1195bfa

const EMAIL = process.env.ESTALE_EMAIL;
const PASSWORD = process.env.ESTALE_PASSWORD;
const BASE = (process.env.ESTALE_BASE_URL ?? "https://api.estale.app").replace(/\/$/, "");
const CONDO_ID = "f3f6eec5-112a-433f-801c-3cbdc1195bfa";

if (!EMAIL || !PASSWORD) { console.error("ESTALE_EMAIL / ESTALE_PASSWORD manquants"); process.exit(1); }

const [cmd, ...rest] = process.argv.slice(2);

function makeTestPdf(label = "REAL31 TEST-CYCLE") {
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
  nbAttendances nbAttendancesAndVPC tantiemesAttendances
  motions{ id rank type title majority status ignore }
  attendances{ ownerID owner{ fullname reference } whitePower isSigned representative{ fullname } representing{ owner{ fullname } } }
  invitation{ validated canValidate canUnvalidate canFroze isFrozing isCouncilApproved canSend
    owners{ ownerID owner{ fullname reference } } }
  documents{ fileID category file{ filename contentType size } }
  transcript{ validated canValidate canUnvalidate canFroze isFrozing isHandSigned isDigitallySigned
    bodyURL signedBodyURL attendanceSheetURL previewURL note
    owners{ ownerID owner{ fullname } } } } } }`;

async function readState(cookie, mid) {
  const d = await gql(cookie, STATE_Q, { condo: CONDO_ID, m: mid });
  return { ref: d.condo.reference, m: d.condo.meeting };
}

function printState({ ref, m }) {
  const t = m.transcript; const inv = m.invitation;
  console.log(`COPRO ${ref} | AG "${m.name}" (${m.category}/${m.mode}) id=${m.id}`);
  console.log(`  start=${m.startAt ?? "-"} end=${m.endAt ?? "-"}`);
  console.log(`  isFutur=${m.isFutur} isStarted=${m.isStarted} isEnded=${m.isEnded} isClosed=${m.isClosed} isVoteStarted=${m.isVoteStarted}`);
  console.log(`  canVote=${m.canVote} canClose=${m.canClose} canUnClose=${m.canUnClose} isDeletable=${m.isDeletable}`);
  console.log(`  nbAttendances=${m.nbAttendances} (+VPC=${m.nbAttendancesAndVPC}) tantiemesAttendances=${m.tantiemesAttendances}`);
  console.log(`  INVITATION: validated=${inv.validated} canValidate=${inv.canValidate} canUnvalidate=${inv.canUnvalidate} canFroze=${inv.canFroze} isFrozing=${inv.isFrozing} isCouncilApproved=${inv.isCouncilApproved} canSend=${inv.canSend}`);
  console.log(`  TRANSCRIPT: validated=${t.validated} canValidate=${t.canValidate} canUnvalidate=${t.canUnvalidate} canFroze=${t.canFroze} isFrozing=${t.isFrozing}`);
  console.log(`  bodyURL=${t.bodyURL ? "REMPLI" : "vide"} signedBodyURL=${t.signedBodyURL ? "REMPLI" : "vide"} attendanceSheetURL=${t.attendanceSheetURL ? "REMPLI" : "vide"}`);
  console.log(`  motions(${(m.motions ?? []).length}):`);
  for (const mo of m.motions ?? []) console.log(`     - id=${mo.id} rank=${mo.rank} type=${mo.type} maj=${mo.majority} status=${mo.status} ignore=${mo.ignore} "${mo.title}"`);
  console.log(`  owners invitation(${(inv.owners ?? []).length}):`);
  for (const o of inv.owners ?? []) console.log(`     - ownerID=${o.ownerID} ref=${o.owner.reference} ${o.owner.fullname}`);
  console.log(`  attendances(${(m.attendances ?? []).length}):`);
  for (const a of m.attendances ?? []) {
    const rep = a.representative ? ` <- rep par ${a.representative.fullname}` : "";
    const porte = a.representing.length ? ` porte ${a.representing.length} pouvoir(s)` : "";
    console.log(`     - ${a.owner.fullname} (ownerID=${a.ownerID}) whitePower=${a.whitePower} isSigned=${a.isSigned}${rep}${porte}`);
  }
  console.log(`  documents(${(m.documents ?? []).length}):`);
  for (const doc of m.documents ?? []) console.log(`     - fileID=${doc.fileID} cat=${doc.category} name=${doc.file.filename}`);
}

const cookie = await login();

if (cmd === "create") {
  const moi = await gql(cookie, `{ me { collaborator { id condos(archived:false){ id reference } } } }`);
  const collabId = moi.me.collaborator.id;
  const d = await gql(cookie, `query($id:ID!){ condo(id:$id){ dks{ id name isDefault } accountingV2{ exercices{ id period } } } }`, { id: CONDO_ID });
  const dk = d.condo.dks.find((k) => k.isDefault) ?? d.condo.dks[0];
  const exs = d.condo.accountingV2.exercices;
  const ex = exs.find((e) => String(e.period?.[0] ?? "").startsWith("2026")) ?? exs[exs.length - 1];
  const input = { condoID: CONDO_ID, accountingID: ex?.id, dkID: dk?.id, name: "TEST-CYCLE-COMPLET", category: "ORDINARY", participantsIDs: [collabId] };
  console.log("Input:", JSON.stringify({ ...input, _dk: dk?.name, _ex: ex?.period }, null, 2));
  const res = await gql(cookie, `mutation C($input: MeetingCreateInput!){ createMeeting(input:$input){ id name category startAt } }`, { input });
  console.log("\n[CREE] meetingID =", res.createMeeting.id);
} else if (cmd === "state") {
  printState(await readState(cookie, rest[0]));
} else if (cmd === "owners") {
  const { m } = await readState(cookie, rest[0]);
  for (const o of m.invitation.owners ?? []) console.log(`${o.ownerID}\t${o.owner.reference}\t${o.owner.fullname}`);
} else if (cmd === "addmotion") {
  const mid = rest[0];
  const titre = rest[1] ?? "Resolution de test - approbation des comptes";
  const maj = rest[2] ?? "A24";
  const input = { type: "generic", title: titre, body: "L'assemblee generale approuve la presente resolution de test.", majority: maj };
  const d = await gql(cookie, `mutation AM($id:ID!,$input:MeetingMotionCreateInput!){ updateMeeting(id:$id){ createMotion(input:$input){ id rank type title majority status } } }`, { id: mid, input });
  console.log("[MOTION CREEE]", JSON.stringify(d.updateMeeting.createMotion));
} else if (cmd === "setstart") {
  const mid = rest[0];
  const iso = rest[1] ?? new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { m } = await readState(cookie, mid);
  const parts = await gql(cookie, `query($c:ID!,$m:ID!){ condo(id:$c){ meeting(id:$m){ dk{ id } participants{ id } mode name } } }`, { c: CONDO_ID, m: mid });
  const mm = parts.condo.meeting;
  const input = { name: mm.name, mode: mm.mode, start: iso, dkID: mm.dk.id, participantsIDs: (mm.participants ?? []).map((p) => p.id) };
  await gql(cookie, `mutation U($id:ID!,$input:MeetingUpdateInput!){ updateMeeting(id:$id){ update(input:$input){ id startAt isFutur isStarted } } }`, { id: mid, input });
  printState(await readState(cookie, mid));
} else if (cmd === "invvalidate") {
  await gql(cookie, `mutation V($id:ID!){ updateMeeting(id:$id){ invitation{ validate{ id } } } }`, { id: rest[0] });
  printState(await readState(cookie, rest[0]));
} else if (cmd === "invfroze") {
  await gql(cookie, `mutation F($id:ID!){ updateMeeting(id:$id){ invitation{ froze{ id } } } }`, { id: rest[0] });
  printState(await readState(cookie, rest[0]));
} else if (cmd === "invsend") {
  const mid = rest[0];
  const { m } = await readState(cookie, mid);
  const ids = (m.invitation.owners ?? []).map((o) => o.ownerID);
  const d = await gql(cookie, `mutation S($id:ID!,$ids:[ID!]!){ updateMeeting(id:$id){ invitation{ send(ownerIDs:$ids){ meeting{ id } owners{ ownerID } } } } }`, { id: mid, ids });
  console.log("[INVSEND] envoye a", d.updateMeeting.invitation.send.owners.length, "owners");
} else if (cmd === "present") {
  const mid = rest[0]; const ownerID = rest[1];
  const d = await gql(cookie, `mutation P($id:ID!,$input:MeetingAttendancePresentInput!){ updateMeeting(id:$id){ createAttendancePresent(input:$input){ ownerID owner{ fullname } } } }`, { id: mid, input: { ownerID } });
  console.log("[PRESENT]", JSON.stringify(d.updateMeeting.createAttendancePresent));
} else if (cmd === "represented") {
  const mid = rest[0]; const ownerID = rest[1]; const repID = rest[2]; const white = rest[3] === "white";
  const input = { ownerID, internal: true, whitePower: white, representativeID: repID };
  const d = await gql(cookie, `mutation R($id:ID!,$input:MeetingAttendanceRepresentedInput!){ updateMeeting(id:$id){ createAttendanceRepresented(input:$input){ ownerID owner{ fullname } whitePower } } }`, { id: mid, input });
  console.log("[REPRESENTED]", JSON.stringify(d.updateMeeting.createAttendanceRepresented));
} else if (cmd === "openvotes") {
  const mid = rest[0];
  const { m } = await readState(cookie, mid);
  for (const mo of m.motions ?? []) {
    try {
      await gql(cookie, `mutation O($id:ID!,$mo:ID!){ updateMeeting(id:$id){ updateMotion(id:$mo){ open{ id status } } } }`, { id: mid, mo: mo.id });
      console.log(`  open motion ${mo.rank} OK`);
    } catch (e) { console.log(`  open motion ${mo.rank} REFUS: ${e.message}`); }
  }
  printState(await readState(cookie, mid));
} else if (cmd === "closevotes") {
  const mid = rest[0];
  const { m } = await readState(cookie, mid);
  for (const mo of m.motions ?? []) {
    try {
      await gql(cookie, `mutation CL($id:ID!,$mo:ID!){ updateMeeting(id:$id){ updateMotion(id:$mo){ close{ id status } } } }`, { id: mid, mo: mo.id });
      console.log(`  close motion ${mo.rank} OK`);
    } catch (e) { console.log(`  close motion ${mo.rank} REFUS: ${e.message}`); }
  }
  printState(await readState(cookie, mid));
} else if (cmd === "vote") {
  const mid = rest[0]; const status = rest[1] ?? "AGREED";
  const { m } = await readState(cookie, mid);
  const ownerIDs = (m.invitation.owners ?? []).map((o) => o.ownerID);
  const input = ownerIDs.map((ownerID) => ({ ownerID, status }));
  for (const mo of m.motions ?? []) {
    try {
      const d = await gql(cookie, `mutation UV($id:ID!,$mo:ID!,$in:[MeetingVoteUpsertInput!]!){ updateMeeting(id:$id){ updateMotion(id:$mo){ upsertVotes(input:$in){ __typename ... on MeetingMotion { id status } } } } }`, { id: mid, mo: mo.id, in: input });
      console.log(`  vote ${status} motion ${mo.rank}:`, JSON.stringify(d.updateMeeting.updateMotion.upsertVotes));
    } catch (e) { console.log(`  vote motion ${mo.rank} REFUS: ${e.message}`); }
  }
  printState(await readState(cookie, mid));
} else if (cmd === "end") {
  const mid = rest[0];
  const iso = rest[1] ?? new Date().toISOString();
  await gql(cookie, `mutation E($id:ID!,$end:Timestamptz!){ updateMeeting(id:$id){ transcript{ setEnd(end:$end){ id endAt isEnded } } } }`, { id: mid, end: iso });
  printState(await readState(cookie, mid));
} else if (cmd === "validatepv") {
  await gql(cookie, `mutation V($id:ID!){ updateMeeting(id:$id){ transcript{ validate{ id } } } }`, { id: rest[0] });
  printState(await readState(cookie, rest[0]));
} else if (cmd === "frozepv") {
  await gql(cookie, `mutation F($id:ID!){ updateMeeting(id:$id){ transcript{ froze{ id } } } }`, { id: rest[0] });
  printState(await readState(cookie, rest[0]));
} else if (cmd === "close") {
  await gql(cookie, `mutation C($id:ID!){ updateMeeting(id:$id){ close{ id isClosed } } }`, { id: rest[0] });
  printState(await readState(cookie, rest[0]));
} else if (cmd === "createfile") {
  const mid = rest[0]; const cat = rest[1];
  const pdf = makeTestPdf(`REAL31 TEST-CYCLE ${cat} (bidon)`);
  const q = `mutation CF($id:ID!,$file:Upload!){ updateMeeting(id:$id){ createFile(fileCategory:${cat}, file:$file){ id documents{ fileID category file{ filename } } } } }`;
  const d = await gqlUpload(cookie, q, { id: mid }, "file", pdf, `test-${cat}.pdf`);
  const docs = d.updateMeeting.createFile.documents ?? [];
  console.log(`[CREATEFILE ${cat}] OK. documents=${docs.length}`);
  for (const doc of docs) console.log(`   - fileID=${doc.fileID} cat=${doc.category} name=${doc.file.filename}`);
} else if (cmd === "deletefile") {
  await gql(cookie, `mutation DF($id:ID!,$f:ID!){ updateMeeting(id:$id){ deleteFile(fileID:$f){ id } } }`, { id: rest[0], f: rest[1] });
  console.log("[DELETEFILE] OK.");
} else if (cmd === "delete") {
  await gql(cookie, `mutation D($id:ID!){ updateMeeting(id:$id){ delete{ id } } }`, { id: rest[0] });
  console.log("[DELETE] AG supprimee.");
} else {
  console.error("cmd inconnue:", cmd);
  process.exit(1);
}
