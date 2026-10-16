// Le cron « échéances de contrats » (plan §3 point 30, décision 8) : un mail au binôme de la
// copro pour chaque cycle en cours dont la fenêtre de suivi est ouverte, à la cadence de la
// règle du sujet ; la direction de l'agence en copie quand le dossier est rouge. Patron :
// rappeler-comptes-avant-cs.ts (REA-140), même trace d'idempotence (intranet_rappels_envoyes).
//
// ARMEMENT SUJET PAR SUJET (décision 8) : rien ne part tant que CONTRATS_RAPPELS_SUJETS ne
// nomme pas le sujet (« assurance,gaz »). Variable absente ou vide = le cron tourne, lit, et
// n'envoie rien ; c'est voulu, le feu vert de Sekou se donne sujet par sujet après nettoyage
// des échéances aberrantes.
//
// Boîte d'envoi : celle du GESTIONNAIRE de la copro (repli : l'assistant). Un cron n'a pas de
// session ; l'envoi Graph est app-only et le mail arrive « de » quelqu'un qui connaît le
// dossier. À = gestionnaire + assistant. Cc (rouge) = les référents syndic de l'agence de la
// copro, c'est-à-dire les collaborateurs actifs qui portent l'habilitation
// « referent_syndic:<AGENCE> » (table intranet_habilitation, lue par le port Collaborateur).
//
// IDEMPOTENCE : la clé « contrats|<sujet>|<cycle>|<période> » est RÉSERVÉE avant l'envoi et
// LIBÉRÉE si l'envoi échoue (le passage du lendemain retente). Trace illisible -> rien ne part.
// Module mail coupé (MAIL_SOURCE != graph) -> on sort AVANT toute lecture : le provider Noop
// « réussirait » et consommerait les clés, le vrai mail ne partirait jamais.
//
// ÉCARTÉS : les copros dont l'assurance est chez un courtier partenaire (il suit lui-même le
// renouvellement, cf. lecture.estChezCourtierPartenaire), les cycles d'amorçage sans activité
// (« à démarrer ») et les échéances aberrantes (filtres du domaine, rappelsDus).

import {
  getAgenceRepository,
  getCollaborateurRepository,
  getContratsCoproRepository,
  getCoproRepository,
  getGestionnaireRepository,
  getMailOutboundProvider,
  getRappelEnvoyeRepository,
} from "@/lib/adapters/router";
import {
  SUJETS,
  corpsMail,
  niveauCycle,
  rappelsDus,
  sujetMail,
  type ContratCourant,
  type Cycle,
  type DevisCtq,
  type EntreeRappel,
  type OffreAssurance,
  type OffreGaz,
  type RappelDu,
  type SujetSuivi,
} from "@/lib/domain/contrats-copro";
import { mailModuleActif } from "@/lib/domain/mail-gate";
import { signalerException } from "@/lib/observabilite";
import { jourParis } from "@/lib/services/date-du-jour";
import { journaliser } from "./journal";
import { courtiersPartenaires, estChezCourtierPartenaire } from "./lecture";

export interface BilanRappelsContrats {
  jour: string;
  sujetsArmes: SujetSuivi[];
  /** Rappels dus aujourd'hui sur les sujets armés (avant idempotence). */
  candidats: number;
  /** Clés envoyées. */
  envoyes: string[];
  /** Clés déjà envoyées dans la même période. */
  dejaEnvoyes: string[];
  /** Ce qui n'a pas pu partir, ou partir complètement (copie direction sans référent). */
  ignores: { cle: string; raison: string }[];
  erreurs: { cle: string; message: string }[];
}

/** Les sujets dont le mail est armé (CONTRATS_RAPPELS_SUJETS = « assurance,gaz ») ; vide = aucun. */
export function sujetsArmes(): SujetSuivi[] {
  const brut = process.env.CONTRATS_RAPPELS_SUJETS ?? "";
  const vus = new Set<SujetSuivi>();
  for (const morceau of brut.split(/[,;\s]+/)) {
    const s = morceau.trim().toLowerCase();
    if ((SUJETS as readonly string[]).includes(s)) vus.add(s as SujetSuivi);
  }
  return SUJETS.filter((s) => vus.has(s));
}

