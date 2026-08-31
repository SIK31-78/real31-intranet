// Compose l'ODJ pour une AG (id = CODE ou CODE__DATE) : squelette auto (referentiel
// Supabase + jalons + Estale) puis superposition de l'ETAT saisi (intranet_odj_champs :
// la saisie du gestionnaire prime sur la valeur auto ; points legaux retires/restaures),
// puis champs CALCULES (ecart budget, proposition contrat). Scope managerId.

import type { ChampOdj, Odj, SectionOdj, SourceDonnee } from "@/lib/domain/odj";
import type { DonneesEstaleCopro } from "@/lib/domain/copropriete";
import { pointsLegaux, ecartBudget, parseMontant, formatEuros, parseCloture } from "@/lib/domain/odj";
import { getCoproRepository, getOdjRepository } from "@/lib/adapters/router";
import { CLE_CLOTURE_ODJ } from "@/lib/ports/odj-repository";
import { donneesCoproEstale } from "@/lib/services/estale/donnees-copro-estale";
import { PREFIXE_POINT } from "@/lib/ports/odj-repository";
import { cleOdj, decouperIdOdj } from "@/lib/services/odj/resoudre-cle-odj";
import { blocsLibres, champsLibresDeSection } from "@/lib/domain/odj-libre";
import { calculerJalons } from "@/lib/domain/jalons-ag/calculator";
import { DELAIS_CABINET } from "@/lib/domain/jalons-ag/cabinet/real31-defaults";
import { getConfirmations } from "@/lib/services/coproprietes/confirmation-evenement";
import { adresseRessource } from "@/lib/domain/salles-reunion";

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
  options?: {
    valeur?: string;
    alerte?: string;
    editable?: boolean;
    type?: ChampOdj["type"];
  },
): ChampOdj {
  return {
    id,
    libelle,
    source,
    ...(options?.valeur ? { valeur: options.valeur } : {}),
    ...(options?.alerte ? { alerte: options.alerte } : {}),
    ...(options?.editable !== undefined ? { editable: options.editable } : {}),
    ...(options?.type ? { type: options.type } : {}),
  };
}

