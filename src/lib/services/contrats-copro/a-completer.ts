// La file « À compléter » (point 15 du plan) : par copro ACTIVE du périmètre, ce qui manque pour
// que ses suivis tiennent debout. Le calcul est celui du domaine (`calculerACompleter`), le
// service ne fait que rassembler ses intrants en lectures groupées et grouper le résultat.
// Lecture seule, date du jour injectée, routeur seulement (ADR-001).

import { getContratsCoproRepository } from "@/lib/adapters/router";
import { calculerACompleter, type Ascenseur, type Cycle, type ItemACompleter } from "@/lib/domain/contrats-copro";
import type { Copropriete } from "@/lib/domain/copropriete";
import { destinatairesConseilSyndical } from "@/lib/services/coproprietes/destinataires-conseil";
import { coprosEnLecture } from "@/lib/services/coproprietes/perimetre-lecture";
import { courtiersPartenaires, partenairesPourDomaine } from "./lecture";
import type { ACompleterParCopro } from "./types";

/**
 * Au-delà de ce nombre de copros, on ne vérifie plus le conseil syndical : la cascade de
 * destinataires interroge ESTALE copro par copro, et 260 appels ESTALE pour une liste, c'est
 * trop cher. On considère alors l'adresse connue (donc on ne liste rien à ce sujet).
 */
export const SEUIL_VERIFICATION_CS = 60;
const TAILLE_PAQUET_CS = 10;

/**
 * Le conseil syndical a-t-il une adresse connue, copro par copro, par paquets de 10 en
 * parallèle. Une cascade qui échoue vaut « connue » : on ne liste pas un manque sur un doute.
 */
async function conseilsSyndicauxConnus(codes: readonly string[]): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  for (let i = 0; i < codes.length; i += TAILLE_PAQUET_CS) {
    const paquet = codes.slice(i, i + TAILLE_PAQUET_CS);
    const resultats = await Promise.all(
      paquet.map(async (code) => {
        try {
          return (await destinatairesConseilSyndical(code)).emails.length > 0;
        } catch (err) {
          console.warn(`[contrats-copro] destinataires du conseil syndical de ${code} illisibles :`, (err as Error).message);
          return true;
        }
      }),
    );
    paquet.forEach((code, k) => out.set(code, resultats[k]));
  }
  return out;
}

function grouperParCode<T extends { coproCode: string }>(items: readonly T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const it of items) {
    const liste = out.get(it.coproCode);
    if (liste) liste.push(it);
    else out.set(it.coproCode, [it]);
  }
  return out;
}

/**
 * Les items « à compléter » groupés par copro, pour l'onglet de la liste. Les copros sans item
 * n'apparaissent pas ; les plus incomplètes d'abord, puis par code.
 *
 * `verifierConseilSyndical` : ne vaut que jusqu'à SEUIL_VERIFICATION_CS copros (voir là-haut).
 * Une copro active du référentiel mais inconnue de la source des contrats (pas de contrat
 * courant) est passée : rien n'y est éditable tant que sa ligne n'existe pas.
 */
export async function aCompleterPour(p: {
  coproCodes?: readonly string[];
  aujourdhuiISO: string;
  verifierConseilSyndical?: boolean;
}): Promise<ACompleterParCopro[]> {
  const filtre = p.coproCodes ? new Set(p.coproCodes) : null;
  if (filtre && filtre.size === 0) return [];
  const copros = (await coprosEnLecture()).filter((c) => c.statut === "active" && (!filtre || filtre.has(c.code)));
  if (copros.length === 0) return [];
  const codes = copros.map((c) => c.code);

  const repo = getContratsCoproRepository();
  const verifierCs = p.verifierConseilSyndical === true && copros.length <= SEUIL_VERIFICATION_CS;
  const [contrats, cycles, ascenseurs, partenaires, csConnus] = await Promise.all([
    repo.listerContratsCourants(codes),
    repo.listerCycles({ coproCodes: codes }),
    repo.listerAscenseurs(codes),
    courtiersPartenaires(),
    verifierCs ? conseilsSyndicauxConnus(codes) : Promise.resolve(new Map<string, boolean>()),
  ]);
  const cyclesParCode = grouperParCode<Cycle>(cycles);
  const ascenseursParCode = grouperParCode<Ascenseur>(ascenseurs);

  const groupes: ACompleterParCopro[] = [];
  for (const copro of copros) {
    const contrat = contrats.get(copro.code);
    if (!contrat) continue;
    const items: ItemACompleter[] = calculerACompleter({
      copro: {
        code: copro.code,
        nom: copro.nom,
        immatriculation: contrat.immatriculation.numero ?? copro.immatriculation ?? null,
        immatriculationNonApplicable: contrat.immatriculation.nonApplicable,
      },
      contrat,
      cycles: cyclesParCode.get(copro.code) ?? [],
      ascenseurs: ascenseursParCode.get(copro.code) ?? [],
      partenaires: partenairesPourDomaine(contrat.assurance.courtier, partenaires),
      csAdresseConnue: verifierCs ? (csConnus.get(copro.code) ?? true) : true,
      aujourdhuiISO: p.aujourdhuiISO,
    });
    if (items.length === 0) continue;
    const gestionnaire = gestionnaireDe(copro);
    groupes.push({ coproCode: copro.code, coproNom: copro.nom, ...(gestionnaire ? { gestionnaire } : {}), items });
  }
  return groupes.sort((a, b) => b.items.length - a.items.length || a.coproCode.localeCompare(b.coproCode));
}

function gestionnaireDe(copro: Copropriete): string | undefined {
  return copro.equipe.find((m) => m.role === "gestionnaire")?.nomComplet;
}