function urlIntranet(): string {
  return (process.env.INTRANET_URL ?? process.env.AUTH_URL ?? "https://real31.app").replace(/\/$/, "");
}

/** Le lien de la fiche copro mis dans le mail. */
export function lienFicheCopro(coproCode: string): string {
  return `${urlIntranet()}/copropriete/${encodeURIComponent(coproCode)}`;
}

function uniques(emails: readonly (string | undefined)[]): string[] {
  const vus = new Set<string>();
  const out: string[] = [];
  for (const e of emails) {
    const cle = (e ?? "").trim().toLowerCase();
    if (!cle || vus.has(cle)) continue;
    vus.add(cle);
    out.push(e!.trim());
  }
  return out;
}

/**
 * Les référents syndic par code d'agence : collaborateurs actifs, avec e-mail, dont une
 * habilitation « referent_syndic » sur l'agence est en cours au jour dit. Lu une fois par passage,
 * seulement s'il y a un rouge ; illisible -> vide (le mail part sans copie, c'est dit dans le bilan).
 */
async function referentsParAgence(jour: string): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  try {
    const collaborateurs = await getCollaborateurRepository().listerTous();
    for (const c of collaborateurs) {
      if (!c.actif || !c.email) continue;
      for (const h of c.habilitations) {
        if (h.type !== "referent_syndic" || !h.agence) continue;
        if (h.depuisISO > jour || (h.jusquaISO && h.jusquaISO < jour)) continue;
        const code = h.agence.toUpperCase();
        out.set(code, uniques([...(out.get(code) ?? []), c.email]));
      }
    }
  } catch (err) {
    console.warn("[cron:echeances-contrats] référents d'agence illisibles :", (err as Error).message);
  }
  return out;
}

