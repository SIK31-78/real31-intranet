// Documents du module « Contrats & contrôles » (REA-333) : le fichier va dans SharePoint, sous
// le dossier de la copro (`<racine copro>/Contrats/<Assurance | Gaz | Ascenseurs/CTQ | VMC/CTQ>`),
// la base ne garde qu'un POINTEUR (driveId, itemId, webUrl) rattaché à une cible exclusive :
// la copro, un cycle d'assurance, une offre, un devis. Le retrait est logique : le fichier
// reste dans SharePoint, le pointeur est masqué.
//
// Réutilise le port de dépôt de l'intranet (contrat de syndic, pièces jointes de mail), étendu
// pour rendre les identifiants Graph. Le dossier « Ascenseurs/CTQ » se crée segment par segment
// (bug du 07/10 de l'ancienne application : un seul nom avec un « / » dedans). Un fichier du
// même nom déjà présent n'est JAMAIS écrasé : SharePoint suffixe le nouveau et c'est ce nom
// réel que le pointeur enregistre.

import { getContratsCoproRepository, getCoproRepository, getDepotDocumentProvider } from "@/lib/adapters/router";
import { LIBELLE_SUJET, type DocumentContrat, type RattachementDocument, type SujetSuivi, type TypeDocument } from "@/lib/domain/contrats-copro";
import { dossierCoproDepuisLienAg } from "@/lib/domain/mes-emails-depot";
import type { ContratsCoproRepository } from "@/lib/ports/contrats-copro-repository";
import { exigerPerimetre } from "@/lib/services/coproprietes/exiger-perimetre";
import { journaliser } from "./journal";
import type { AuteurContrats } from "./types";

export const TAILLE_MAX_DOCUMENT = 4 * 1024 * 1024;

export const MESSAGE_TROP_LOURD =
  "Le fichier dépasse 4 Mo. Réduis-le ou compresse-le (par exemple exporte le PDF en qualité réduite, ou scanne en noir et blanc) puis réessaie.";

/** Types MIME acceptés, avec l'extension du nom stocké. Pas de détection de contenu. */
export const MIME_AUTORISES: Readonly<Record<string, string>> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

/** Sous-dossiers sous « Contrats », un segment par dossier (jamais de « / » dans un nom). */
export const SOUS_DOSSIERS_SUJET: Record<SujetSuivi, readonly string[]> = {
  assurance: ["Assurance"],
  gaz: ["Gaz"],
  ctq_ascenseur: ["Ascenseurs", "CTQ"],
  ctq_vmc: ["VMC", "CTQ"],
};

// --- Nommage (repris de naming.ts de l'ancienne application) -----------------------------

/**
 * Un segment de nom de fichier SharePoint : accents translittérés, apostrophes et caractères
 * interdits retirés, espaces en underscore, rien en tête ni en queue.
 */
