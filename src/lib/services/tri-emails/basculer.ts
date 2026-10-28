// Bascule d'un mail d'une boîte triée à une autre (ADR-050, décision Sekou du 28/10/2026).
// Un mail arrivé dans la mauvaise boîte partagée (dans syndic4 un mail pour une copro LGC, ou
// l'inverse) part, d'un clic, dans la boîte de l'agence concernée : depuis le tri (la file) ou
// depuis « E-mails » (« Pas pour moi » vers une copro d'une autre agence).
//
// Graph ne déplace pas un message entre deux boîtes : le mail est RECOPIÉ À L'IDENTIQUE dans
// la réception de la cible (graph-recopie-inter-boites.ts), puis l'original part aux Éléments
// supprimés de la boîte de départ (jamais supprimé définitivement). Le geste suit le journal
// transactionnel du tri (REA-420), dans la boîte de DÉPART :
//   (1) la destination est vérifiée (copro connue de la boîte cible) avant tout geste ;
//   (2) le rangement actif du mail dans la boîte de départ, s'il y en a un, est annulé (il
//       quitte le dossier du binôme) ;
//   (3) une ligne « en_cours » est ouverte : dossier « Basculé vers <cible> », par qui ;
//   (4) copie dans la cible, SAUF si une copie complète y est déjà (geste repris) ou si le
//       mail y est déjà arrivé pour de vrai (même internetMessageId) ;
//   (5) l'original part aux Éléments supprimés de la boîte de départ ;
//   (6) la ligne est confirmée (« fait »).
// Ensuite, dans la cible : une ancienne ligne « basculé vers » de la cible (aller-retour) est
// annulée pour que la copie reparaisse dans sa file ; si la copro était choisie, la copie est
// rangée chez le bon binôme de la cible (rangerMail) ; sinon le tri de la cible s'en charge
// (automatique ou à la main) quand le delta de sa réception la voit.
//
// Pannes (« ni perdu, ni en double ») :
//   - avant la copie (étapes 1 à 4 en échec) : la ligne est annulée, l'ancien rangement est
//     réécrit tel quel : le mail n'a pas bougé, il reste distribué à son binôme ;
//   - copie faite, original pas retiré (étape 5 ou 6 en échec, fonction coupée) : la ligne
//     reste « en_cours » ; la tâche planifiée de la boîte de départ la reprend (reprendreBascule) :
//     copie complète présente -> l'original part à la corbeille, ligne confirmée ; copie absente
//     ou incomplète -> copie partielle effacée, ligne annulée, l'original revient en réception
//     de la boîte de départ (dans la file du tri) ;
//   - recliquer refait le geste sans doublon : la copie se retrouve par son internetMessageId
//     dans la cible (complète : reprise telle quelle ; incomplète : effacée et refaite).
// Pas de bascule simulée : écriture coupée sur l'une des deux boîtes, ou pas de vrai Graph =
// refus lisible, rien n'est écrit ni dans les boîtes ni au journal (refusBascule).
//
// Droits (POINT À VALIDER par Sekou) : quiconque a accès au mail dans sa boîte de départ
// (le tri de cette boîte, ou le mail distribué à son binôme dans « E-mails ») peut le faire
// basculer ; on ne demande pas d'accès à la boîte cible. Les appelants (actions) vérifient
// l'accès ; le service ne lit pas auth.

import {
  boiteDeBascule,
  cleBascule,
  estBascule,
  memesPieces,
  nomBascule,
  refusBascule,
  type EtatBascule,
} from "@/lib/domain/bascule-boites";
import { BOITE_ECHANTILLON, boiteTri, boitesTri, ecritureTriPour, type BoiteTriConfig } from "@/lib/domain/mail-gate";
import { PAR_SYSTEME, type EntreeJournalTri } from "@/lib/domain/tri-emails";
import type { CoproDestination } from "@/lib/domain/recherche-copro-tolerante";
import { MailHorsReception } from "@/lib/ports/rangement-tri-provider";
import type { RecopieInterBoitesProvider } from "@/lib/ports/recopie-inter-boites";
import { DejaRangeErreur, type NouvelleEntreeJournal } from "@/lib/ports/tri-repository";
import { getRecopieInterBoites } from "@/lib/adapters/router";
import { depsParDefaut, rangerMail, resoudreDossier, type DepsRangement } from "./ranger";
import { coprosPourReaffecter } from "./reaffecter";
import { marquerRemis, marquerSortis } from "./synchroniser-reception";

/** Même fenêtre que la distribution aux binômes et « Pas pour moi ». */
const FENETRE_JOURS = 45;

