// Rangement d'un mail de la boite generique (ADR-046, increment 2) : au clic, le mail part
// dans le dossier du binome de sa copro (ou dans « Comptabilité » / « Divers »), et une
// ligne de journal garde le signal qui l'avait propose. Annulable.
//
// SECURITE : l'ecriture reelle dans la boite n'est branchee que si elle est ouverte pour
// CETTE boite (MAIL_TRI_ECRITURE=on ET `ecriture` de sa config, routeur). Sinon le rangement
// est simule : journalise, mais aucun mail ne bouge.
//
// Plusieurs boites (V2 du 27/10/2026) : les dependances se construisent pour UNE boite
// (depsParDefaut(config)) : son referentiel (ses agences), son ecriture. Aucune boite par
// defaut : l'appelant dit laquelle.
//
// Index de la reception (REA-419, 27/10/2026) : un mail range ou supprime pour de vrai sort de
// l'index tout de suite, une annulation l'y remet ; la file n'attend pas le delta suivant. En
// simulation, l'index ne bouge pas : le mail est toujours dans la boite, c'est le journal qui
// le cache de la file (et le jour ou l'ecriture s'ouvre, les lignes simulees ne comptent plus).
//
// Journal transactionnel (REA-420, 27/10/2026) : avant, le mail etait deplace PUIS journalise ;
// Supabase en panne ou la fonction coupee entre les deux laissait un mail dans le dossier du
// binome sans ligne, donc invisible dans « E-mails » (qui distribue d'apres le journal) et
// jamais repris. Maintenant (deplacerEtJournaliser) : (a) ligne « en_cours » ecrite AVANT le
// deplacement, (b) deplacement, (c) etiquette, (d) ligne confirmee (« fait », id definitif).
// Deplacement refuse en 404 (le mail n'est plus en reception) : ligne annulee par « systeme ».
// Toute autre panne en (b) ou (d) : la ligne reste « en_cours », la tache planifiee la reprend
// (reprendre-en-cours.ts). Une ligne « en_cours » de moins de 2 min compte comme « deja
// range » : un clic et l'automatique ne rangent pas le meme mail en meme temps, et l'index
// unique des rangements actifs refuse le second (DejaRangeErreur). Colonne `etat` absente
// (SQL pas encore passe) : journalise apres le deplacement, comme avant.

import {
  DOSSIER_CORBEILLE,
  DOSSIERS_HORS_BINOME,
  PAR_SYSTEME,
  cleDeReference,
  destinationDe,
  dossiersChoisissables,
  lignesBinomes,
  type MembreTri,
  type CibleTri,
  type SignalTri,
} from "@/lib/domain/tri-emails";
import { boiteTri, ecritureTriPour, type BoiteTriConfig } from "@/lib/domain/mail-gate";
import { MailHorsReception, type RangementTriProvider } from "@/lib/ports/rangement-tri-provider";
import type { ReferentielTriProvider } from "@/lib/ports/referentiel-tri-provider";
import { DejaRangeErreur, type NouvelleEntreeJournal, type TriRepository } from "@/lib/ports/tri-repository";
import type { ReceptionIndex } from "@/lib/ports/reception-index";
import { marquerRemis, marquerSortis } from "./synchroniser-reception";
import { listerGestionnairesCabinet } from "./binomes";
import {
  getGestionnaireRepository,
  getRangementTri,
  getReceptionIndex,
  getReferentielTriProvider,
  getTriRepository,
} from "@/lib/adapters/router";

export interface DepsRangement {
  boite: string | null;
  /** true = rien n'ecrit dans la boite (journal marque "simulation"). */
  simulation: boolean;
  rangement: RangementTriProvider;
  referentiel: ReferentielTriProvider;
  repo: TriRepository;
  initialesParEmail: () => Promise<Record<string, string>>;
  /** Gestionnaires du cabinet (dossiers de binome choisissables a la main). */
  gestionnaires: () => Promise<MembreTri[]>;
  /** Index de la reception, tenu a jour a chaque geste reel ; absent (tests) = rien a tenir. */
  index?: ReceptionIndex;
}