export async function envoyerRappelsContrats(maintenant: Date = new Date()): Promise<BilanRappelsContrats> {
  const jour = jourParis(maintenant);
  const armes = sujetsArmes();
  const bilan: BilanRappelsContrats = { jour, sujetsArmes: armes, candidats: 0, envoyes: [], dejaEnvoyes: [], ignores: [], erreurs: [] };
  if (armes.length === 0) return bilan;
  // Provider Noop : rien ne partirait mais les clés seraient consommées. On ne lit même pas.
  if (!mailModuleActif()) return bilan;

  const repo = getContratsCoproRepository();
  const [cycles, regles, copros] = await Promise.all([
    repo.listerCycles({ sujets: armes, statuts: ["en_cours"] }),
    repo.listerReglesRelance(),
    getCoproRepository().listerToutes(),
  ]);
  const parCode = new Map(copros.map((c) => [c.code, c]));
  const retenus = cycles.filter((c) => {
    const copro = parCode.get(c.coproCode);
    return !!copro && copro.statut === "active";
  });

  // Lectures groupées : les offres des cycles (activité), les devis des copros CTQ (activité),
  // le contrat courant des copros assurance (courtier partenaire). Jamais une requête par cycle.
  const idsAssurance = retenus.filter((c) => c.sujet === "assurance").map((c) => c.id);
  const idsGaz = retenus.filter((c) => c.sujet === "gaz").map((c) => c.id);
  const codesCtq = [...new Set(retenus.filter((c) => c.sujet === "ctq_ascenseur" || c.sujet === "ctq_vmc").map((c) => c.coproCode))];
  const codesAssurance = [...new Set(retenus.filter((c) => c.sujet === "assurance").map((c) => c.coproCode))];
  const [offresAssurance, offresGaz, devis, contrats, partenaires] = await Promise.all([
    idsAssurance.length ? repo.listerOffresAssurance(idsAssurance) : Promise.resolve([] as OffreAssurance[]),
    idsGaz.length ? repo.listerOffresGaz(idsGaz) : Promise.resolve([] as OffreGaz[]),
    codesCtq.length ? repo.listerDevisCtq(codesCtq) : Promise.resolve([] as DevisCtq[]),
    codesAssurance.length ? repo.listerContratsCourants(codesAssurance) : Promise.resolve(new Map<string, ContratCourant>()),
    codesAssurance.length ? courtiersPartenaires() : Promise.resolve([] as string[]),
  ]);
  const cyclesAvecOffre = new Set<string>([...offresAssurance.map((o) => o.cycleId), ...offresGaz.map((o) => o.cycleId)]);
  const coproSujetAvecDevis = new Set(devis.map((d) => `${d.coproCode}|${d.sujet}`));
  const aActivite = (c: Cycle) => cyclesAvecOffre.has(c.id) || coproSujetAvecDevis.has(`${c.coproCode}|${c.sujet}`);
  const chezPartenaire = (c: Cycle) => c.sujet === "assurance" && estChezCourtierPartenaire(contrats.get(c.coproCode)?.assurance.courtier, partenaires);

  const entrees: EntreeRappel[] = [];
  for (const cycle of retenus) {
    if (chezPartenaire(cycle)) continue;
    const copro = parCode.get(cycle.coproCode)!;
    const regle = regles[cycle.sujet];
    entrees.push({ cycle, coproNom: copro.nom, niveau: niveauCycle(cycle, regle, jour), regle, aActivite: aActivite(cycle) });
  }
  const rappels: RappelDu[] = rappelsDus(entrees, jour);
  bilan.candidats = rappels.length;
  if (rappels.length === 0) return bilan;

  const gestionnaires = await getGestionnaireRepository().listTous();
  const emailDe = new Map(gestionnaires.filter((g) => g.email).map((g) => [g.id, g.email as string]));
  const besoinReferents = rappels.some((r) => r.copieDirection);
  const [agences, referents] = await Promise.all([
    besoinReferents ? getAgenceRepository().listerAgences().catch(() => []) : Promise.resolve([]),
    besoinReferents ? referentsParAgence(jour) : Promise.resolve(new Map<string, string[]>()),
  ]);
  const codeAgence = new Map(agences.map((a) => [a.id, a.code.toUpperCase()]));
  const traces = getRappelEnvoyeRepository();
  const mail = getMailOutboundProvider();

  for (const r of rappels) {
    const copro = parCode.get(r.coproCode)!;
    const gestionnaire = copro.managerId ? emailDe.get(copro.managerId) : undefined;
    const assistant = copro.assistantId ? emailDe.get(copro.assistantId) : undefined;
    const boite = gestionnaire ?? assistant;
    if (!boite) {
      bilan.ignores.push({ cle: r.cle, raison: "aucune boîte d'envoi (gestionnaire et assistant sans e-mail)" });
      continue;
    }
    const a = uniques([gestionnaire, assistant]);
    let cc: string[] = [];
    if (r.copieDirection) {
      const agence = copro.agenceId ? codeAgence.get(copro.agenceId) : undefined;
      cc = (agence ? referents.get(agence) : undefined) ?? [];
      cc = cc.filter((e) => !a.some((x) => x.toLowerCase() === e.toLowerCase()));
      if (cc.length === 0) {
        bilan.ignores.push({ cle: r.cle, raison: `aucun référent d'agence${agence ? ` (${agence})` : ""} : rappel rouge envoyé sans copie direction` });
      }
    }

    let reserve = false;
    try {
      reserve = await traces.reserver(r.cle);
      if (!reserve) {
        bilan.dejaEnvoyes.push(r.cle);
        continue;
      }
      await mail.envoyerNeuf({
        boite,
        a,
        cc,
        cci: [],
        sujet: sujetMail(r),
        corps: corpsMail(r, lienFicheCopro(r.coproCode)),
      });
      bilan.envoyes.push(r.cle);
      await journaliser({
        coproCode: r.coproCode,
        sujet: r.sujet,
        cycleId: r.cycleId,
        type: "rappel_envoye",
        parUserId: null,
        parNom: "Intranet (rappel automatique)",
        details: { a, cc, niveau: r.niveau, cle: r.cle },
      });
    } catch (e) {
      const message = (e as Error).message;
      bilan.erreurs.push({ cle: r.cle, message });
      signalerException(e, { source: "echeances-contrats", copro: r.coproCode, detail: { cle: r.cle } });
      // Envoi raté : on libère la clé pour que le passage du lendemain retente.
      if (reserve) await traces.liberer(r.cle).catch(() => undefined);
    }
  }
  return bilan;
}
