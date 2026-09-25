// Service : l'annuaire Linkus au format CSV, prêt à importer dans le standard.

import { getAnnuaireEstaleProvider } from "@/lib/adapters/router";
import { construireAnnuaire, versCsvLinkus, type BilanAnnuaire } from "@/lib/domain/linkus";

export type ExportAnnuaire = { csv: string; nomFichier: string; bilan: BilanAnnuaire };

export async function exporterAnnuaireLinkus(maintenant = new Date()): Promise<ExportAnnuaire> {
  const copros = await getAnnuaireEstaleProvider().listerCopros();
  const { lignes, bilan } = construireAnnuaire(copros);
  const jour = maintenant.toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });
  return { csv: versCsvLinkus(lignes), nomFichier: `Linkus - copropriétaires ESTALE ${jour}.csv`, bilan };
}
