// Services du dossier de perte de copropriete (Sekou, 15/09/2026).
//
// Ouvrir un dossier = passer la copro INACTIVE au referentiel (elle sort de la
// facturation, des alertes, des listes) ET poser la checklist de la fiche process, datee
// depuis l'AG qui a nomme le nouveau syndic. Le dossier est la trace : quand, pourquoi,
// qui, et ou en est chaque etape.
//
// Passe par le routeur (ADR-001). Pas de cloisonnement : c'est un outil d'equipe, tout
// gestionnaire connecte lit et avance les etapes (la gestion des roles viendra plus tard).

import { getCoproRepository, getPerteRepository } from "@/lib/adapters/router";
import {
  avancement,
  controlesComplets,
  definitionEtape,
  estTermine,
  etapesInitiales,
  prochaineEtape,
  type AvancementPerte,
  type DossierPerte,
  type EtapePerte,
  type StatutEtape,
} from "@/lib/domain/perte/dossier";

const JOUR_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Le mot du journal pour chaque statut (« ignore » se dit « sans objet » dans une perte). */
const MOT_STATUT: Record<StatutEtape, string> = {
  a_faire: "a faire",
  en_cours: "en cours",
  bloque: "bloque",
  fait: "fait",
  ignore: "sans objet",
};
const jjmmaaaa = (iso: string) => iso.split("-").reverse().join("/");

export interface OuvertureDossierPerte {
  coproCode: string;
  /** AG qui a nomme le nouveau syndic. */
  dateAgISO: string;
  /** Dernier jour gere. Defaut : la date de l'AG. */
  finGestionISO?: string;
  motif?: string;
  /** Nom complet de qui ouvre. */
  par: string;
}

export async function ouvrirDossierPerte(input: OuvertureDossierPerte): Promise<DossierPerte> {
  if (!JOUR_RE.test(input.dateAgISO)) throw new Error("Perte de copropriété : date d'AG illisible.");
  const finGestionISO = input.finGestionISO ?? input.dateAgISO;
  if (!JOUR_RE.test(finGestionISO)) throw new Error("Perte de copropriété : date de fin de gestion illisible.");

  const copros = getCoproRepository();
  const copro = await copros.findByCode(input.coproCode);
  if (!copro) throw new Error(`Perte de copropriété : ${input.coproCode} introuvable.`);
  const perte = getPerteRepository();
  const existant = await perte.getEnCoursPourCopro(input.coproCode);
  if (existant) throw new Error(`Un dossier de perte est déjà ouvert pour ${input.coproCode}.`);

  const maintenant = new Date().toISOString();
  // L'etape « passer Inactive » est faite par l'ouverture elle-meme.
  const etapes = etapesInitiales().map((e) =>
    e.code === "LE3" ? { ...e, statut: "fait" as const, faitLeISO: maintenant.slice(0, 10), assigneA: input.par } : e,
  );
  const dossier = await perte.creer({
    coproCode: copro.code,
    coproNom: copro.nom,
    dateAgISO: input.dateAgISO,
    finGestionISO,
    ...(input.motif?.trim() ? { motif: input.motif.trim() } : {}),
    statut: "en_cours",
    etapes,
    journal: [
      { quandISO: maintenant, par: input.par, texte: `Dossier ouvert : AG du ${jjmmaaaa(input.dateAgISO)}, gérée jusqu'au ${jjmmaaaa(finGestionISO)}${input.motif?.trim() ? ` — ${input.motif.trim()}` : ""}` },
      { quandISO: maintenant, par: input.par, texte: "Copropriété passée inactive au référentiel" },
    ],
    creeParNom: input.par,
    creeLeISO: maintenant.slice(0, 10),
  });

  // Le statut au referentiel, apres la creation du dossier : si la perte echoue, le
  // dossier existe et le dit (etape LE3 a refaire) plutot que l'inverse.
  if (copro.statut === "active") {
    await copros.perdreCopro({ coproCode: copro.code, finGestionISO, par: input.par });
  }
  return dossier;
}

export interface MiseAJourEtape {
  statut?: StatutEtape;
  assigneA?: string | null;
  note?: string | null;
  /** Une case de la liste de controle. */
  controle?: { libelle: string; coche: boolean };
}

export async function mettreAJourEtapePerte(
  dossierId: string,
  code: string,
  patch: MiseAJourEtape,
  par: string,
): Promise<DossierPerte> {
  const repo = getPerteRepository();
  const dossier = await repo.get(dossierId);
  if (!dossier) throw new Error("Dossier de perte introuvable.");
  const def = definitionEtape(code);
  if (!def) throw new Error(`Étape inconnue : ${code}.`);

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const journal = [...dossier.journal];
  const etapes = dossier.etapes.map((e): EtapePerte => {
    if (e.code !== code) return e;
    let n: EtapePerte = { ...e };
    if (patch.controle) {
      n.controles = { ...(n.controles ?? {}), [patch.controle.libelle]: patch.controle.coche };
      // Toutes les cases cochees : l'etape est faite ; une case decochee la rouvre.
      if (controlesComplets(n) && n.statut !== "fait") {
        n = { ...n, statut: "fait", faitLeISO: aujourdhui };
        journal.push({ quandISO: new Date().toISOString(), par, texte: `${code} terminée (liste de contrôle complète)` });
      } else if (!patch.controle.coche && n.statut === "fait") {
        n = { ...n, statut: "en_cours" };
        delete n.faitLeISO;
      }
    }
    if (patch.statut && patch.statut !== n.statut) {
      n = { ...n, statut: patch.statut };
      if (patch.statut === "fait") n.faitLeISO = aujourdhui;
      else delete n.faitLeISO;
      journal.push({ quandISO: new Date().toISOString(), par, texte: `${code} → ${MOT_STATUT[patch.statut]}` });
    }
    if (patch.assigneA !== undefined) {
      if (patch.assigneA) n.assigneA = patch.assigneA;
      else delete n.assigneA;
    }
    if (patch.note !== undefined) {
      if (patch.note?.trim()) n.note = patch.note.trim();
      else delete n.note;
    }
    return n;
  });

  const maj: DossierPerte = { ...dossier, etapes, journal };
  maj.statut = estTermine(maj) ? "termine" : "en_cours";
  if (maj.statut === "termine" && dossier.statut !== "termine") {
    journal.push({ quandISO: new Date().toISOString(), par, texte: "Dossier terminé : toutes les étapes sont faites" });
  }
  await repo.sauver(maj);
  return maj;
}

export interface DossierPerteResume extends DossierPerte {
  avancement: AvancementPerte;
  prochaine: EtapePerte | null;
}

export async function listerDossiersPerte(aujourdhuiISO: string): Promise<DossierPerteResume[]> {
  const dossiers = await getPerteRepository().lister();
  return dossiers.map((d) => ({ ...d, avancement: avancement(d, aujourdhuiISO), prochaine: prochaineEtape(d, aujourdhuiISO) }));
}

export function getDossierPerte(id: string): Promise<DossierPerte | null> {
  return getPerteRepository().get(id);
}
