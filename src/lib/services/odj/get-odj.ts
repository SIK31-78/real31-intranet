// Compose l'ODJ pour une AG (id = CODE ou CODE__DATE) : squelette auto (referentiel
// Supabase + jalons + eStale) puis superposition de l'ETAT saisi (intranet_odj_champs :
// la saisie du gestionnaire prime sur la valeur auto ; points legaux retires).
// Scope managerId.

import type { ChampOdj, Odj, SectionOdj, SourceDonnee } from "@/lib/domain/odj";
import { pointsLegaux } from "@/lib/domain/odj";
import {
  getCoproRepository,
  getCondoEstaleProvider,
  getOdjRepository,
} from "@/lib/adapters/router";
import { ODJ_SANS_DATE, PREFIXE_POINT } from "@/lib/ports/odj-repository";
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
function champ(
  id: string,
  libelle: string,
  source: SourceDonnee,
  options?: { valeur?: string; alerte?: string; editable?: boolean },
): ChampOdj {
  return {
    id,
    libelle,
    source,
    ...(options?.valeur ? { valeur: options.valeur } : {}),
    ...(options?.alerte ? { alerte: options.alerte } : {}),
    ...(options?.editable !== undefined ? { editable: options.editable } : {}),
  };
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
    champ("adresse", "Adresse", "supabase", { valeur: adresse }),
    champ("date-ag", "Date de l'AG", dateAg ? "supabase" : "manuel", { valeur: dateCourte(dateAg) }),
    champ("date-cs", "Date du CS preparatoire", "supabase", {
      valeur: dateCourte(copro.prochaineCsDate),
      alerte: copro.prochaineCsDate
        ? undefined
        : "Date de CS non renseignee : a planifier (fiche copro ou supervision).",
    }),
    champ("lieu", "Lieu de l'AG", "manuel", { editable: true }),
    champ("modalite", "Modalite (presentiel / hybride)", "manuel", { editable: true }),
    champ("presents", "Presents (syndic + conseil syndical)", "estale", {
      valeur: presents || undefined,
      editable: true,
      alerte:
        membresCs.length === 0
          ? "Membres du CS a recuperer depuis eStale (retirer les absents le jour du CS)."
          : undefined,
    }),
    champ("limite-odj", "Date limite d'ajout de points a l'ODJ", limiteOdjISO ? "jalon" : "manuel", {
      valeur: dateCourte(limiteOdjISO),
    }),
    champ("mise-sous-pli", "Mise sous pli de la convocation (1 mois avant l'AG)", convocISO ? "jalon" : "manuel", {
      valeur: dateCourte(convocISO),
    }),
  ];

  const e = { editable: true };
  const sections: SectionOdj[] = [
    {
      id: "verif-comptes",
      titre: "Verification des comptes",
      champs: [
        champ("comptes.depenses-courantes", "Total des depenses courantes", "estale", e),
        champ("comptes.budget", "Budget previsionnel", "estale", e),
        champ("comptes.ecart-budget", "Trop-percu / depassement budget courant", "estale", e),
        champ("comptes.eau", "Consommation eau (volume + prix au m3, vs N-1)", "estale", e),
        champ("comptes.travaux-votes", "Depenses travaux votees (budget vote / constate, cloture)", "estale", e),
        champ("comptes.debiteurs", "Coproprietaire(s) debiteur(s)", "estale", e),
        champ("comptes.compteurs-eau", "Compteurs d'eau collectes", "supabase", e),
        champ("comptes.repartiteurs", "Repartiteurs de frais de chauffage collectes", "supabase", e),
        champ("comptes.fonds-travaux", "Fonds travaux (montant fin d'exercice, interets)", "estale", e),
        champ("comptes.solde-sinistre", "Solde du compte sinistre", "estale", e),
        champ("comptes.anciens-proprios", "Comptes debiteurs / crediteurs d'anciens proprietaires", "estale", e),
        champ("comptes.affectations", "Affectations entretien / reparations (recup / loc)", "estale", e),
      ],
    },
    {
      id: "gestion-courante",
      titre: "Gestion courante",
      champs: [
        champ("gestion.sinistres", "Dossiers sinistres en cours", "estale", e),
        champ("gestion.procedures", "Dossiers procedure en cours ou a lancer", "estale", e),
        champ("gestion.autres", "Autres dossiers de gestion courante", "manuel", e),
        champ("gestion.gaz", "Contrat gaz (dates effet / fin + prix molecule)", "supabase", e),
        champ("gestion.electricite", "Contrat electricite (dates effet / fin + prix molecule)", "supabase", e),
        champ("gestion.engie", "Optimisation du contrat ENGIE", "manuel", e),
        champ("gestion.subvention-dtg", "Subvention Metropole pour le DTG", "manuel", e),
        champ("gestion.dtg-pppt", "Avancement DTG / PPPT", "manuel", e),
      ],
    },
    {
      id: "points-a-porter",
      titre: "Points a porter a l'ordre du jour",
      champs: [
        champ("points.rapport-cs", "Rapport moral du CS", "manuel", e),
        champ("points.budget-n1", "Budget N+1 propose", "estale", e),
        champ("points.contrat-syndic", "Contrat de syndic (en cours / proposition)", "supabase", e),
      ],
    },
  ];

  // Superposition de l'etat saisi : la saisie prime sur l'auto ; points retires.
  const etat = await getOdjRepository().getEtat(code, dateAg ?? ODJ_SANS_DATE);
  const saisies = new Map(etat.map((s) => [s.champId, s.valeur]));
  const appliquer = (c: ChampOdj): ChampOdj => {
    const v = saisies.get(c.id);
    if (!v) return c;
    const corrige = { ...c, valeur: v };
    delete corrige.alerte; // la saisie leve l'alerte
    return corrige;
  };

  const points = pointsLegaux(copro.lotsPrincipaux).map((p) =>
    saisies.get(`${PREFIXE_POINT}${p.id}`) === "retire" ? { ...p, applicable: false } : p,
  );

  return {
    copro: { code: copro.code, nom: copro.nom, adresse },
    ...(dateAg ? { dateAg: dateCourte(dateAg) } : {}),
    enTete: enTete.map(appliquer),
    sections: sections.map((s) => ({ ...s, champs: s.champs.map(appliquer) })),
    pointsLegaux: points,
  };
}