export interface DepsBascule {
  source: DepsRangement;
  cible: DepsRangement;
  recopie: RecopieInterBoitesProvider | null;
  /** Pour refusBascule : config et interrupteurs déjà résolus. */
  etat: EtatBascule;
}

/** Les dépendances d'une bascule de `source` vers la boîte `cible` (adresse, vérifiée contre la config). */
export function depsBascule(source: BoiteTriConfig | null, cible: string): DepsBascule {
  const configCible = boiteTri(cible);
  return {
    source: depsParDefaut(source),
    cible: depsParDefaut(configCible),
    recopie: getRecopieInterBoites(),
    etat: {
      source: source?.boite ?? null,
      cible: configCible?.boite ?? (cible.trim().toLowerCase() || null),
      cibleConfiguree: Boolean(configCible),
      ecritureSource: ecritureTriPour(source),
      ecritureCible: ecritureTriPour(configCible),
      graph: process.env.MAIL_SOURCE === "graph",
    },
  };
}

export interface DemandeBascule {
  internetMessageId: string;
  /** La copro (de la boîte cible) si on la connaît : la copie y est rangée tout de suite. */
  copro?: string | null;
}

export interface ResultatBascule {
  boiteCible: string;
  /** Le dossier de la cible où la copie a été rangée ; null = laissée en réception, au tri de la cible. */
  dossierNom: string | null;
  /** Le mail était déjà dans la cible (copie d'un geste précédent, ou reçu là aussi) : rien n'a été recopié. */
  dejaPresent: boolean;
  /** Basculé, mais le rangement dans la cible a été refusé (raison) : la copie attend dans la réception. */
  rangementRefuse: string | null;
}

const depuis = () => new Date(Date.now() - FENETRE_JOURS * 86_400_000).toISOString();

/**
 * Le rangement encore actif du mail dans la boîte (null s'il n'y en a pas). Une ligne simulée
 * n'a jamais rien déplacé : elle est close au passage (sinon elle masquerait la ligne réelle).
 */
async function actifReel(deps: DepsRangement, boite: string, internetMessageId: string, par: string): Promise<EntreeJournalTri | null> {
  for (let i = 0; i < 3; i++) {
    const e = await deps.repo.rangementActif(boite, internetMessageId, depuis());
    if (!e || !e.simulation) return e;
    await deps.repo.marquerAnnule(e.id, par, "ligne simulée close par une bascule");
  }
  return null;
}

/** La copie dans la cible : reprise si elle est déjà là et complète, refaite sinon. */
async function assurerCopie(
  recopie: RecopieInterBoitesProvider,
  source: string,
  messageId: string,
  cible: string,
  internetMessageId: string,
): Promise<{ copieId: string; dejaPresent: boolean; enReception: boolean }> {
  const la = await recopie.situer(cible, internetMessageId);
  if (la && la.lieu !== "corbeille") {
    // Un vrai mail reçu dans la cible (même internetMessageId) : il y est déjà, on n'y touche pas.
    if (!la.recopieDe) return { copieId: la.messageId, dejaPresent: true, enReception: la.lieu === "reception" };
    if (memesPieces(await recopie.pieces(source, messageId), await recopie.pieces(cible, la.messageId))) {
      return { copieId: la.messageId, dejaPresent: true, enReception: la.lieu === "reception" };
    }
    // Copie interrompue au milieu de ses pièces : effacée, refaite.
    await recopie.effacerCopie(cible, la.messageId);
  }
  const { messageId: copieId } = await recopie.recopier(source, messageId, cible);
  return { copieId, dejaPresent: false, enReception: true };
}

/** Recrée un rangement annulé à tort (bascule interrompue avant la copie). */
async function retablir(deps: DepsRangement, e: EntreeJournalTri | null): Promise<void> {
  if (!e) return;
  const ligne: NouvelleEntreeJournal = {
    boite: e.boite,
    internetMessageId: e.internetMessageId,
    messageId: e.messageId,
    ...(e.conversationId ? { conversationId: e.conversationId } : {}),
    expediteur: e.expediteur,
    objet: e.objet,
    coproReference: e.coproReference,
    copros: e.copros,
    dossierNom: e.dossierNom,
    dossierCle: e.dossierCle,
    signal: e.signal,
    candidats: e.candidats,
    simulation: e.simulation,
    par: e.par,
  };
  await deps.repo.journaliser(ligne).catch((err: unknown) => {
    if (err instanceof DejaRangeErreur) return;
    console.error("[bascule] rangement d'origine non rétabli :", err instanceof Error ? err.message : err);
  });
}

