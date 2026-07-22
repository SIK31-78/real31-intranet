// LECTURE SEULE (QUERIES only, zero mutation). Explore un meeting eStale en direct
// pour cartographier ce que l'API expose autour du PV, de la feuille de presence, de
// l'emargement, des signatures (bureau + presents) et du gel. Aucun secret logge.
//
// Usage :
//   node --env-file=.env.local scripts/estale-explore-meeting.mjs [CONDO_ID] [MEETING_ID]
// Defauts = AG test SE999 de Sekou (19 nov. 2026).

const EMAIL = process.env.ESTALE_EMAIL;
const PASSWORD = process.env.ESTALE_PASSWORD;
const BASE = (process.env.ESTALE_BASE_URL ?? "https://api.estale.app").replace(/\/$/, "");

const CONDO_ID = (process.argv[2] ?? "f3f6eec5-112a-433f-801c-3cbdc1195bfa").trim();
const MEETING_ID = (process.argv[3] ?? "9ba932a3-b4f6-4402-8f2c-c2415032c01f").trim();

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
  if (cookies.length === 0) throw new Error("Login : aucun cookie de session recu");
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

// N'affiche que si une URL est presente (on ne divulgue pas le contenu, juste "rempli/vide").
const flag = (v) => (v ? "REMPLI" : "(null/vide)");

const cookie = await login();
console.log("Login OK.\n");

const data = await gql(
  cookie,
  `query Explore($condo: ID!, $meeting: ID!) {
    condo(id: $condo) {
      id
      reference
      council { role owner { fullname } }
      meeting(id: $meeting) {
        id
        name
        category
        mode
        startAt
        endAt
        isStarted
        isEnded
        isClosed
        isFutur
        canClose
        canUnClose
        isDeletable
        nbAttendances
        nbAttendancesAndVPC
        timesheetURL
        timesheetChairman { id firstname lastname file { filename contentType } }
        timesheetSecretary { id firstname lastname file { filename contentType } }
        timesheetScrutineer { id firstname lastname file { filename contentType } }
        attendances {
          ownerID
          owner { fullname reference }
          whitePower
          isSigned
          representative { fullname isExterne isVideo }
          representing { owner { fullname } }
        }
        transcript {
          validated
          canValidate
          canUnvalidate
          canFroze
          isFrozing
          isHandSigned
          isDigitallySigned
          isSending
          canSend
          isPrinting
          isBilling
          note
          bodyURL
          signedBodyURL
          individualLetterURL
          attendanceSheetURL
          previewURL
          havePostalProofs
          postalProofsURL
          signaturesDigital {
            id
            rank
            persona
            firstname
            lastname
            createdAt
            file { filename contentType }
          }
        }
      }
    }
  }`,
  { condo: CONDO_ID, meeting: MEETING_ID },
);

const condo = data.condo;
const m = condo.meeting;
const t = m.transcript;

console.log(`=== COPRO ${condo.reference} (condoID ${condo.id}) ===`);
console.log("\n--- CONSEIL SYNDICAL (source possible du bureau) ---");
if (condo.council.length === 0) console.log("  (aucun membre de conseil)");
for (const c of condo.council) console.log(`  ${c.role.padEnd(10)} ${c.owner.fullname}`);

console.log(`\n=== MEETING "${m.name}" (${m.category}, mode ${m.mode}) ===`);
console.log(`  id            : ${m.id}`);
console.log(`  debut / fin   : ${m.startAt ?? "-"}  ->  ${m.endAt ?? "-"}`);
console.log(`  etats         : isStarted=${m.isStarted} isEnded=${m.isEnded} isClosed=${m.isClosed} isFutur=${m.isFutur}`);
console.log(`  actions       : canClose=${m.canClose} canUnClose=${m.canUnClose} isDeletable=${m.isDeletable}`);
console.log(`  presents      : nbAttendances=${m.nbAttendances}  (+VPC=${m.nbAttendancesAndVPC})`);

console.log("\n=== FEUILLE DE PRESENCE / EMARGEMENT ===");
console.log(`  timesheetURL         : ${flag(m.timesheetURL)}`);
console.log(`  transcript.attendanceSheetURL : ${flag(t.attendanceSheetURL)}`);
const sig = (label, s) =>
  console.log(`  ${label.padEnd(20)}: ${s ? `${s.firstname} ${s.lastname} [fichier ${s.file?.contentType ?? "?"}]` : "(non pose)"}`);
sig("timesheetChairman", m.timesheetChairman);
sig("timesheetSecretary", m.timesheetSecretary);
sig("timesheetScrutineer", m.timesheetScrutineer);

console.log("\n=== ATTENDANCES (presents / representes) ===");
if (m.attendances.length === 0) console.log("  (aucun present enregistre)");
for (const a of m.attendances) {
  const rep = a.representative ? ` <- represente par ${a.representative.fullname}${a.representative.isExterne ? " (externe)" : ""}${a.representative.isVideo ? " (visio)" : ""}` : "";
  const porte = a.representing.length ? ` porte ${a.representing.length} pouvoir(s)` : "";
  console.log(`  ${a.owner.fullname.padEnd(30)} isSigned=${a.isSigned} whitePower=${a.whitePower}${rep}${porte}`);
}

console.log("\n=== TRANSCRIPT (PV) ===");
console.log(`  validated        : ${t.validated}   canValidate=${t.canValidate} canUnvalidate=${t.canUnvalidate}`);
console.log(`  gel : canFroze=${t.canFroze} isFrozing=${t.isFrozing}`);
console.log(`  signatures : isHandSigned=${t.isHandSigned} isDigitallySigned=${t.isDigitallySigned}`);
console.log(`  envoi/impr : isSending=${t.isSending} canSend=${t.canSend} isPrinting=${t.isPrinting} isBilling=${t.isBilling}`);
console.log(`  note             : ${t.note ?? "(vide)"}`);
console.log(`  bodyURL (PV non signe)   : ${flag(t.bodyURL)}`);
console.log(`  signedBodyURL (PV signe) : ${flag(t.signedBodyURL)}`);
console.log(`  individualLetterURL      : ${flag(t.individualLetterURL)}`);
console.log(`  attendanceSheetURL       : ${flag(t.attendanceSheetURL)}`);
console.log(`  previewURL               : ${flag(t.previewURL)}`);
console.log(`  havePostalProofs=${t.havePostalProofs}  postalProofsURL: ${flag(t.postalProofsURL)}`);

console.log("\n  signaturesDigital (bureau, numeriques) :");
if (t.signaturesDigital.length === 0) console.log("    (aucune signature numerique posee)");
for (const s of t.signaturesDigital) {
  console.log(`    rank ${s.rank} ${s.persona.padEnd(10)} ${s.firstname} ${s.lastname}  cree ${s.createdAt}  [${s.file?.contentType ?? "?"}]`);
}

console.log("\nFini (lecture seule, aucune mutation).");
