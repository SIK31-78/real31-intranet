// Rangement d'un mail de la boite generique (ADR-046, increment 2) : au clic, le mail part
// dans le dossier du binome de sa copro (ou dans « Comptabilité » / « Divers »), et une
// ligne de journal garde le signal qui l'avait propose. Annulable.
//
// SECURITE : l'ecriture reelle dans la boite n'est branchee que si MAIL_TRI_ECRITURE=on
// (routeur). Sinon le rangement est simule : journalise, mais aucun mail ne bouge.

import {
  DOSSIERS_HORS_BINOME,
  destinationDe,
  type CibleTri,
  type NatureSuggestion,
} from "@/lib/domain/tri-emails";
import { boiteTriConfiguree, ecritureTriActive } from "@/lib/domain/mail-gate";
import type { RangementTriProvider } from "@/lib/ports/rangement-tri-provider";
import type { ReferentielTriProvider } from "@/lib/ports/referentiel-tri-provider";
import type { TriRepository } from "@/lib/ports/tri-repository";
import {
  getGestionnaireRepository,
  getRangementTri,
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
}

/** Le rangement est-il simule ? Oui tant que l'ecriture n'est pas ouverte sur une vraie boite. */
export function rangementSimule(boite: string | null = boiteTriConfiguree()): boolean {
  return !(ecritureTriActive() && process.env.MAIL_SOURCE === "graph" && boite !== null && boite !== "echantillon");
}

export function depsParDefaut(): DepsRangement {
  const boite = boiteTriConfiguree();
  return {
    boite,
    simulation: rangementSimule(boite),
    rangement: getRangementTri(),
    referentiel: getReferentielTriProvider(),
    repo: getTriRepository(),
    initialesParEmail: async () => {
      const out: Record<string, string> = {};
      for (const g of await getGestionnaireRepository().listTous()) {
        if (g.email && g.initiales) out[g.email.trim().toLowerCase()] = g.initiales;
      }
      return out;
    },
  };
}

export interface DemandeRangement {
  /** Id Graph du mail tel que la file l'a affiche. */
  messageId: string;
  internetMessageId: string;
  expediteur: string;
  objet: string;
  cible: CibleTri;
  /** La suggestion affichee au moment du clic (mesure de fiabilite des signaux). */
  suggestion: { nature: NatureSuggestion; candidats: string[] } | null;
}

export interface ResultatRangement {
  journalId: string;
  dossierNom: string;
  simulation: boolean;
}

/** Ou ranger : cle stable du dossier + nom attendu. Erreur lisible si on ne peut pas. */
async function resoudreDossier(cible: CibleTri, deps: DepsRangement): Promise<{ cle: string; nom: string; copro: string | null }> {
  if (cible.type !== "copro") return { cle: cible.type, nom: DOSSIERS_HORS_BINOME[cible.type], copro: null };
  const [ref, initiales, binomes] = await Promise.all([
    deps.referentiel.charger(),
    deps.initialesParEmail(),
    deps.repo.binomes(),
  ]);
  const copro = ref.copros.find((c) => c.reference === cible.reference);
  if (!copro) throw new Error(`La copropriété ${cible.reference} n'est pas dans ESTALE.`);
  const dest = destinationDe(copro, initiales, binomes);
  if (!dest) throw new Error(`${copro.reference} n'a pas de gestionnaire au mandat dans ESTALE : rangement impossible.`);
  if (!dest.nomDossier) {
    throw new Error(`Les initiales de ${dest.gestionnaire.nomComplet} sont inconnues dans l'intranet : rangement impossible.`);
  }
  return { cle: dest.cle, nom: dest.nomDossier, copro: copro.reference };
}

export async function rangerMail(
  d: DemandeRangement,
  par: string,
  deps: DepsRangement = depsParDefaut(),
): Promise<ResultatRangement> {
  const boite = deps.boite;
  if (!boite) throw new Error("Le tri des e-mails n'est pas configuré.");

  const lu = await deps.rangement.lireEnReception(boite, d.messageId);
  if (!lu) throw new Error("Ce mail n'est plus dans la boîte de réception : quelqu'un l'a sans doute déjà rangé.");
  // En reel, la boite fait foi ; en simulation, on garde ce que la file a affiche.
  const internetMessageId = lu.internetMessageId || d.internetMessageId;
  if ((await deps.repo.dejaRanges(boite, [internetMessageId])).size > 0) {
    throw new Error("Ce mail a déjà été rangé.");
  }

  const { cle, nom, copro } = await resoudreDossier(d.cible, deps);

  const connu = await deps.repo.dossier(boite, cle);
  const { folderId } = await deps.rangement.assurerDossier(boite, { folderIdConnu: connu?.folderId ?? null, nom });
  // Un id de dossier simule ne doit jamais etre retenu : le jour ou l'ecriture s'ouvre, il
  // ferait echouer la reprise du vrai dossier.
  if (!deps.simulation && (connu?.folderId !== folderId || connu?.nom !== nom)) {
    await deps.repo.enregistrerDossier(boite, cle, { folderId, nom });
  }

  const { messageId } = await deps.rangement.deplacer(boite, d.messageId, folderId);

  const journalId = await deps.repo.journaliser({
    boite,
    internetMessageId,
    messageId,
    expediteur: lu.expediteur || d.expediteur,
    objet: lu.objet || d.objet,
    coproReference: copro,
    dossierNom: nom,
    signal: d.suggestion?.nature ?? null,
    candidats: d.suggestion?.candidats ?? [],
    simulation: deps.simulation,
    par,
  });
  return { journalId, dossierNom: nom, simulation: deps.simulation };
}

/** Annule un rangement : le mail revient dans la boite de reception, la ligne est marquee. */
export async function annulerRangement(
  journalId: string,
  par: string,
  deps: DepsRangement = depsParDefaut(),
): Promise<void> {
  const e = await deps.repo.entree(journalId);
  if (!e || e.annuleLe) throw new Error("Ce rangement n'existe plus ou a déjà été annulé.");
  if (e.boite !== deps.boite) throw new Error("Ce rangement concerne une autre boîte.");
  if (!e.simulation) {
    // Un vrai rangement ne s'annule qu'avec l'ecriture ouverte : sinon on marquerait
    // « annule » un mail reste dans le dossier.
    if (deps.simulation) throw new Error("L'écriture dans la boîte est coupée : ce rangement réel ne peut pas être annulé d'ici.");
    try {
      await deps.rangement.remettreEnReception(e.boite, e.messageId);
    } catch (err) {
      if (err instanceof Error && / 404 /.test(err.message)) {
        throw new Error("Le mail n'est plus là où l'intranet l'avait rangé (déplacé ou supprimé dans Outlook). Remets-le à la main.");
      }
      throw err;
    }
  }
  await deps.repo.marquerAnnule(journalId, par);
}