/** Le rangement est-il simule ? Oui tant que l'ecriture n'est pas ouverte sur cette vraie boite. */
export function rangementSimule(config: BoiteTriConfig | null): boolean {
  return !(ecritureTriPour(config) && process.env.MAIL_SOURCE === "graph");
}

/** Les dependances du rangement pour UNE boite triee (null = rien de configure : tout refuse). */
export function depsParDefaut(config: BoiteTriConfig | null): DepsRangement {
  return {
    boite: config?.boite ?? null,
    simulation: rangementSimule(config),
    rangement: getRangementTri(config),
    referentiel: getReferentielTriProvider(config?.agences ?? []),
    repo: getTriRepository(),
    initialesParEmail: async () => {
      const out: Record<string, string> = {};
      for (const g of await getGestionnaireRepository().listTous()) {
        if (g.email && g.initiales) out[g.email.trim().toLowerCase()] = g.initiales;
      }
      return out;
    },
    gestionnaires: listerGestionnairesCabinet,
    index: getReceptionIndex(),
  };
}

export interface DemandeRangement {
  /** Id Graph du mail tel que la file l'a affiche. */
  messageId: string;
  internetMessageId: string;
  expediteur: string;
  objet: string;
  cible: CibleTri;
  /** La suggestion affichee au moment du clic (mesure de fiabilite des signaux) ; « pj » si
   *  la copro venait de la lecture des pieces jointes (signalDuRangement). */
  suggestion: { nature: SignalTri; candidats: string[] } | null;
}

export interface ResultatRangement {
  journalId: string;
  dossierNom: string;
  simulation: boolean;
  /** Le mail est range mais l'etiquette n'a pas pu etre posee (message a afficher). */
  etiquetteNonPosee: boolean;
}

/** Ou ranger : cle stable du dossier, nom attendu, etiquettes. Erreur lisible si on ne peut pas. */
export async function resoudreDossier(
  cible: CibleTri,
  deps: DepsRangement,
): Promise<{ cle: string; nom: string; copro: string | null; copros: string[] }> {
  if (cible.type !== "copro" && cible.type !== "dossier") {
    return { cle: cible.type, nom: DOSSIERS_HORS_BINOME[cible.type], copro: null, copros: [] };
  }
  const [ref, initiales, binomes] = await Promise.all([
    deps.referentiel.charger(),
    deps.initialesParEmail(),
    deps.repo.binomes(),
  ]);
  if (cible.type === "dossier") {
    // Dossier choisi a la main : il doit exister parmi les binomes, chaque etiquette doit
    // etre une copro ESTALE.
    const lignes = lignesBinomes(await deps.gestionnaires(), ref.copros, binomes, initiales);
    const dossier = dossiersChoisissables(lignes).find((d) => d.cle === cible.cle);
    if (!dossier) throw new Error("Ce dossier de binôme n'existe pas (ou plus).");
    const copros = [...new Set(cible.copros)];
    const inconnue = copros.find((r) => !ref.copros.some((c) => c.reference === r));
    if (inconnue) throw new Error(`La copropriété ${inconnue} n'est pas dans ESTALE.`);
    return { cle: dossier.cle, nom: dossier.nom, copro: copros[0] ?? null, copros };
  }
  const copro = ref.copros.find((c) => c.reference === cible.reference);
  if (!copro) throw new Error(`La copropriété ${cible.reference} n'est pas dans ESTALE.`);
  const dest = destinationDe(copro, initiales, binomes);
  if (!dest) throw new Error(`${copro.reference} n'a pas de gestionnaire au mandat dans ESTALE : rangement impossible.`);
  if (!dest.nomDossier) {
    throw new Error(`Les initiales de ${dest.gestionnaire.nomComplet} sont inconnues dans l'intranet : rangement impossible.`);
  }
  return { cle: dest.cle, nom: dest.nomDossier, copro: copro.reference, copros: [copro.reference] };
}

/** Pose l'etiquette sans faire echouer le rangement : le mail est deja au bon endroit. */
export async function etiqueterSansBloquer(
  deps: DepsRangement,
  boite: string,
  messageId: string,
  p: { ajouter?: string[]; retirer?: string[] },
): Promise<boolean> {
  try {
    await deps.rangement.etiqueter(boite, messageId, p);
    return true;
  } catch (e) {
    console.error("[tri-emails] etiquette :", e instanceof Error ? e.message : e);
    return false;
  }
}