export async function getOdj(id: string, gestionnaireId: string): Promise<Odj | null> {
  const { code } = decouperIdOdj(id);
  const copro = await getCoproRepository().findByCode(code, gestionnaireId);
  if (!copro) return null;

  // Meme resolution que les actions d'ecriture (resoudre-cle-odj) : `dateAg` sert a
  // l'affichage et aux jalons, `agDate` est la cle de la table d'etat.
  const { dateAg, agDate } = cleOdj(id, copro.prochaineAg?.date);
  const adresse = [copro.adresse.ligne1, `${copro.adresse.codePostal} ${copro.adresse.ville}`.trim()]
    .filter(Boolean)
    .join(", ");

  // Mise sous pli = jalon CONVOC (J-31 cabinet). Limite d'ajout de points = J-41
  // (glissement mecanique : AJOUT_ODJ_AVANT_CONVOC_JOURS se compte depuis la cible).
  const convocISO = dateAg
    ? calculerJalons(dateAg).find((j) => j.code === "CONVOC")?.cibleDate
    : undefined;
  const limiteOdjISO = convocISO
    ? moinsJours(convocISO, DELAIS_CABINET.AJOUT_ODJ_AVANT_CONVOC_JOURS)
    : undefined;

  // Presents : une ligne syndic (gestionnaire + assistant, referentiel) et une
  // ligne conseil syndical (Estale). Le jour du CS, on retire les absents.
  // Estale est secondaire ici : s'il tombe (5xx / timeout), on ne crashe pas l'ODJ.
  // Tous les acces ci-dessous sont en `estale?.` -> les champs auto restent vides,
  // le squelette + la saisie du gestionnaire s'affichent normalement.
  let estale: DonneesEstaleCopro | null = null;
  try {
    estale = await donneesCoproEstale(code); // read-through (ADR-002), au lieu d'appeler Estale en direct
  } catch (err) {
    console.warn(`[odj] Estale indisponible pour ${code} :`, (err as Error).message);
  }
  // Presents en "NOM Prenom" : les noms du referentiel sont "Prenom NOM" (NOM en
  // capitales) -> on detecte les tokens tout-majuscule comme nom de famille.
  const nomMajuscule = (nomComplet: string): string => {
    const tokens = nomComplet.trim().split(/\s+/);
    const nom = tokens.filter((t) => t.length > 1 && t === t.toUpperCase());
    const prenom = tokens.filter((t) => !(t.length > 1 && t === t.toUpperCase()));
    return nom.length && prenom.length ? `${nom.join(" ")} ${prenom.join(" ")}` : nomComplet;
  };
  const syndic = copro.equipe
    .filter((m) => m.role === "gestionnaire" || m.role === "assistant")
    .map((m) => nomMajuscule(m.nomComplet))
    .join(", ");
  const membresCs = (estale?.conseilSyndical ?? [])
    .map((m) => `${m.nomComplet}${m.role === "president" ? " (président)" : ""}`)
    .join(", ");

  // Donnees Estale alimentant la gestion courante : contrats (gaz / elec) + procedures.
  const formatContrat = (categorie: string): string | undefined => {
    const c = (estale?.contrats ?? []).find((x) => x.categorie === categorie);
    if (!c) return undefined;
    const d = c.debut ? dateCourte(c.debut) : undefined;
    const f = c.fin ? dateCourte(c.fin) : undefined;
    const bornes = d && f ? `du ${d} au ${f}` : d ? `depuis le ${d}` : f ? `jusqu'au ${f}` : "";
    return `${c.libelle}${bornes ? ` (${bornes})` : ""}`;
  };
  const valeurGaz = formatContrat("ENERGY_GAS");
  const valeurElec = formatContrat("ENERGY_ELECTRICITY");
  const valeurProc = estale?.nbProcedures ? `${estale.nbProcedures} procedure(s) en cours` : undefined;

  // Comptabilite (Estale) : budget previsionnel + depenses (-> ecart auto) + travaux + fonds + debiteurs.
  const valeurBudget = estale?.budgetPrevisionnel != null ? String(estale.budgetPrevisionnel) : undefined;
  const valeurDepenses = estale?.depensesCourantes != null ? String(estale.depensesCourantes) : undefined;
  const valeurTravaux =
    estale?.travauxVotes && estale.travauxVotes.length > 0
      ? estale.travauxVotes
          .map((t) => `${t.libelle} : voté ${formatEuros(t.budgetVote)}, dépensé ${formatEuros(t.depenses)}`)
          .join(" ; ")
      : undefined;
  const valeurFonds = estale?.fondsTravaux != null ? String(estale.fondsTravaux) : undefined;
  // Debiteurs a ce jour : "NOM Prenom montant (>5% budget)" pour ceux qui depassent le seuil.
  const valeurDebiteurs =
    estale?.debiteurs && estale.debiteurs.length > 0
      ? estale.debiteurs
          .map((d) => `${d.nom} ${formatEuros(d.montant)}${d.depasse5pct ? " (>5% budget)" : ""}`)
          .join(" ; ")
      : undefined;
  // Consommation eau (compte 601) : volume + montant + prix au m3.
  const valeurEau = estale?.eau
    ? `${estale.eau.volume.toLocaleString("fr-FR")} m³ pour ${formatEuros(estale.eau.montant)} (${estale.eau.prixM3.toLocaleString(
        "fr-FR",
        { minimumFractionDigits: 2, maximumFractionDigits: 2 },
      )} €/m³)`
    : undefined;
  // AG en visio : pre-rempli depuis Estale (meetingVideo) ; le gestionnaire ajuste.
  const visioInitial = estale?.agVisioAcceptee != null ? (estale.agVisioAcceptee ? "oui" : "non") : undefined;
  // Lieu de l'AG : pre-rempli depuis la SALLE reservee pour l'AG (fiche copro / editeur de
  // date), rendue en ADRESSE POSTALE seule -- le convoque a besoin de savoir ou aller, pas
  // du nom interne de la salle (demande Sekou 2026-07-28). Le gestionnaire garde la main :
  // le champ reste editable et sa saisie prime (AG hors les murs, salle municipale...).
  // Degrade proprement : aucune salle reservee, ou salle sans adresse -> champ vide a saisir.
  const confirmationAg = (await getConfirmations(code)).find((c) => c.type === "AG");
  const lieuSalle = adresseRessource(confirmationAg?.salleEmail);

  const RAPPORT_CS =
    "Le syndic rappelle au CS qu'un rapport / compte rendu de son activité sur l'année devra nous être adressé afin d'être joint à la convocation.";

  const enTete: ChampOdj[] = [
    champ("adresse", "Adresse", "supabase", { valeur: adresse }),
    champ("date-ag", "Date de l'AG", dateAg ? "supabase" : "manuel", { valeur: dateCourte(dateAg) }),
    champ("date-cs", "Date du CS preparatoire", "supabase", {
      valeur: dateCourte(copro.prochaineCsDate),
      alerte: copro.prochaineCsDate
        ? undefined
        : "Date de CS non renseignee : a planifier (fiche copro ou supervision).",
    }),
    champ("lieu", "Lieu de l'AG", lieuSalle ? "supabase" : "manuel", {
      editable: true,
      ...(lieuSalle ? { valeur: lieuSalle } : {}),
    }),
    champ("visio", "AG en visio (hybride)", visioInitial != null ? "estale" : "manuel", {
      editable: true,
      type: "booleen",
      valeur: visioInitial,
    }),
    champ("presents-syndic", "Pour le syndic", "supabase", {
      valeur: syndic || undefined,
      editable: true,
    }),
    champ("presents-cs", "Pour le conseil syndical", "estale", {
      valeur: membresCs || undefined,
      editable: true,
      alerte: membresCs
        ? undefined
        : "Membres du CS a recuperer depuis Estale (retirer les absents le jour du CS).",
    }),
    champ("limite-odj", "Date limite d'ajout de points a l'ODJ", limiteOdjISO ? "jalon" : "manuel", {
      valeur: dateCourte(limiteOdjISO),
      editable: true,
    }),
    champ("mise-sous-pli", "Mise sous pli de la convocation (1 mois avant l'AG)", convocISO ? "jalon" : "manuel", {
      valeur: dateCourte(convocISO),
      editable: true,
    }),
  ];

  const e = { editable: true };
  const m = { editable: true, type: "montant" as const };
  const sections: SectionOdj[] = [
    {
      id: "verif-comptes",
      titre: "Verification des comptes",
      champs: [
        champ("comptes.depenses-courantes", "Total des depenses courantes", "estale", { editable: true, type: "montant", valeur: valeurDepenses }),
        champ("comptes.budget", "Budget previsionnel", "estale", { editable: true, type: "montant", valeur: valeurBudget }),
        champ("comptes.ecart-budget", "Trop-percu / depassement budget courant", "calcul"),
        champ("comptes.eau", "Consommation eau (volume + prix au m3)", "estale", { editable: true, valeur: valeurEau }),
        champ("comptes.travaux-votes", "Travaux votes (budget appele)", "estale", { editable: true, valeur: valeurTravaux }),
        champ("comptes.debiteurs", "Coproprietaire(s) debiteur(s)", "estale", { editable: true, valeur: valeurDebiteurs }),
        champ("comptes.compteurs-eau", "Compteurs d'eau collectes", "supabase", e),
        champ("comptes.repartiteurs", "Repartiteurs de frais de chauffage collectes", "supabase", e),
        champ("comptes.fonds-travaux", "Fonds travaux (montant fin d'exercice)", "estale", { editable: true, type: "montant", valeur: valeurFonds }),
      ],
    },
    {
      id: "gestion-courante",
      titre: "Gestion courante",
      champs: [
        champ("gestion.sinistres", "Dossiers sinistres en cours", "estale", e),
        champ("gestion.procedures", "Dossiers procedure en cours ou a lancer", "estale", { editable: true, valeur: valeurProc }),
        champ("gestion.autres", "Autres dossiers de gestion courante", "manuel", e),
        champ("gestion.gaz", "Contrat gaz (dates effet / fin)", "estale", { editable: true, valeur: valeurGaz }),
        champ("gestion.electricite", "Contrat electricite (dates effet / fin)", "estale", { editable: true, valeur: valeurElec }),
        champ("gestion.engie", "Optimisation du contrat ENGIE", "manuel", e),
        champ("gestion.subvention-dtg", "Subvention Metropole pour le DTG", "manuel", e),
        champ("gestion.dtg-pppt", "Avancement DTG / PPPT", "manuel", e),
      ],
    },
    {
      id: "points-a-porter",
      titre: "Points a porter a l'ordre du jour",
      champs: [
        champ("points.rapport-cs", "Rapport moral du CS", "manuel", { editable: true, valeur: RAPPORT_CS }),
        champ("points.budget-n1", "Budget N+1 propose", "estale", m),
        champ("points.renouvellement-cs", "Renouvellement du CS - candidats (retirer ceux qui ne se representent pas)", "estale", {
          editable: true,
          valeur: membresCs || undefined,
        }),
        champ("points.contrat-syndic-actuel", "Contrat de syndic actuel (TTC)", "estale", m),
        champ("points.contrat-syndic-augmentation", "Augmentation proposee (%)", "manuel", {
          editable: true,
          type: "pourcentage",
        }),
        champ("points.contrat-syndic-proposition", "Proposition de nouveau contrat (TTC)", "calcul"),
      ],
    },
  ];

  // Superposition de l'etat saisi : la saisie prime sur l'auto ; points retires
  // ("retire") ou restaures ("inclus"), sinon le defaut du catalogue.
  const etat = await getOdjRepository().getEtat(code, agDate);
  const saisies = new Map(etat.map((s) => [s.champId, s.valeur]));
  // Cloture ("reunion terminee") : portee par une cle RESERVEE de la meme table d'etat.
  // On la retire des saisies pour qu'elle ne soit jamais confondue avec la valeur d'un champ.
  const cloture = parseCloture(saisies.get(CLE_CLOTURE_ODJ));
  saisies.delete(CLE_CLOTURE_ODJ);
  const appliquer = (c: ChampOdj): ChampOdj => {
    const v = saisies.get(c.id);
    if (!v) return c;
    // `saisi` marque l'origine : sans lui, le badge ne saurait pas distinguer une valeur
    // remplie par Estale d'une valeur tapee par le gestionnaire (cf. provenanceChamp).
    const corrige = { ...c, valeur: v, saisi: true };
    delete corrige.alerte; // la saisie leve l'alerte
    return corrige;
  };

  const enTeteFinal = enTete.map(appliquer);
  // Champs libres : ajoutes par le gestionnaire, ils VIVENT dans l'etat (pas dans le
  // squelette) et rejoignent leur section a la lecture. Blocs libres : fin de document.
  const sectionsFinales = sections.map((s) => ({
    ...s,
    champs: [...s.champs.map(appliquer), ...champsLibresDeSection(etat, s.id)],
  }));
  const blocs = blocsLibres(etat);

  // Champs calcules (apres superposition, pour partir des valeurs effectives).
  const valeurDe = (id: string): string | undefined =>
    sectionsFinales.flatMap((s) => s.champs).find((c) => c.id === id)?.valeur;
  const poser = (id: string, valeur: string | undefined) => {
    for (const s of sectionsFinales) {
      const c = s.champs.find((x) => x.id === id);
      if (c && valeur) c.valeur = valeur;
    }
  };

  // Ecart budget : libelle adapte selon le signe (trop-percu / depassement).
  const ecart = ecartBudget(valeurDe("comptes.budget"), valeurDe("comptes.depenses-courantes"));
  if (ecart) {
    for (const s of sectionsFinales) {
      const c = s.champs.find((x) => x.id === "comptes.ecart-budget");
      if (c) {
        c.libelle = ecart.libelle;
        c.valeur = ecart.valeur;
      }
    }
  }

  const actuel = parseMontant(valeurDe("points.contrat-syndic-actuel"));
  const pct = parseMontant(valeurDe("points.contrat-syndic-augmentation"));
  if (actuel !== null && pct !== null) {
    poser(
      "points.contrat-syndic-proposition",
      `${formatEuros(actuel * (1 + pct / 100))} (+${pct.toLocaleString("fr-FR")} %)`,
    );
  }

  const points = pointsLegaux(copro.lotsPrincipaux, {
    anneeConstruction: estale?.anneeConstruction,
    anneeCourante: new Date().getUTCFullYear(),
  }).map((p) => {
    const v = saisies.get(`${PREFIXE_POINT}${p.id}`);
    if (v === "retire") return { ...p, applicable: false };
    if (v === "inclus") return { ...p, applicable: true };
    return p;
  });

  // ODJ cloture = document FIGE : on retire `editable` de TOUS les champs ici, en un seul
  // endroit, plutot que de faire descendre un booleen "verrouille" dans chaque composant.
  // Le verrou reste double : l'action serveur refuse aussi la saisie sur un ODJ clos.
  const figer = (c: ChampOdj): ChampOdj => {
    if (!c.editable) return c;
    const copie = { ...c };
    delete copie.editable;
    return copie;
  };

  return {
    copro: { code: copro.code, nom: copro.nom, adresse },
    ...(dateAg ? { dateAg: dateCourte(dateAg), dateAgISO: dateAg.slice(0, 10) } : {}),
    enTete: cloture ? enTeteFinal.map(figer) : enTeteFinal,
    sections: cloture
      ? sectionsFinales.map((s) => ({ ...s, champs: s.champs.map(figer) }))
      : sectionsFinales,
    pointsLegaux: points,
    ...(blocs.length ? { blocsLibres: blocs } : {}),
    ...(cloture ? { cloture } : {}),
  };
}