/** Fait basculer le mail de la boîte de départ (`deps.source`) vers la boîte cible (`deps.cible`). */
export async function basculerMail(d: DemandeBascule, par: string, deps: DepsBascule): Promise<ResultatBascule> {
  const refus = refusBascule(deps.etat);
  if (refus) throw new Error(refus);
  const recopie = deps.recopie;
  const source = deps.source.boite;
  const cible = deps.cible.boite;
  if (!recopie || !source || !cible || deps.source.simulation || deps.cible.simulation) {
    throw new Error("La bascule entre boîtes demande l'écriture ouverte sur les deux boîtes : rien n'a été fait.");
  }
  const imid = d.internetMessageId;

  // (1) La destination d'abord : une copro inconnue de la cible ne doit rien déclencher.
  const destination = d.copro ? await resoudreDossier({ type: "copro", reference: d.copro }, deps.cible) : null;

  const ici = await recopie.situer(source, imid);
  if (!ici || ici.lieu === "corbeille") throw new Error(`Ce mail n'est plus dans la boîte ${source}.`);

  // (2) Le rangement actuel dans la boîte de départ.
  const actif = await actifReel(deps.source, source, imid, par);
  if (actif && estBascule(actif)) throw new Error(`Ce mail a déjà été basculé vers ${boiteDeBascule(actif.dossierCle)}.`);
  if (actif?.etat === "en_cours") throw new Error("Un rangement de ce mail est en cours : réessaie dans une minute.");
  if (actif && !(await deps.source.repo.marquerAnnule(actif.id, par, `basculé vers ${cible}`))) {
    throw new Error("Ce mail vient d'être modifié par quelqu'un d'autre : réessaie.");
  }

  // (3) La ligne « en_cours » de la bascule.
  const ligne: NouvelleEntreeJournal = {
    boite: source,
    internetMessageId: imid,
    messageId: ici.messageId,
    ...(ici.conversationId ? { conversationId: ici.conversationId } : {}),
    expediteur: ici.expediteur || actif?.expediteur || "",
    objet: ici.objet || actif?.objet || "",
    coproReference: destination?.copro ?? null,
    copros: [],
    dossierNom: nomBascule(cible),
    dossierCle: cleBascule(cible),
    signal: null,
    candidats: [],
    simulation: false,
    par,
  };
  let id: string | null;
  try {
    id = await deps.source.repo.ouvrirRangement(ligne);
  } catch (e) {
    await retablir(deps.source, actif);
    if (e instanceof DejaRangeErreur) throw new Error("Ce mail est déjà en train d'être rangé ou basculé : réessaie dans une minute.");
    throw e;
  }

  // (4) La copie.
  let copie: Awaited<ReturnType<typeof assurerCopie>>;
  try {
    copie = await assurerCopie(recopie, source, ici.messageId, cible, imid);
  } catch (e) {
    // Rien n'a bougé dans la boîte de départ : on rend la main comme avant le clic.
    if (id) await deps.source.repo.marquerAnnule(id, PAR_SYSTEME, "bascule : copie impossible").catch(() => false);
    await retablir(deps.source, actif);
    throw e;
  }

  // (5) L'original aux Éléments supprimés de la boîte de départ, (6) confirmation.
  const suite = `La copie est arrivée dans ${cible}, mais l'original n'a pas pu être retiré de ${source} : la tâche planifiée terminera d'ici quelques minutes.`;
  let retire = ici.messageId;
  try {
    retire = (await deps.source.rangement.supprimer(source, ici.messageId)).messageId;
  } catch (e) {
    if (!(e instanceof MailHorsReception)) throw new Error(suite, { cause: e });
  }
  await marquerSortis(deps.source.index, source, [imid]);
  try {
    if (id) await deps.source.repo.confirmerRangement(id, retire);
    else await deps.source.repo.journaliser({ ...ligne, messageId: retire });
  } catch (e) {
    console.error("[bascule] confirmation :", e instanceof Error ? e.message : e);
  }

  // Dans la cible : un aller-retour laisse une ligne « basculé vers » active qui cacherait la copie.
  const ancienne = await actifReel(deps.cible, cible, imid, par).catch(() => null);
  if (ancienne && estBascule(ancienne)) {
    await deps.cible.repo.marquerAnnule(ancienne.id, par, `revenu de ${source}`).catch(() => false);
    await marquerRemis(deps.cible.index, cible, imid, copie.copieId);
  }

  if (!destination?.copro) return { boiteCible: cible, dossierNom: null, dejaPresent: copie.dejaPresent, rangementRefuse: null };
  if (!copie.enReception || (ancienne && !estBascule(ancienne))) {
    return { boiteCible: cible, dossierNom: null, dejaPresent: copie.dejaPresent, rangementRefuse: `le mail est déjà rangé dans ${cible}` };
  }
  try {
    const r = await rangerMail(
      { messageId: copie.copieId, internetMessageId: imid, expediteur: ligne.expediteur, objet: ligne.objet, cible: { type: "copro", reference: destination.copro }, suggestion: null },
      par,
      deps.cible,
    );
    return { boiteCible: cible, dossierNom: r.dossierNom, dejaPresent: copie.dejaPresent, rangementRefuse: null };
  } catch (e) {
    return { boiteCible: cible, dossierNom: null, dejaPresent: copie.dejaPresent, rangementRefuse: e instanceof Error ? e.message : String(e) };
  }
}