const DEJA_RANGE = "Ce mail a déjà été rangé.";

/**
 * Le geste transactionnel commun au rangement et a la suppression (REA-420, voir l'en-tete) :
 * ligne « en_cours », deplacement, etiquette (`apres`), confirmation. Rend l'id de la ligne.
 */
async function deplacerEtJournaliser(
  deps: DepsRangement,
  ligne: NouvelleEntreeJournal,
  deplacer: () => Promise<{ messageId: string }>,
  apres: (messageId: string) => Promise<void> = async () => {},
): Promise<string> {
  let id: string | null;
  try {
    id = await deps.repo.ouvrirRangement(ligne);
  } catch (e) {
    if (e instanceof DejaRangeErreur) throw new Error(DEJA_RANGE);
    throw e;
  }

  let messageId: string;
  try {
    ({ messageId } = await deplacer());
  } catch (e) {
    // Rien n'a bouge : la ligne est close tout de suite. Autre panne : on ne sait pas si le
    // deplacement a eu lieu (reponse perdue), la ligne reste « en_cours » pour la reprise.
    if (id && e instanceof MailHorsReception) {
      await deps.repo
        .marquerAnnule(id, PAR_SYSTEME, "déplacement refusé : le mail n'était plus en réception")
        .catch((err: unknown) => console.error("[tri-emails] annulation de la ligne en cours :", err instanceof Error ? err.message : err));
    }
    throw e;
  }
  if (!deps.simulation) await marquerSortis(deps.index, ligne.boite, [ligne.internetMessageId]);
  await apres(messageId);

  // Repli sans colonne `etat` : la ligne s'ecrit apres coup, comme avant le 27/10/2026.
  if (!id) return deps.repo.journaliser({ ...ligne, messageId });
  try {
    await deps.repo.confirmerRangement(id, messageId);
  } catch (e) {
    console.error("[tri-emails] confirmation du rangement :", e instanceof Error ? e.message : e);
    throw new Error("Le mail est rangé, mais le journal n'a pas pu être confirmé : la tâche planifiée le reprendra d'ici quelques minutes.", { cause: e });
  }
  return id;
}

export async function rangerMail(
  d: DemandeRangement,
  par: string,
  deps: DepsRangement,
): Promise<ResultatRangement> {
  const boite = deps.boite;
  if (!boite) throw new Error("Le tri des e-mails n'est pas configuré.");

  const lu = await deps.rangement.lireEnReception(boite, d.messageId);
  if (!lu) throw new Error("Ce mail n'est plus dans la boîte de réception : quelqu'un l'a sans doute déjà rangé.");
  // En reel, la boite fait foi ; en simulation, on garde ce que la file a affiche.
  const internetMessageId = lu.internetMessageId || d.internetMessageId;
  // En reel, une ligne simulee ne compte pas : elle n'a jamais deplace le mail (27/10/2026).
  if ((await deps.repo.dejaRanges(boite, [internetMessageId], { reellesSeulement: !deps.simulation })).size > 0) {
    throw new Error(DEJA_RANGE);
  }

  const { cle, nom, copro, copros } = await resoudreDossier(d.cible, deps);

  const connu = await deps.repo.dossier(boite, cle);
  const { folderId } = await deps.rangement.assurerDossier(boite, { folderIdConnu: connu?.folderId ?? null, nom });
  // Un id de dossier simule ne doit jamais etre retenu : le jour ou l'ecriture s'ouvre, il
  // ferait echouer la reprise du vrai dossier.
  if (!deps.simulation && (connu?.folderId !== folderId || connu?.nom !== nom)) {
    await deps.repo.enregistrerDossier(boite, cle, { folderId, nom });
  }

  let etiquetee = true;
  const journalId = await deplacerEtJournaliser(
    deps,
    {
      boite,
      internetMessageId,
      // Provisoire : l'id d'avant le deplacement, remplace a la confirmation.
      messageId: d.messageId,
      ...(lu.conversationId ? { conversationId: lu.conversationId } : {}),
      expediteur: lu.expediteur || d.expediteur,
      objet: lu.objet || d.objet,
      coproReference: copro,
      copros,
      dossierNom: nom,
      dossierCle: cle,
      signal: d.suggestion?.nature ?? null,
      candidats: d.suggestion?.candidats ?? [],
      simulation: deps.simulation,
      par,
    },
    () => deps.rangement.deplacer(boite, d.messageId, folderId),
    // L'etiquette au code copro, pour chercher dans Outlook (increment 3). Pas d'etiquette
    // pour Comptabilité / Divers : ils n'ont pas de copro.
    async (messageId) => {
      if (copros.length) etiquetee = await etiqueterSansBloquer(deps, boite, messageId, { ajouter: copros });
    },
  );
  return { journalId, dossierNom: nom, simulation: deps.simulation, etiquetteNonPosee: !etiquetee };
}

