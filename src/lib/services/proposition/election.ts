// L'election d'une proposition (ADR-039, brique 3) : sur le bouton « Créer la copropriété »,
// la fiche App A, le cycle de contrat, le client Pennylane et le dossier de reprise. Dans
// cet ordre, chaque etape tracee au journal ; si l'une echoue, les precedentes restent
// (une fiche App A creee ne se defait pas), et le message dit ou on en est.

import { getAgenceRepository, getCoproRepository, getFacturationRepository, getGestionnaireRepository, getInvoicingProvider, getPropositionRepository } from "@/lib/adapters/router";
import { getRepriseDossierRepository } from "@/lib/reprise/adapters/router";
import { creerDossierSuivi } from "@/lib/reprise/services/suivi-dossier";
import { coproDepuisElection, nomUsuelPropose, obstaclesElection, prochainCodeCopro, type ChoixElection } from "@/lib/domain/proposition/election";
import { cycleOffre, INCLUS_OFFRE } from "@/lib/domain/proposition/offre";
import type { Proposition } from "@/lib/domain/proposition/proposition";

export interface PreparationElection {
  proposition: Proposition;
  codePropose: string;
  nomPropose: string;
  /** Debut de contrat propose : celui de l'offre. */
  debutProposeISO: string;
  agences: { id: string; code: string }[];
  gestionnaires: { id: string; nomComplet: string }[];
  codesExistants: string[];
  /** Deja elue et creee : le code de la copro. */
  coproCode?: string;
}

/** Ce que l'ecran d'election propose par defaut. */
export async function preparerElection(id: string): Promise<PreparationElection> {
  const p = await getPropositionRepository().get(id);
  if (!p) throw new Error("Proposition introuvable.");
  const [copros, agences, gestionnaires] = await Promise.all([
    getCoproRepository().listerToutes().catch(() => []),
    getAgenceRepository().listerAgences(),
    getGestionnaireRepository().list(),
  ]);
  const codesExistants = copros.map((c) => c.code);
  const aujourdHui = new Date().toISOString().slice(0, 10);
  return {
    proposition: p,
    codePropose: prochainCodeCopro(codesExistants),
    nomPropose: nomUsuelPropose(p),
    debutProposeISO: cycleOffre(p, {}, aujourdHui).debutISO,
    agences: agences.map((a) => ({ id: a.id, code: a.code })),
    gestionnaires: gestionnaires.map((g) => ({ id: g.id, nomComplet: g.nomComplet })),
    codesExistants,
    ...(p.coproCode ? { coproCode: p.coproCode } : {}),
  };
}

export interface ResultatElection {
  coproCode: string;
  etapes: string[];
}

export async function elireProposition(id: string, choix: ChoixElection, par: { nom: string; email?: string }): Promise<ResultatElection> {
  const repoProp = getPropositionRepository();
  const p = await repoProp.get(id);
  if (!p) throw new Error("Proposition introuvable.");
  if (p.coproCode) throw new Error(`Cette proposition a déjà donné la copropriété ${p.coproCode}.`);
  const copros = await getCoproRepository().listerToutes().catch(() => []);
  const obstacles = obstaclesElection(p, choix, copros.map((c) => c.code));
  if (obstacles.length > 0) throw new Error(`Impossible de créer la copropriété : ${obstacles.join(" ; ")}.`);

  const copro = coproDepuisElection(p, choix, INCLUS_OFFRE);
  if (choix.creerClientPennylane) copro.pennylaneId = crypto.randomUUID();
  const etapes: string[] = [];
  const quand = () => new Date().toISOString();
  const journal = [...p.journal];
  const tracer = (texte: string) => {
    etapes.push(texte);
    journal.push({ quandISO: quand(), par: par.nom, texte });
  };
  const sauver = async (coproCode?: string) => {
    const aujourdHui = quand().slice(0, 10);
    await repoProp.sauver({
      ...p,
      statut: "elu",
      decisionISO: p.decisionISO ?? aujourdHui,
      ...(coproCode ? { coproCode } : {}),
      journal,
    });
  };

  try {
    // 1. La fiche App A : le referentiel que tout l'intranet filtre.
    await getCoproRepository().creerCopro(copro);
    tracer(`Copropriété ${copro.code} (${copro.nom}) créée dans le référentiel, prise en gestion le ${jj(copro.priseEnGestionISO)}, mandat jusqu'au ${jj(copro.finMandatISO)}.`);
    await sauver(copro.code);

    // 2. Le cycle de contrat, tarifs figes au bareme de l'annee de l'AG (regle du contrat imprime).
    const repoFact = getFacturationRepository();
    const ag = p.agPrevueISO ?? p.decisionISO ?? copro.priseEnGestionISO;
    const bareme = await repoFact.listerBareme(Number(ag.slice(0, 4)));
    await repoFact.creerContrat({
      coproCode: copro.code,
      debutContrat: copro.priseEnGestionISO,
      finContrat: copro.finMandatISO,
      ...(bareme.length > 0 ? { tarifs: Object.fromEntries(bareme.map((l) => [l.identifiantPrestation, l.montantTtc])) } : {}),
      honorairesGestionTtc: p.prix.honorairesTtc ?? 0,
      fraisPostauxReels: copro.fraisPostauxReels,
      forfaitPostauxTtc: copro.fraisPostauxReels ? 0 : (p.prix.timbresTtc ?? 0),
    });
    tracer(`Contrat enregistré : ${(p.prix.honorairesTtc ?? 0).toLocaleString("fr-FR")} € TTC par an, du ${jj(copro.priseEnGestionISO)} au ${jj(copro.finMandatISO)}, barème ${ag.slice(0, 4)}.`);
    await sauver(copro.code);

    // 3. Le client Pennylane, si demande.
    if (choix.creerClientPennylane && copro.pennylaneId) {
      const r = await getInvoicingProvider().creerClient({
        nom: copro.nomSdc,
        adresse: copro.adresse1,
        codePostal: copro.codePostal,
        ville: copro.ville,
        referenceExterne: copro.pennylaneId,
        emails: par.email ? [par.email] : [],
      });
      tracer(`Client Pennylane créé (« ${copro.nomSdc} », id ${r.clientExterneId}).`);
      await sauver(copro.code);
    }

    // 4. Le dossier de reprise : la checklist d'equipe, datee de la prise en gestion.
    if (choix.ouvrirDossierReprise) {
      await creerDossierSuivi(getRepriseDossierRepository(), copro.code, copro.nom, `${copro.adresse1}, ${copro.codePostal} ${copro.ville}`, {
        ...(p.immeuble.syndicActuel ? { sortant: p.immeuble.syndicActuel } : {}),
        dateBascule: copro.priseEnGestionISO,
      });
      tracer(`Dossier de reprise ${copro.code} ouvert${p.immeuble.syndicActuel ? ` (sortant : ${p.immeuble.syndicActuel})` : ""}.`);
      await sauver(copro.code);
    }
  } catch (e) {
    const message = (e as Error).message;
    journal.push({ quandISO: quand(), par: par.nom, texte: `Élection interrompue : ${message}` });
    await sauver(etapes.length > 0 ? copro.code : undefined).catch(() => undefined);
    throw new Error(etapes.length > 0 ? `${message} — étapes déjà faites : ${etapes.length} (voir le journal).` : message);
  }
  return { coproCode: copro.code, etapes };
}

function jj(iso: string): string {
  return iso.split("-").reverse().join("/");
}