export function slugifier(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’"]/g, "")
    .replace(/[*:<>?/\\|#%]/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+|[._]+$/g, "");
}

/** Nom stocké : `<code>_<TYPE>[_<fournisseur>]_<AAAA-MM-JJ>.<ext>`. */
export function nomFichierStocke(p: { coproCode: string; typeDocument: TypeDocument; fournisseur?: string | null; jourISO: string; mime: string }): string {
  const segments = [slugifier(p.coproCode) || "copro", slugifier(p.typeDocument.toUpperCase()) || "DOC", p.fournisseur ? slugifier(p.fournisseur) : "", p.jourISO.slice(0, 10)];
  return `${segments.filter((s) => s.length > 0).join("_")}.${MIME_AUTORISES[p.mime] ?? "bin"}`;
}

/** Le nom d'origine sans son extension, pour l'affichage. */
export function nomAfficheDepuis(nomFichier: string): string {
  const propre = nomFichier.trim().replace(/\.[A-Za-z0-9]{1,5}$/, "").trim();
  return propre || "document";
}

// --- Services ----------------------------------------------------------------------------

/** Le dépôt est-il branché ? (Sert à n'afficher le bouton que s'il peut marcher.) */
export function documentsDepotActif(): boolean {
  return getDepotDocumentProvider().actif;
}

export interface DeposerDocumentInput {
  coproCode: string;
  sujet: SujetSuivi;
  typeDocument: TypeDocument;
  rattachement: RattachementDocument;
  nomFichier: string;
  mime: string;
  tailleOctets: number;
  contenuBase64: string;
  /** Jour de Paris du dépôt (le nom stocké le porte) ; injecté par l'action. */
  aujourdhuiISO: string;
}

/**
 * Vérifie que la cible existe et appartient à la copro du geste, et rend le nom du
 * fournisseur quand la cible en a un (il entre dans le nom du fichier, comme avant).
 */
async function verifierRattachement(repo: ContratsCoproRepository, coproCode: string, r: RattachementDocument): Promise<{ fournisseur: string | null }> {
  switch (r.type) {
    case "copro":
      if (r.coproCode !== coproCode) throw new Error("Le document doit se rattacher à la copropriété du geste.");
      return { fournisseur: null };
    case "cycle_assurance": {
      const cycle = await repo.getCycle("assurance", r.cycleId);
      if (!cycle || cycle.coproCode !== coproCode) throw new Error("Le cycle d'assurance visé est introuvable sur cette copropriété.");
      return { fournisseur: null };
    }
    case "offre_assurance": {
      const cycles = await repo.listerCycles({ coproCodes: [coproCode], sujets: ["assurance"] });
      const offre = (await repo.listerOffresAssurance(cycles.map((c) => c.id))).find((o) => o.id === r.offreId);
      if (!offre) throw new Error("L'offre d'assurance visée est introuvable sur cette copropriété.");
      return { fournisseur: offre.assureur };
    }
    case "offre_gaz": {
      const cycles = await repo.listerCycles({ coproCodes: [coproCode], sujets: ["gaz"] });
      const offre = (await repo.listerOffresGaz(cycles.map((c) => c.id))).find((o) => o.id === r.offreId);
      if (!offre) throw new Error("L'offre de gaz visée est introuvable sur cette copropriété.");
      return { fournisseur: offre.fournisseur };
    }
    case "devis_ctq": {
      const devis = (await repo.listerDevisCtq([coproCode])).find((d) => d.id === r.devisId);
      if (!devis) throw new Error("Le devis visé est introuvable sur cette copropriété.");
      return { fournisseur: devis.prestataire };
    }
  }
}

export async function deposerDocument(p: DeposerDocumentInput, auteur: AuteurContrats): Promise<DocumentContrat> {
  await exigerPerimetre(p.coproCode, auteur.id);
  const depot = getDepotDocumentProvider();
  if (!depot.actif) throw new Error("Le dépôt dans SharePoint n'est pas activé sur cet environnement : le document ne peut pas être rangé.");
  if (!Object.prototype.hasOwnProperty.call(MIME_AUTORISES, p.mime)) {
    throw new Error("Type de fichier non accepté : PDF, image (JPEG, PNG), Word ou Excel.");
  }
  const contenu = Buffer.from(p.contenuBase64, "base64");
  if (contenu.length === 0) throw new Error("Le fichier reçu est vide.");
  if (p.tailleOctets > TAILLE_MAX_DOCUMENT || contenu.length > TAILLE_MAX_DOCUMENT) throw new Error(MESSAGE_TROP_LOURD);

  const repo = getContratsCoproRepository();
  const [copro, cible] = await Promise.all([getCoproRepository().findByCode(p.coproCode), verifierRattachement(repo, p.coproCode, p.rattachement)]);
  if (!copro) throw new Error("Copropriété introuvable.");
  if (!copro.sharepointUrl) {
    throw new Error("Cette copropriété n'a pas de dossier SharePoint renseigné : renseigne-le dans sa fiche avant de déposer un document.");
  }

  const nomStocke = nomFichierStocke({ coproCode: p.coproCode, typeDocument: p.typeDocument, fournisseur: cible.fournisseur, jourISO: p.aujourdhuiISO, mime: p.mime });
  const sousDossiers = ["Contrats", ...SOUS_DOSSIERS_SUJET[p.sujet]];
  const r = await depot.deposer({ dossierUrl: dossierCoproDepuisLienAg(copro.sharepointUrl), sousDossiers, nomFichier: nomStocke, contenu, contentType: p.mime, conflit: "renommer" });
  if (!r.depose) throw new Error(`Dépôt impossible dans SharePoint : ${r.raison}`);
  if (!r.driveId || !r.itemId) {
    throw new Error(`Le fichier est bien dans SharePoint (${sousDossiers.join(" / ")}) mais son identifiant n'a pas été renvoyé : le lien ne peut pas être enregistré. Signale-le.`);
  }

  const document = await repo.creerDocument({
    sujet: p.sujet,
    typeDocument: p.typeDocument,
    nomAffiche: nomAfficheDepuis(p.nomFichier),
    // Le nom réel rendu par SharePoint (suffixé en cas de doublon) ; repli : le nom calculé.
    nomFichier: r.nom?.trim() || nomStocke,
    mime: p.mime,
    tailleOctets: contenu.length,
    driveId: r.driveId,
    itemId: r.itemId,
    webUrl: r.webUrl,
    deposeParId: auteur.id,
    deposeLeISO: new Date().toISOString(),
    rattachement: p.rattachement,
  });
  await journaliser({
    coproCode: p.coproCode,
    sujet: p.sujet,
    cycleId: p.rattachement.type === "cycle_assurance" ? p.rattachement.cycleId : null,
    type: "document_depose",
    parUserId: auteur.id,
    parNom: auteur.nom,
    details: { nom: document.nomAffiche, typeDocument: p.typeDocument, dossier: `Contrats / ${SOUS_DOSSIERS_SUJET[p.sujet].join(" / ")}` },
  });
  return document;
}

export async function retirerDocument(p: { coproCode: string; documentId: string }, auteur: AuteurContrats): Promise<void> {
  await exigerPerimetre(p.coproCode, auteur.id);
  const repo = getContratsCoproRepository();
  // Le pointeur ne porte pas toujours le code copro (offre, devis) : on passe par la liste de
  // la copro, qui prouve l'appartenance.
  const document = (await repo.listerDocuments({ type: "toute_copro", coproCode: p.coproCode })).find((d) => d.id === p.documentId);
  if (!document) throw new Error("Ce document est introuvable sur cette copropriété (déjà retiré ?).");
  await repo.supprimerDocument(document.id, auteur.id);
  await journaliser({
    coproCode: p.coproCode,
    sujet: document.sujet,
    cycleId: document.rattachement.type === "cycle_assurance" ? document.rattachement.cycleId : null,
    type: "document_retire",
    parUserId: auteur.id,
    parNom: auteur.nom,
    details: { nom: document.nomAffiche, sujet: LIBELLE_SUJET[document.sujet] },
  });
}
