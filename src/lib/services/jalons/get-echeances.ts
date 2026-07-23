// Service des ECHEANCES AG (le produit phare de l'API v1) : tous les jalons des
// prochaines AG du perimetre, cibles calculees (domaine jalons-ag) + etat persiste
// (intranet_jalons), avec le retard deduit. UNE lecture copros + UNE lecture batch
// des etats (getEtats), jamais un aller-retour par copro. Passe par le routeur (ADR-001).

import { calculerJalons } from "@/lib/domain/jalons-ag/calculator";
import type { JalonCode, SourceJalon, StatutJalon } from "@/lib/domain/jalons-ag/types";
import { getCoproRepository, getJalonRepository } from "@/lib/adapters/router";

/** Un jalon d'une prochaine AG, pret a exposer (referentiel + etat, zero PII). */
export interface EcheanceJalon {
  coproCode: string;
  coproNom: string;
  /** Date de l'AG concernee, ISO "YYYY-MM-DD". */
  agDate: string;
  code: JalonCode;
  libelle: string;
  /** Date cible effective, ISO "YYYY-MM-DD". */
  cibleDate: string;
  source: SourceJalon;
  statut: StatutJalon;
  /** Cible depassee ET jalon non accompli. */
  enRetard: boolean;
  marquePar?: string;
}

/**
 * Les jalons des prochaines AG du perimetre, tries par date cible croissante
 * (le plus urgent d'abord), puis code copro. `managerId` vide/absent = vue
 * transverse (cle cabinet) ; sinon cloisonne au portefeuille.
 */
export async function getEcheances(managerId?: string): Promise<EcheanceJalon[]> {
  const copros = await getCoproRepository().list(managerId || undefined);
  const avecAg = copros.filter((c) => c.prochaineAg?.date);
  if (avecAg.length === 0) return [];

  const today = new Date().toISOString().slice(0, 10);
  const etats = await getJalonRepository().getEtats(avecAg.map((c) => c.code));
  const etatPar = new Map(
    etats.map((e) => [`${e.coproCode}|${e.agDate}|${e.type}`, e] as const),
  );

  const lignes: EcheanceJalon[] = [];
  for (const c of avecAg) {
    const agDate = c.prochaineAg!.date;
    for (const j of calculerJalons(agDate)) {
      const e = etatPar.get(`${c.code}|${agDate}|${j.code}`);
      const statut = e?.statut ?? "a_faire";
      lignes.push({
        coproCode: c.code,
        coproNom: c.nom,
        agDate,
        code: j.code,
        libelle: j.libelle,
        cibleDate: j.cibleDate,
        source: j.source,
        statut,
        enRetard: statut !== "accompli" && j.cibleDate < today,
        ...(e?.marquePar ? { marquePar: e.marquePar } : {}),
      });
    }
  }
  return lignes.sort(
    (a, b) => a.cibleDate.localeCompare(b.cibleDate) || a.coproCode.localeCompare(b.coproCode),
  );
}