/** Dossier « corbeille » du journal : un mail supprime (newsletter, spam) mis aux elements supprimes. */
export const CORBEILLE_CLE = DOSSIER_CORBEILLE;
const CORBEILLE_NOM = "Corbeille";

/**
 * Supprime un mail de la file : a la corbeille (elements supprimes, recuperable), journalise.
 * En simulation (ecriture coupee), rien ne bouge dans la boite : le mail est juste retire de
 * la file et journalise. Annulable comme un rangement (annulerRangement).
 */
export async function supprimerMail(
  d: Pick<DemandeRangement, "messageId" | "internetMessageId" | "expediteur" | "objet" | "suggestion">,
  par: string,
  deps: DepsRangement,
): Promise<ResultatRangement> {
  const boite = deps.boite;
  if (!boite) throw new Error("Le tri des e-mails n'est pas configuré.");

  const lu = await deps.rangement.lireEnReception(boite, d.messageId);
  if (!lu) throw new Error("Ce mail n'est plus dans la boîte de réception : quelqu'un l'a sans doute déjà rangé.");
  const internetMessageId = lu.internetMessageId || d.internetMessageId;
  if ((await deps.repo.dejaRanges(boite, [internetMessageId], { reellesSeulement: !deps.simulation })).size > 0) {
    throw new Error(DEJA_RANGE);
  }

  const journalId = await deplacerEtJournaliser(
    deps,
    {
      boite,
      internetMessageId,
      messageId: d.messageId,
      expediteur: lu.expediteur || d.expediteur,
      objet: lu.objet || d.objet,
      coproReference: null,
      copros: [],
      dossierNom: CORBEILLE_NOM,
      dossierCle: CORBEILLE_CLE,
      signal: d.suggestion?.nature ?? null,
      candidats: d.suggestion?.candidats ?? [],
      simulation: deps.simulation,
      par,
    },
    () => deps.rangement.supprimer(boite, d.messageId),
  );
  return { journalId, dossierNom: CORBEILLE_NOM, simulation: deps.simulation, etiquetteNonPosee: false };
}

/** Annule un rangement : le mail revient dans la boite de reception, sans son etiquette. */
export async function annulerRangement(
  journalId: string,
  par: string,
  deps: DepsRangement,
): Promise<void> {
  const e = await deps.repo.entree(journalId);
  if (!e || e.annuleLe) throw new Error("Ce rangement n'existe plus ou a déjà été annulé.");
  if (e.boite !== deps.boite) throw new Error("Ce rangement concerne une autre boîte.");
  if (!e.simulation) {
    // Un vrai rangement ne s'annule qu'avec l'ecriture ouverte : sinon on marquerait
    // « annule » un mail reste dans le dossier.
    if (deps.simulation) throw new Error("L'écriture dans la boîte est coupée : ce rangement réel ne peut pas être annulé d'ici.");
    // On retrouve le mail ou qu'il soit : glisse a la main, il a change d'id.
    const pos = await deps.rangement.localiser(e.boite, e.internetMessageId);
    if (!pos) throw new Error("Le mail est introuvable dans la boîte (supprimé ?) : rien à annuler.");
    const { messageId } = pos.enReception ? pos : await deps.rangement.remettreEnReception(e.boite, pos.messageId);
    if (e.copros.length) await etiqueterSansBloquer(deps, e.boite, messageId, { retirer: e.copros });
    await marquerRemis(deps.index, e.boite, e.internetMessageId, messageId);
  }
  await deps.repo.marquerAnnule(journalId, par);
}

