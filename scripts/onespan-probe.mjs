// Sonde OneSpan EN LECTURE SEULE : detecte sur quel environnement/host la cle API
// authentifie, sans creer aucune transaction. Ne loggue PAS la cle.
//   node --env-file=.env.local scripts/onespan-probe.mjs
const KEY = process.env.ONESPAN_API_KEY;
if (!KEY) { console.error("ONESPAN_API_KEY manquant dans .env.local"); process.exit(1); }

const HOSTS = {
  "sandbox":        "https://sandbox.esignlive.com/api",
  "prod EU (AppA)": "https://apps.esignlive.eu/api",
  "prod NA":        "https://apps.esignlive.com/api",
};

for (const [label, base] of Object.entries(HOSTS)) {
  try {
    // lecture seule : liste 1 package en brouillon (aucune creation)
    const res = await fetch(`${base}/packages?query=DRAFT&from=1&to=1`, {
      headers: { Authorization: `Basic ${KEY}`, Accept: "application/json" },
    });
    let compte = "";
    if (res.status === 200) {
      try {
        const acc = await fetch(`${base}/account`, {
          headers: { Authorization: `Basic ${KEY}`, Accept: "application/json" },
        });
        if (acc.ok) {
          const j = await acc.json();
          compte = `  compte="${j.name ?? j.id ?? "?"}"`;
        }
      } catch {}
    }
    const verdict = res.status === 200 ? "[AUTH OK]" : (res.status === 401 || res.status === 403) ? "[cle refusee]" : "";
    console.log(`${label.padEnd(16)} ${base.padEnd(38)} HTTP ${res.status} ${verdict}${compte}`);
  } catch (e) {
    console.log(`${label.padEnd(16)} ${base.padEnd(38)} injoignable (${e.message})`);
  }
}
console.log("\n(lecture seule, aucune transaction creee)");
