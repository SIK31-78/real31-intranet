// Service : les "actions de dossiers" du perimetre pour le dashboard (C3, decision
// Sekou) = la PROCHAINE etape de chaque dossier OUVERT (statut != clos), groupee par
// copropriete. Un dossier sans etape a faire (tout coche) ne remonte pas. ADR-001.

import { getCoproRepository, getDossierRepository } from "@/lib/adapters/router";
import { prochaineEtape, type ActionsDossierCopro } from "@/lib/domain/dossier";

type CoproMin = { code: string; nom: string };

/** `coprosPreCharges` evite un double fetch quand l'appelant a deja la liste (dashboard). */
export async function getActionsDossiers(
  managerId: string,
  coprosPreCharges?: CoproMin[],
): Promise<ActionsDossierCopro[]> {
  const copros =
    coprosPreCharges ??
    (await getCoproRepository().list(managerId)).map((c) => ({ code: c.code, nom: c.nom }));
  const nomDe = new Map(copros.map((c) => [c.code, c.nom]));

  const dossiers = await getDossierRepository().listPourCopros(copros.map((c) => c.code));

  const parCopro = new Map<string, ActionsDossierCopro>();
  for (const d of dossiers) {
    if (d.statut === "clos") continue;
    const etape = prochaineEtape(d);
    if (!etape) continue; // tout est fait -> rien a suivre
    const nom = nomDe.get(d.coproCode);
    if (nom === undefined) continue; // hors perimetre (defense en profondeur)
    const grp =
      parCopro.get(d.coproCode) ?? { coproCode: d.coproCode, coproNom: nom, actions: [] };
    grp.actions.push({
      dossierId: d.id,
      titre: d.titre,
      type: d.type,
      etapeLabel: etape.label,
      ...(etape.assigneA ? { assigneA: etape.assigneA } : {}),
    });
    parCopro.set(d.coproCode, grp);
  }
  return [...parCopro.values()].sort((a, b) => a.coproCode.localeCompare(b.coproCode));
}
