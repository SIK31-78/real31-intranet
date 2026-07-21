import { agDateDeAgId, coproCodeDeAgId, type SupervisionAg, type VisaFinal } from "@/lib/domain/supervision-ag";
import { getSupervisionAgProvider, getCoproRepository, getJalonRepository } from "@/lib/adapters/router";
import { exigerPerimetre } from "@/lib/services/coproprietes/exiger-perimetre";

export async function conclureAg(
  agId: string,
  visa: VisaFinal,
  managerId: string,
): Promise<SupervisionAg> {
  const coproCode = coproCodeDeAgId(agId);
  await exigerPerimetre(coproCode, managerId);
  const resultat = await getSupervisionAgProvider().conclureAg(agId, visa);

  // Conclure une AG = elle a EU LIEU. C'est LE moment (le seul) qui fait passer "prochaine AG"
  // -> "derniere AG tenue" : rien ne le faisait automatiquement (une prochaine AG dont la date
  // etait passee restait affichee "prochaine", la derniere AG restait figee). On range donc les
  // dates (via le mecanisme normal setDateEvenement, le meme que le crayon de la fiche) et on
  // marque le jalon TENUE. BEST-EFFORT : un echec de ces retombees ne doit PAS defaire la
  // conclusion (l'action primaire est l'archivage de la supervision).
  const agDate = agDateDeAgId(agId);
  if (agDate) {
    const copros = getCoproRepository();
    await copros
      .setDateEvenement(coproCode, "ag", "derniere", agDate, managerId)
      .catch((e) => console.warn(`[conclure-ag] derniere AG non posee (${coproCode}) :`, (e as Error).message));
    await copros
      .setDateEvenement(coproCode, "ag", "prochaine", null, managerId)
      .catch((e) => console.warn(`[conclure-ag] prochaine AG non videe (${coproCode}) :`, (e as Error).message));
    await getJalonRepository()
      .marquer({ coproCode, agDate, type: "TENUE", statut: "accompli" })
      .catch((e) => console.warn(`[conclure-ag] jalon TENUE non marque (${coproCode}) :`, (e as Error).message));
  }
  return resultat;
}
