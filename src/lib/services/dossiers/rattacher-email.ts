// Service : pont Mes emails -> module Dossiers. Rattache un mail a un dossier reel
// (intranet_dossiers) en ajoutant un evenement "email" a son journal, ou cree un
// dossier depuis un mail. Cloisonne par perimetre (coproAppartient). Passe par le
// routeur (ADR-001).

import { getDossierRepository } from "@/lib/adapters/router";
import { coproAppartient } from "@/lib/services/coproprietes/copro-appartient";
import { MODELES_ETAPES, type EtapeDossier, type TypeDossier } from "@/lib/domain/dossier";

function etapesDuModele(type: TypeDossier): EtapeDossier[] {
  return MODELES_ETAPES[type].map((m) => ({
    id: Math.random().toString(36).slice(2, 10),
    label: m.label,
    fait: false,
    ...(m.assigneA ? { assigneA: m.assigneA } : {}),
  }));
}

/** Ajoute un evenement "email" au journal d'un dossier existant. false si hors perimetre. */
export async function rattacherEmailAuDossier(
  dossierId: string,
  managerId: string,
  initiales: string,
  resume: string,
  emailRef: string,
): Promise<boolean> {
  const repo = getDossierRepository();
  const d = await repo.get(dossierId);
  if (!d || !(await coproAppartient(d.coproCode, managerId))) return false;
  const journal = [
    ...d.journal,
    { le: new Date().toISOString(), par: initiales, texte: resume, kind: "email" as const, ref: emailRef },
  ];
  await repo.patch(dossierId, { journal });
  return true;
}

/** Cree un dossier depuis un mail (type + titre) et y rattache l'email. null si hors perimetre. */
export async function creerDossierDepuisMail(
  coproCode: string,
  managerId: string,
  initiales: string,
  type: TypeDossier,
  titre: string,
  resume: string,
  emailRef: string,
): Promise<string | null> {
  if (!(await coproAppartient(coproCode, managerId))) return null;
  const maintenant = new Date().toISOString();
  return getDossierRepository().creer({
    coproCode,
    type,
    portee: "copropriete",
    titre,
    origine: "Email",
    etapes: etapesDuModele(type),
    journal: [
      { le: maintenant, par: initiales, texte: "Dossier ouvert depuis un email", kind: "statut" },
      { le: maintenant, par: initiales, texte: resume, kind: "email", ref: emailRef },
    ],
    ouvertPar: initiales,
  });
}