/**
 * Precise la copro d'un mail glisse dans un dossier qui en recoit plusieurs : pose
 * l'etiquette et complete le journal. La copro doit bien aller dans ce dossier.
 */
export async function preciserCopro(
  journalId: string,
  reference: string,
  deps: DepsRangement,
): Promise<void> {
  const e = await deps.repo.entree(journalId);
  if (!e || e.annuleLe) throw new Error("Ce rangement n'existe plus.");
  if (e.boite !== deps.boite) throw new Error("Ce rangement concerne une autre boîte.");
  if (e.coproReference) throw new Error("La copropriété de ce mail est déjà connue.");
  if (!e.dossierCle?.startsWith("binome:")) throw new Error("Ce mail n'est pas dans un dossier de binôme.");
  const dossier = await resoudreDossier({ type: "copro", reference }, deps);
  if (dossier.cle !== e.dossierCle) throw new Error(`${reference} ne va pas dans le dossier ${e.dossierNom}.`);
  if (!e.simulation && !deps.simulation) {
    const pos = await deps.rangement.localiser(e.boite, e.internetMessageId);
    if (pos) await etiqueterSansBloquer(deps, e.boite, pos.messageId, { ajouter: [reference] });
  }
  await deps.repo.majCopro(journalId, reference);
}

/**
 * Fenetre de LECTURE du journal pour une correction : la meme que la distribution aux
 * binomes (boites-visibles). Rien n'est purge : le journal garde tout, on ne corrige
 * simplement pas un rangement plus ancien.
 */
const FENETRE_CORRECTION_JOURS = 45;

/**
 * Corrige la copro d'un mail deja distribue, depuis « E-mails » : le journal du tri prend la
 * nouvelle copro (c'est lui qui fait foi pour les collegues du binome, et qui mesure la
 * fiabilite des suggestions), et l'etiquette Outlook suit si l'ecriture est ouverte.
 * Le mail ne change PAS de dossier : si la nouvelle copro releve d'un autre binome, on le
 * signale (`autreDossier`), on ne deplace rien dans la vraie boite.
 * `code` : le code saisi (S247 ou S0247), vide = retirer la copro.
 */
export async function corrigerCopro(
  boite: string,
  internetMessageId: string,
  code: string,
  deps: DepsRangement = depsParDefaut(boiteTri(boite)),
): Promise<{ corrige: boolean; autreDossier?: string; reference?: string }> {
  const depuis = new Date(Date.now() - FENETRE_CORRECTION_JOURS * 86_400_000).toISOString();
  const e = await deps.repo.rangementActif(boite, internetMessageId, depuis);
  if (!e) return { corrige: false };

  let reference: string | null = null;
  if (code) {
    const cle = cleDeReference(code);
    const copro = (await deps.referentiel.charger()).copros.find((c) => cleDeReference(c.reference) === cle);
    if (!copro) throw new Error(`La copropriété ${code} n'est pas dans ESTALE.`);
    reference = copro.reference;
  }
  if (reference === e.coproReference) return { corrige: false };

  if (!e.simulation && !deps.simulation) {
    const pos = await deps.rangement.localiser(e.boite, e.internetMessageId);
    if (pos) {
      await etiqueterSansBloquer(deps, e.boite, pos.messageId, {
        ...(reference ? { ajouter: [reference] } : {}),
        ...(e.copros.length ? { retirer: e.copros.filter((c) => c !== reference) } : {}),
      });
    }
  }
  await deps.repo.majCopro(e.id, reference);

  if (!reference || !e.dossierCle?.startsWith("binome:")) return { corrige: true };
  const attendu = await resoudreDossier({ type: "copro", reference }, deps).catch(() => null);
  return attendu && attendu.cle !== e.dossierCle ? { corrige: true, autreDossier: attendu.nom, reference } : { corrige: true };
}