export type IssueReprise = "confirmee" | "annulee" | "aucune";

/**
 * Reprise d'une bascule interrompue (ligne « en_cours » de plus de 2 min, tâche planifiée de la
 * boîte de DÉPART, appelée par reprendreEnCours). Voir l'en-tête : on termine si la copie
 * complète est dans la cible, on rend le mail à la boîte de départ sinon.
 */
export async function reprendreBascule(
  e: EntreeJournalTri,
  deps: DepsRangement,
  recopie: RecopieInterBoitesProvider | null = deps.recopie ?? null,
  ecritureCible: (boite: string) => boolean = (b) => ecritureTriPour(boiteTri(b)),
): Promise<IssueReprise> {
  const source = deps.boite;
  const cible = boiteDeBascule(e.dossierCle);
  if (!source || !cible || !recopie || deps.simulation) return "aucune";
  const imid = e.internetMessageId;

  const ici = await recopie.situer(source, imid);
  // L'original n'est plus là (ou seulement à la corbeille) : il n'est retiré qu'APRÈS la copie.
  if (!ici || ici.lieu === "corbeille") {
    await deps.repo.confirmerRangement(e.id, ici?.messageId ?? e.messageId);
    await marquerSortis(deps.index, source, [imid]);
    return "confirmee";
  }

  const la = await recopie.situer(cible, imid);
  const copieComplete =
    la !== null &&
    la.lieu !== "corbeille" &&
    (!la.recopieDe || memesPieces(await recopie.pieces(source, ici.messageId), await recopie.pieces(cible, la.messageId)));
  if (copieComplete) {
    let retire = ici.messageId;
    try {
      retire = (await deps.rangement.supprimer(source, ici.messageId)).messageId;
    } catch (err) {
      if (!(err instanceof MailHorsReception)) throw err;
    }
    await deps.repo.confirmerRangement(e.id, retire);
    await marquerSortis(deps.index, source, [imid]);
    return "confirmee";
  }

  // Copie absente ou incomplète : la bascule n'a pas eu lieu.
  if (la?.recopieDe && la.lieu !== "corbeille" && ecritureCible(cible)) {
    await recopie.effacerCopie(cible, la.messageId).catch((err: unknown) => console.error("[bascule] reprise, copie partielle :", err instanceof Error ? err.message : err));
  }
  if (!(await deps.repo.marquerAnnule(e.id, PAR_SYSTEME, "reprise : bascule interrompue avant la copie"))) return "aucune";
  // Son ancien rangement a été annulé au clic : le mail revient dans la file du tri.
  const { messageId } = ici.lieu === "reception" ? ici : await deps.rangement.remettreEnReception(source, ici.messageId);
  await marquerRemis(deps.index, source, imid, messageId);
  return "annulee";
}

/** Une boîte vers laquelle on peut faire basculer un mail. */
export interface DestinationBascule {
  boite: string;
  agences: string[];
}

/**
 * Les autres boîtes triées vers lesquelles un mail de `source` peut basculer MAINTENANT
 * (écriture ouverte sur les deux, vrai Graph). Vide si la bascule est fermée : les écrans
 * n'affichent alors rien de nouveau.
 */
export function destinationsDeBascule(source: string): DestinationBascule[] {
  const configSource = boiteTri(source);
  return boitesTri()
    .filter((b) => b.boite !== BOITE_ECHANTILLON && b.boite !== configSource?.boite)
    .filter((b) => refusBascule(depsBascule(configSource, b.boite).etat) === null)
    .map((b) => ({ boite: b.boite, agences: b.agences }));
}

/** Une copro d'une AUTRE boîte : choisie dans « Pas pour moi », elle fait basculer le mail. */
export type CoproAutreBoite = CoproDestination & { boite: string; agences: string[] };

/** Les copros des boîtes vers lesquelles le mail peut basculer (référentiel de chacune, en cache 10 min). */
export async function coprosDesAutresBoites(source: string): Promise<CoproAutreBoite[]> {
  const listes = await Promise.all(
    destinationsDeBascule(source).map(async (d) =>
      (await coprosPourReaffecter(boiteTri(d.boite))).map((c) => ({ ...c, boite: d.boite, agences: d.agences })),
    ),
  );
  return listes.flat();
}
