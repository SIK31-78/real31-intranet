// Compose le squelette d'ODJ pour une AG (id = CODE ou CODE__DATE). Auto-remplit
// ce qu'on a (referentiel Supabase + jalon convocation) ; laisse vide ce qui viendra
// d'eStale (comptes, budget, eau, sinistres...) ou de la saisie. Scope managerId.

import type { ChampOdj, Odj, SectionOdj, SourceDonnee } from "@/lib/domain/odj";
import { pointsLegaux } from "@/lib/domain/odj";
import { getCoproRepository, getCondoEstaleProvider } from "@/lib/adapters/router";
import { calculerJalons } from "@/lib/domain/jalons-ag/calculator";
import { DELAIS_CABINET } from "@/lib/domain/jalons-ag/cabinet/real31-defaults";

function parse(id: string): { code: string; agDate?: string } {
  const i = id.indexOf("__");
  return i < 0 ? { code: id } : { code: id.slice(0, i), agDate: id.slice(i + 2) };
}
function dateCourte(iso?: string): string | undefined {
  if (!iso) return undefined;
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
function moinsJours(iso: string, n: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() - n);
  return t.toISOString().slice(0, 10);
}
function champ(libelle: string, source: SourceDonnee, valeur?: string, alerte?: string): ChampOdj {
  return { libelle, source, ...(valeur ? { valeur } : {}), ...(alerte ? { alerte } : {}) };
}

export async function getOdj(id: string, gestionnaireId: string): Promise<Odj | null> {
  const { code, agDate: agParam } = parse(id);
  const copro = await getCoproRepository().findByCode(code, gestionnaireId);
  if (!copro) return null;

  const dateAg = agParam ?? copro.prochaineAg?.date;
  const adresse = [copro.adresse.ligne1, `${copro.adresse.codePostal} ${copro.adresse.ville}`.trim()]
    .filter(Boolean)
    .join(", ");

  // Mise sous pli = jalon CONVOC (J-30 cabinet : 1 mois avant l'AG, pas tributaire
  // des delais postaux). Date limite d'ajout de points = 10 jours avant la mise sous pli.
  const convocISO = dateAg
    ? calculerJalons(dateAg).find((j) => j.code === "CONVOC")?.cibleDate
    : undefined;
  const limiteOdjISO = convocISO
    ? moinsJours(convocISO, DELAIS_CABINET.AJOUT_ODJ_AVANT_CONVOC_JOURS)
    : undefined;

  // Presents au CS : d'office gestionnaire + assistant (referentiel) + les membres
  // du conseil syndical (eStale). Le jour de la reunion, on retire les absents.
  const estale = await getCondoEstaleProvider().getDonneesCopro(code);
  const syndic = copro.equipe
    .filter((m) => m.role === "gestionnaire" || m.role === "assistant")
    .map((m) => `${m.nomComplet} (syndic)`);
  const membresCs = (estale?.conseilSyndical ?? []).map(
    (m) => `${m.nomComplet}${m.role === "president" ? " (president CS)" : " (CS)"}`,
  );
  const presents = [...syndic, ...membresCs].join(", ");

  const enTete: ChampOdj[] = [
    champ("Adresse", "supabase", adresse),
    champ("Date de l'AG", dateAg ? "supabase" : "manuel", dateCourte(dateAg)),
    champ(
      "Date du CS preparatoire",
      "supabase",
      dateCourte(copro.prochaineCsDate),
      copro.prochaineCsDate
        ? undefined
        : "Date de CS non renseignee : a planifier (fiche copro ou supervision).",
    ),
    champ("Lieu de l'AG", "manuel"),
    champ("Modalite (presentiel / hybride)", "manuel"),
    champ(
      "Presents (syndic + conseil syndical)",
      "estale",
      presents || undefined,
      membresCs.length === 0
        ? "Membres du CS a recuperer depuis eStale (retirer les absents le jour du CS)."
        : undefined,
    ),
    champ(
      "Date limite d'ajout de points a l'ODJ",
      limiteOdjISO ? "jalon" : "manuel",
      dateCourte(limiteOdjISO),
    ),
    champ(
      "Mise sous pli de la convocation (1 mois avant l'AG)",
      convocISO ? "jalon" : "manuel",
      dateCourte(convocISO),
    ),
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
        champ("Dossiers procedure en cours ou a lancer", "estale"),
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
