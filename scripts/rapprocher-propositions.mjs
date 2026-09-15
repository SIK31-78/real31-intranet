// Rattache les propositions sans immatriculation a une copropriete du registre national
// (ADR-039). Automatique seulement quand numero + voie + commune coincident et qu'un seul
// immeuble du registre correspond (regle de Sekou, 15/09/2026) ; le reste attend un humain
// dans l'ecran « A rapprocher ».
//
//   node --env-file=.env.local scripts/rapprocher-propositions.mjs [--simuler] [--verbeux]
//
// La logique de comparaison est celle du domaine (rapprochement.ts), importee telle quelle :
// Node 24 lit le TypeScript sans build.

import { analyserAdresse, rapprocher, requeteRegistre } from "../src/lib/domain/proposition/rapprochement.ts";

const args = new Set(process.argv.slice(2));
const SIMULER = args.has("--simuler");
const VERBEUX = args.has("--verbeux");
const U = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const K = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!U || !K) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants (node --env-file=.env.local).");
const H = { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json" };

async function lire(path) {
  const r = await fetch(`${U}/rest/v1/${path}`, { headers: H });
  if (!r.ok) throw new Error(`${path} : ${r.status} ${await r.text()}`);
  return r.json();
}

// Toutes les propositions, par pages de 1 000.
const propositions = [];
for (let debut = 0; ; debut += 1000) {
  const page = await lire(`intranet_proposition?select=id,statut,immeuble,journal&order=id&offset=${debut}&limit=1000`);
  propositions.push(...page);
  if (page.length < 1000) break;
}
const sans = propositions.filter((p) => !p.immeuble?.immatriculation);
console.log(`${propositions.length} propositions, ${sans.length} sans immatriculation.`);

let rattachees = 0, aChoisir = 0, illisibles = 0, sansCandidat = 0;
for (const p of sans) {
  const a = analyserAdresse(p.immeuble.adresse ?? "");
  if (a.numeros.length === 0 || a.voie.length === 0) {
    illisibles++;
    if (VERBEUX) console.log(`  illisible : ${p.immeuble.adresse}`);
    continue;
  }
  // Candidats : l'un des numeros ET les mots de voie (pas la commune, pour laisser
  // « probable » remonter).
  // Le numero en mot entier (« 4 » ne doit pas ramener 14, 40 ni 92400), une requete par
  // numero ecrit.
  const q = requeteRegistre(a);
  const voie = q.voie.map((m) => `recherche=ilike.*${encodeURIComponent(m)}*`).join("&");
  const vus = new Map();
  for (const n of q.numeros) {
    const numero = `recherche=imatch.${encodeURIComponent(`(^|\\s)${n}(bis|ter|b|t)?(\\s|$)`)}`;
    for (const c of await lire(`intranet_registre_copros?select=immatriculation,adresse,adresses_compl,commune,code_postal,lots_principaux,lots_stationnement,syndic_nom,fin_mandat&${numero}&${voie}&limit=40`)) vus.set(c.immatriculation, c);
  }
  const candidats = [...vus.values()].map((c) => ({
    immatriculation: c.immatriculation,
    adresse: c.adresse,
    adressesCompl: c.adresses_compl ?? [],
    commune: c.commune,
    codePostal: c.code_postal,
    lotsPrincipaux: c.lots_principaux,
    lotsStationnement: c.lots_stationnement,
    syndicNom: c.syndic_nom,
    finMandatISO: c.fin_mandat,
  }));
  const r = rapprocher(a, candidats);
  if (r.sur) {
    rattachees++;
    if (VERBEUX) console.log(`  SUR  ${p.immeuble.adresse}  ->  ${r.sur.adresse}, ${r.sur.commune} (${r.sur.immatriculation})`);
    if (SIMULER) continue;
    const c = r.sur;
    const immeuble = {
      ...p.immeuble,
      immatriculation: c.immatriculation,
      codePostal: p.immeuble.codePostal ?? c.codePostal,
      commune: p.immeuble.commune ?? c.commune,
      ...(p.immeuble.lotsPrincipaux === undefined && c.lotsPrincipaux !== null ? { lotsPrincipaux: c.lotsPrincipaux } : {}),
      ...(p.immeuble.lotsStationnement === undefined && c.lotsStationnement !== null ? { lotsStationnement: c.lotsStationnement } : {}),
      ...(p.immeuble.syndicActuel === undefined && c.syndicNom ? { syndicActuel: c.syndicNom } : {}),
      ...(p.immeuble.finMandatActuelISO === undefined && c.finMandatISO ? { finMandatActuelISO: c.finMandatISO } : {}),
    };
    const journal = [...(p.journal ?? []), { quandISO: new Date().toISOString(), par: "rapprochement", texte: `Rattachée au registre national (${c.immatriculation}, ${c.adresse}, ${c.commune}) : numéro, voie et commune coïncident.` }];
    const w = await fetch(`${U}/rest/v1/intranet_proposition?id=eq.${p.id}`, { method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ immeuble, journal }) });
    if (!w.ok) throw new Error(`PATCH ${p.id} : ${w.status} ${await w.text()}`);
  } else if (r.candidats.length > 0) {
    aChoisir++;
    if (VERBEUX) console.log(`  ?    ${p.immeuble.adresse}  ->  ${r.candidats.map((c) => `${c.adresse}, ${c.commune}`).join(" | ")}`);
  } else {
    sansCandidat++;
    if (VERBEUX) console.log(`  ∅    ${p.immeuble.adresse}`);
  }
}
console.log(`\n${rattachees} rattachées${SIMULER ? " (simulation, rien écrit)" : ""}, ${aChoisir} à choisir par un humain, ${sansCandidat} sans candidat au registre, ${illisibles} adresses illisibles.`);
