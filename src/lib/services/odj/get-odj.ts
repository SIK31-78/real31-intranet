// Compose le squelette d'ODJ pour une AG (id = CODE ou CODE__DATE). Auto-remplit
// ce qu'on a (referentiel Supabase + jalon convocation) ; laisse vide ce qui viendra
// d'eStale (comptes, budget, eau, sinistres...) ou de la saisie. Scope managerId.

import type { ChampOdj, Odj, SectionOdj, SourceDonnee } from "@/lib/domain/odj";
import { pointsLegaux } from "@/lib/domain/odj";
import { getCoproRepository } from "@/lib/adapters/router";
import { calculerJalons } from "@/lib/domain/jalons-ag/calculator";

function parse(id: string): { code: string; agDate?: string } {
  const i = id.indexOf("__");
  return i < 0 ? { code: id } : { code: id.slice(0, i), agDate: id.slice(i + 2) };
}
function dateCourte(iso?: string): string | undefined {
  if (!iso) return undefined;
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
function champ(libelle: string, source: SourceDonnee, valeur?: string): ChampOdj {
  return { libelle, source, ...(valeur ? { valeur } : {}) };
}

export async function getOdj(id: string, gestionnaireId: string): Promise<Odj | null> {
  const { code, agDate: agParam } = parse(id);
  const copro = await getCoproRepository().findByCode(code, gestionnaireId);
  if (!copro) return null;

  const dateAg = agParam ?? copro.prochaineAg?.date;
  const adresse = [copro.adresse.ligne1, `${copro.adresse.codePostal} ${copro.adresse.ville}`.trim()]
    .filter(Boolean)
    .join(", ");

  // Mise sous pli / convocation = jalon CONVOC calcule depuis la date d'AG.
  const dateConvoc = dateAg
    ? dateCourte(calculerJalons(dateAg).find((j) => j.code === "CONVOC")?.cibleDate)
    : undefined;

  const enTete: ChampOdj[] = [
    champ("Adresse", "supabase", adresse),
    champ("Date de l'AG", dateAg ? "supabase" : "manuel", dateCourte(dateAg)),
    champ("Date du CS preparatoire", copro.prochaineCsDate ? "supabase" : "manuel", dateCourte(copro.prochaineCsDate)),
    champ("Lieu de l'AG", "manuel"),
    champ("Modalite (presentiel / hybride)", "manuel"),
    champ("Presents (conseil syndical + syndic)", "manuel"),
    champ("Date limite d'ajout de points a l'ODJ", "manuel"),
    champ("Mise sous pli de la convocation", dateConvoc ? "jalon" : "manuel", dateConvoc),
  ];

  const sections: SectionOdj[] = [
    {
      id: "verif-comptes",
      titre: "Verification des comptes",
      champs: [
        champ("Total des depenses courantes", "estale"),
        champ("Budget previsionnel", "estale"),
        champ("Trop-percu / depassement budget courant", "estale"),
        champ("Consommation eau (volume + prix au m3, vs N-1)", "estale"),
        champ("Depenses travaux votees (budget vote / constate, cloture)", "estale"),
        champ("Coproprietaire(s) debiteur(s)", "estale"),
        champ("Compteurs d'eau collectes", "supabase"),
        champ("Repartiteurs de frais de chauffage collectes", "supabase"),
        champ("Fonds travaux (montant fin d'exercice, interets)", "estale"),
        champ("Solde du compte sinistre", "estale"),
        champ("Comptes debiteurs / crediteurs d'anciens proprietaires", "estale"),
        champ("Affectations entretien / reparations (recup / loc)", "estale"),
      ],
    },
    {
      id: "gestion-courante",
      titre: "Gestion courante",
      champs: [
        champ("Dossiers sinistres en cours", "estale"),
        champ("Dossiers procedure en cours ou a lancer", "manuel"),
        champ("Autres dossiers de gestion courante", "manuel"),
        champ("Contrat gaz (dates effet / fin + prix molecule)", "supabase"),
        champ("Contrat electricite (dates effet / fin + prix molecule)", "supabase"),
        champ("Optimisation du contrat ENGIE", "manuel"),
        champ("Subvention Metropole pour le DTG", "manuel"),
        champ("Avancement DTG / PPPT", "manuel"),
      ],
    },
    {
      id: "points-a-porter",
      titre: "Points a porter a l'ordre du jour",
      champs: [
        champ("Rapport moral du CS", "manuel"),
        champ("Budget N+1 propose", "estale"),
        champ("Contrat de syndic (en cours / proposition)", "supabase"),
      ],
    },
  ];

  return {
    copro: { code: copro.code, nom: copro.nom, adresse },
    ...(dateAg ? { dateAg: dateCourte(dateAg) } : {}),
    enTete,
    sections,
    pointsLegaux: pointsLegaux(copro.lotsPrincipaux),
  };
}
