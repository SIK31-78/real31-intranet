// Service : « Pour BPO » (02/11/2026, Emmanuel) : déposer une ou plusieurs pièces jointes d'un
// mail dans le dossier SharePoint de dépôt des factures pour BPO (règles : domain/depot-bpo).
// Le dossier visé est TOUJOURS recalculé ici, côté serveur : le navigateur ne donne que le
// sous-dossier des initiales, contrôlé contre ceux qui existent. Les gardes de la boîte et du
// mail sont faites dans l'action. Plus tard, le dépôt ira dans ESTALE (décision Sekou) : le port
// DepotBpoProvider est l'endroit à changer.

import { getDepotBpoProvider, getMailboxProvider, getReferentielTriProvider } from "@/lib/adapters/router";
import { boitesTri } from "@/lib/domain/mail-gate";
import { cleDeReference } from "@/lib/domain/tri-emails";
import {
  RACINE_BPO,
  choisirDossierBpo,
  dossierAgenceBpo,
  dossierDuMois,
  jourDeParis,
  jourDuDossier,
  moisALire,
  nomFichierBpo,
  sousDossierParDefaut,
  type CibleBpo,
  type DossierDate,
  type PieceDeposee,
} from "@/lib/domain/depot-bpo";
import type { DepotBpoProvider } from "@/lib/ports/depot-bpo-provider";

export type { CibleBpo, PieceDeposee };

export type ResultatCibleBpo = { ok: true; cible: CibleBpo } | { ok: false; motif: string };

/** La copro dans le référentiel des boîtes triées : son agence et si elle est dans ESTALE. */
async function coproDuReferentiel(coproCode: string): Promise<{ agence?: string; estale: boolean } | null> {
  const cle = cleDeReference(coproCode);
  if (!cle) return null;
  const agences = [...new Set(boitesTri().flatMap((b) => b.agences))];
  if (!agences.length) return null;
  const { copros } = await getReferentielTriProvider(agences).charger();
  const c = copros.find((x) => cleDeReference(x.reference) === cle);
  return c ? { ...(c.agence ? { agence: c.agence } : {}), estale: c.source === "estale" } : null;
}

export interface DepsBpo {
  depot: DepotBpoProvider;
  copro: (coproCode: string) => Promise<{ agence?: string; estale: boolean } | null>;
  maintenant: () => Date;
}

const depsParDefaut = (): DepsBpo => ({ depot: getDepotBpoProvider(), copro: coproDuReferentiel, maintenant: () => new Date() });

/** Le dossier daté et ses chemins, ou le motif lisible. */
async function dossierDate(depot: DepotBpoProvider, agence: string, maintenant: Date): Promise<{ ok: true; d: DossierDate } | { ok: false; motif: string }> {
  const aujourdhui = jourDeParis(maintenant);
  const candidats: DossierDate[] = [];
  const annees = new Map<number, Promise<string[] | null>>();
  for (const { annee, mois } of moisALire(aujourdhui)) {
    if (!annees.has(annee)) annees.set(annee, depot.listerDossiers([RACINE_BPO, agence, String(annee)]));
    const moisNoms = await annees.get(annee)!;
    const dossierMois = moisNoms ? dossierDuMois(moisNoms, mois) : null;
    if (!dossierMois) continue;
    const chemin = [RACINE_BPO, agence, String(annee), dossierMois];
    for (const nom of (await depot.listerDossiers(chemin)) ?? []) {
      const jour = jourDuDossier(nom, annee, mois);
      if (jour) candidats.push({ nom, chemin: [...chemin, nom], jour });
    }
  }
  const d = choisirDossierBpo(candidats, aujourdhui);
  return d ? { ok: true, d } : { ok: false, motif: `Aucun dossier daté à venir dans ${RACINE_BPO}/${agence} : la compta ne l'a pas encore créé. Rien n'est déposé ailleurs.` };
}

/**
 * Le dossier où la pièce partirait. L'agence est celle de la copro du mail (référentiel des
 * boîtes triées), sinon celle de la personne ; HLS passe par LGC.
 */
export async function cibleBpo(
  p: { coproCode: string; agencePersonne: string | undefined; initiales: string },
  deps: DepsBpo = depsParDefaut(),
): Promise<ResultatCibleBpo> {
  const copro = p.coproCode ? await deps.copro(p.coproCode).catch(() => null) : null;
  const agenceSource = copro?.agence ?? p.agencePersonne;
  const agence = dossierAgenceBpo(agenceSource);
  if (!agence) return { ok: false, motif: `Pas de dossier de dépôt BPO pour l'agence ${agenceSource ?? "inconnue"} (Compta/LGC ou Compta/ML seulement).` };
  try {
    const r = await dossierDate(deps.depot, agence, deps.maintenant());
    if (!r.ok) return r;
    const sousDossiers = ((await deps.depot.listerDossiers(r.d.chemin)) ?? []).sort((a, b) => a.localeCompare(b, "fr"));
    const aujourdhui = jourDeParis(deps.maintenant());
    return {
      ok: true,
      cible: {
        dossier: r.d.chemin.join("/"),
        jour: r.d.nom,
        duJour: r.d.jour.annee === aujourdhui.annee && r.d.jour.mois === aujourdhui.mois && r.d.jour.jour === aujourdhui.jour,
        sousDossiers,
        parDefaut: sousDossierParDefaut(sousDossiers, p.initiales),
        estale: copro?.estale ?? false,
        ecritureActive: deps.depot.ecritureActive,
      },
    };
  } catch (e) {
    console.warn("[bpo] dossier de dépôt illisible :", e instanceof Error ? e.message : e);
    return { ok: false, motif: "Le dossier de dépôt BPO est illisible pour le moment (SharePoint). Réessaie dans un instant." };
  }
}


/**
 * Dépose les pièces jointes choisies du mail dans « <dossier daté>/<sousDossier> ». Le dossier
 * est recalculé ; le sous-dossier doit exister (jamais créé) ; une copro ESTALE demande une
 * confirmation explicite. Une pièce qui échoue n'arrête pas les autres.
 */
export async function deposerPourBpo(
  p: {
    boite: string;
    internetMessageId: string;
    pjIds: string[];
    sousDossier: string;
    coproCode: string;
    agencePersonne: string | undefined;
    initiales: string;
    confirmeEstale: boolean;
  },
  deps: DepsBpo & { lirePiece?: (attachmentId: string) => Promise<{ nom: string; type: string; base64: string }> } = depsParDefaut(),
): Promise<{ ok: true; dossier: string; pieces: PieceDeposee[] } | { ok: false; motif: string }> {
  const r = await cibleBpo(p, deps);
  if (!r.ok) return r;
  const { cible } = r;
  if (!cible.ecritureActive) return { ok: false, motif: "Le dépôt dans SharePoint n'est pas encore activé (droit d'écriture à accorder sur le site Syndic)." };
  if (cible.estale && !p.confirmeEstale) return { ok: false, motif: "Cette copropriété est dans ESTALE : ses factures vont dans ESTALE, pas chez BPO." };
  const sous = cible.sousDossiers.find((x) => x === p.sousDossier);
  if (!sous) return { ok: false, motif: `Le dossier « ${p.sousDossier} » n'existe pas dans ${cible.dossier} : choisis-en un de la liste.` };
  const lire =
    deps.lirePiece ?? ((attachmentId: string) => getMailboxProvider().lirePieceJointe({ boite: p.boite, internetMessageId: p.internetMessageId, attachmentId }));
  const chemin = [...cible.dossier.split("/"), sous];
  const pieces: PieceDeposee[] = [];
  for (const id of p.pjIds) {
    try {
      const pj = await lire(id);
      const nom = nomFichierBpo(pj.nom);
      const d = await deps.depot.deposer({ chemin, nomFichier: nom, contenu: Buffer.from(pj.base64, "base64"), contentType: pj.type });
      pieces.push(d.depose ? { nom, depose: true, ...(d.nom && d.nom !== nom ? { detail: d.nom } : {}) } : { nom, depose: false, detail: d.raison });
    } catch (e) {
      console.warn("[bpo] pièce jointe illisible :", e instanceof Error ? e.message : e);
      pieces.push({ nom: "pièce jointe", depose: false, detail: "pièce jointe illisible dans la boîte." });
    }
  }
  return { ok: true, dossier: chemin.join("/"), pieces };
}
