"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Pencil, X, Check, ChevronRight, ChevronDown, AlertTriangle, UserPlus } from "lucide-react";
import { formatDateLongue, formatHeure } from "@/lib/format-date";
import { HEURE_DEFAUT_REUNION } from "@/lib/domain/reunion";
import type { ModeReunion } from "@/lib/domain/confirmation-evenement";
import { avertissementDateReunion } from "@/lib/domain/validation-date-reunion";
import { alerteDelaiAg } from "@/lib/domain/jalons-ag/alerte-delai";
import { sallesReunion, vehicules, ressourceParEmail } from "@/lib/domain/salles-reunion";
import { planifierControlesDispo } from "@/lib/domain/disponibilite-reunion";
import { partitionnerParAgence } from "@/lib/domain/cloisonnement-agence";
import { Button } from "@/components/ui/button";
import { Input, Select, Choix } from "@/components/ui/field";
import { Eyebrow } from "@/components/ui/eyebrow";
import {
  definirDateAg,
  definirDateCs,
  verifierDispoSalleAction,
  verifierDispoAgendaAction,
  listerCollaborateursAction,
  type CollaborateurAssociable,
} from "./dates-actions";

// La ZOE : seul vehicule reservable (case "Reserver la voiture ZOE"). Email pris dans
// la liste fermee du domaine (jamais code en dur ici).
const ZOE_EMAIL = vehicules()[0]?.email ?? "";

// Modes de reunion proposes dans le selecteur (+ "" = non precise). Libelle du badge
// affiche a cote de la date hors edition.
const MODES: { valeur: ModeReunion; label: string }[] = [
  { valeur: "visio", label: "Visio" },
  { valeur: "presentiel", label: "Présentiel" },
  { valeur: "hybride", label: "Hybride" },
];
const MODE_LABEL: Record<ModeReunion, string> = {
  visio: "Visio",
  presentiel: "Présentiel",
  hybride: "Hybride",
};

/** "dans 6 semaines" / "dans 9 jours" : on bascule en jours sous 2 semaines, ou "6 sem."
 *  serait plus flou qu'utile a l'approche de l'echeance. */
function echeanceLisible(joursAvant: number, semainesAvant: number): string {
  if (semainesAvant >= 2) return `dans ${semainesAvant} semaines`;
  return `dans ${joursAvant} jour${joursAvant > 1 ? "s" : ""}`;
}

/** Un collaborateur (collegue) associable a une reunion : email + nom lisible. */
type Collaborateur = { email: string; nom: string };

/** Deux listes d'emails designent-elles le MEME ensemble (ordre / casse ignores) ? */
function memeEnsemble(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a.map((e) => e.toLowerCase()));
  return b.every((e) => sa.has(e.toLowerCase()));
}

/**
 * Valeur DEBOUNCEE (audit API 2026-07-16, P1-6) : ne se propage qu'apres `delaiMs` sans
 * changement. Les verifications de dispo (getSchedule Graph) ne partent plus a CHAQUE frappe
 * dans les champs date/heure (6-10 appels Graph en quelques secondes en reglant une heure au
 * clavier) mais une fois la saisie stabilisee. Les appels obsoletes restent neutralises par
 * la cle de creneau (le resultat n'est affiche que s'il correspond a la saisie COURANTE) +
 * le flag `annule` du cleanup de chaque effet.
 */
function useValeurDebouncee<T>(valeur: T, delaiMs: number): T {
  const [debouncee, setDebouncee] = useState(valeur);
  useEffect(() => {
    const t = setTimeout(() => setDebouncee(valeur), delaiMs);
    return () => clearTimeout(t);
  }, [valeur, delaiMs]);
  return debouncee;
}

/** Delai de stabilisation de la saisie avant de verifier les dispos (400-600 ms recommande). */
const DELAI_DISPO_MS = 500;

// Edition inline d'une date d'AG / CS. `quand` = prochaine (planifiee) ou derniere
// (tenue, correction du referentiel App A). Clic sur la date -> selecteur inline.
//
// Modele de sauvegarde EXPLICITE (reconstruction 2026-07 apres bugs remontes) :
//   - on choisit date (+ heure si prochaine), puis on clique "Valider" -> UNE seule
//     sauvegarde (fini l'auto-save a chaque frappe, qui provoquait courses de requetes
//     et heures 18:00 posees par accident) ;
//   - "Valider" est desactive tant que rien n'a change ou que la date est vide ;
//   - "Annuler" ferme sans rien ecrire ; "Effacer" deplanifie (confirmation legere) ;
//   - toute action a un retour explicite : une erreur s'affiche en rouge (fini les
//     echecs silencieux) ;
//   - les champs sont re-lus depuis les props a CHAQUE ouverture (fini l'etat fige qui
//     reaffichait l'ancienne date apres sauvegarde).
//
// Une PROCHAINE reunion porte aussi une HEURE (pre-remplie a 18:00, modifiable) : date +
// heure sont combinees en 'YYYY-MM-DDTHH:mm:00'. La derniere date (correction du
// referentiel, passee) n'a pas d'heure de reunion.
export function EditeurDate({
  coproCode,
  type,
  dateISO,
  heure,
  quand = "prochaine",
  salleEmail,
  vehiculeEmail,
  modeReunion,
  collaborateurs,
  agenceCode,
}: {
  coproCode: string;
  type: "ag" | "cs";
  dateISO?: string;
  /** Heure existante "HH:mm" (prochaine reunion) ; absente = journee entiere. */
  heure?: string;
  quand?: "prochaine" | "derniere";
  /** Salle deja reservee pour la prochaine reunion (pre-remplit le selecteur). */
  salleEmail?: string;
  /** Vehicule (la ZOE) deja reserve pour la prochaine reunion. */
  vehiculeEmail?: string;
  /** Mode de tenue deja choisi (visio / presentiel / hybride) pour la prochaine reunion. */
  modeReunion?: ModeReunion;
  /** Collaborateurs (collegues) deja associes a la prochaine reunion (email + nom) :
   *  badge hors edition + pre-selection du selecteur. */
  collaborateurs?: Collaborateur[];
  /** Code d'agence de la copro (ML/LGC/HLS/ASN) : filtre par defaut les salles proposees
   *  a cette agence (debordement "Voir les autres agences"). Absent -> pas de filtre. */
  agenceCode?: string;
}) {
  const [edition, setEdition] = useState(false);
  const [pending, startTransition] = useTransition();
  const [dateVal, setDateVal] = useState("");
  const [heureVal, setHeureVal] = useState("");
  const [salleVal, setSalleVal] = useState("");
  const [zoeVal, setZoeVal] = useState(false);
  // Mode de reunion : "" = non precise (aucun mode). Cf. MODES / zMode cote action.
  const [modeVal, setModeVal] = useState<ModeReunion | "">("");
  // Collaborateurs selectionnes (emails) + annuaire des collegues associables (charge a
  // l'ouverture via l'action). L'annuaire porte les noms lisibles ; la selection ne
  // stocke que les emails (transmis a l'action, revalides serveur).
  const [collaborateursVal, setCollaborateursVal] = useState<string[]>([]);
  const [collabList, setCollabList] = useState<CollaborateurAssociable[]>([]);
  // Agence (id technique) de la copro, resolue cote serveur avec l'annuaire : sert a
  // filtrer les collegues proposes par defaut sur l'agence de la copro (debordement).
  const [agenceCopro, setAgenceCopro] = useState<string | null>(null);
  // Debordement "Voir les autres agences" : replie par defaut (filtrage strict), deplie
  // pour montrer salles / collegues des autres agences. Le filtre est du CONFORT
  // d'affichage, pas une barriere (la validation serveur reste sur les listes fermees).
  const [voirAutresSalles, setVoirAutresSalles] = useState(false);
  const [voirAutresCollab, setVoirAutresCollab] = useState(false);
  // LOGISTIQUE REPLIEE (Sekou, 2026-09-11 : "trop de choses affichees one shot"). Le geste
  // courant est de poser une DATE ; le mode, la salle, la ZOE et les collegues sont de
  // l'organisation, utile mais secondaire. Ils tiennent derriere une ligne de resume qui
  // dit deja ce qui est reserve, et se deplient au clic. Voir aussi `resumeLogistique`.
  const [logistiqueOuverte, setLogistiqueOuverte] = useState(false);
  // La liste des collegues cochables ne s'affiche qu'a la demande : 12 cases a cocher
  // permanentes etaient le plus gros bloc de l'editeur pour un reglage rare.
  const [choixCollabOuvert, setChoixCollabOuvert] = useState(false);
  // Resultat de dispo indexe par le creneau interroge (date|heure|salle) : on n'affiche
  // que s'il correspond a la saisie courante -> pas de reset synchrone dans l'effet
  // (evite les rendus en cascade) ni d'indicateur perime apres un changement de salle.
  const [dispo, setDispo] = useState<{
    cle: string;
    valeur: "libre" | "occupee" | "inconnu";
  } | null>(null);
  // Dispo de la ZOE (meme mecanique que la salle, indexee par creneau).
  const [dispoZoe, setDispoZoe] = useState<{
    cle: string;
    valeur: "libre" | "occupee" | "inconnu";
  } | null>(null);
  // Dispo de MON agenda (le gestionnaire connecte) sur le creneau, meme mecanique.
  const [dispoAgenda, setDispoAgenda] = useState<{
    cle: string;
    valeur: "libre" | "occupee" | "inconnu";
  } | null>(null);
  // Dispo de chaque collegue selectionne, indexee par `${email}|${cleAgenda}` : on ne
  // lit que la valeur qui correspond au creneau courant (pas d'indicateur perime).
  const [dispoCollab, setDispoCollab] = useState<
    Record<string, "libre" | "occupee" | "inconnu">
  >({});
  const [erreur, setErreur] = useState<string | null>(null);
  // Le dernier echec est-il FORCABLE (agenda/collegue occupe cote serveur) ? -> propose
  // "Fixer quand meme". Une salle occupee n'est jamais forcable.
  const [forcable, setForcable] = useState(false);
  const [confirmeEffacer, setConfirmeEffacer] = useState(false);

  // L'heure et la reservation de salle ne concernent que la PROCHAINE reunion :
  // masquees (et vides) pour "derniere" (simple correction du referentiel).
  const avecHeure = quand === "prochaine";
  const action = type === "ag" ? definirDateAg : definirDateCs;
  const labelVide = quand === "derniere" ? "Non renseignée" : "Non planifiée";
  const typeApi = type === "ag" ? "AG" : "CS";

  // Aujourd'hui en date LOCALE 'YYYY-MM-DD' (pour l'avertissement passe/futur, du point
  // de vue de l'utilisateur). Comparaison de chaines cote domaine : aucun decalage de jour.
  const todayISO = useMemo(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }, []);

  // Combine date + heure en 'YYYY-MM-DDTHH:mm:00' (datetime) ou en date pure si pas
  // d'heure. Date vide -> "" (= effacer).
  const combiner = (date: string, h: string): string => (date && h ? `${date}T${h}:00` : date);

  // Valeur actuellement enregistree (props), pour detecter un vrai changement.
  const valeurEnregistree = combiner(dateISO ?? "", avecHeure ? (heure ?? "") : "");
  const valeurSaisie = combiner(dateVal, avecHeure ? heureVal : "");
  // Ressources deja enregistrees (props) vs saisie, pour detecter un changement de salle
  // / vehicule meme a date inchangee. Sans heure ("derniere") : pas de ressource.
  const salleEnregistree = avecHeure ? (salleEmail ?? "") : "";
  const zoeEnregistree = avecHeure ? Boolean(vehiculeEmail) : false;
  const modeEnregistre = avecHeure ? (modeReunion ?? "") : "";
  const collaborateursEnregistres = avecHeure ? (collaborateurs?.map((c) => c.email) ?? []) : [];
  const ressourceInchangee =
    salleVal === salleEnregistree &&
    zoeVal === zoeEnregistree &&
    modeVal === modeEnregistre &&
    memeEnsemble(collaborateursVal, collaborateursEnregistres);
  const inchange = valeurSaisie === valeurEnregistree && ressourceInchangee;

  const avertissement = dateVal ? avertissementDateReunion(quand, dateVal, todayISO) : null;

  // Retroplanning AG (Sekou 2026-07-28) : une date d'AG traine deux jalons derriere elle
  // (CS de validation de l'ODJ a J-45, mise sous pli a J-31). Plutot qu'une alerte seche
  // "c'est court", on affiche ces deux echeances : le gestionnaire voit ses vraies dates
  // butoir au lieu de subir un avertissement. Calcule sur la SAISIE EN COURS (`dateVal`)
  // et pas sur la valeur enregistree : l'impact se voit AVANT de valider. Jamais bloquant.
  const delaiAg =
    type === "ag" && quand === "prochaine" && dateVal ? alerteDelaiAg(dateVal, todayISO) : null;

  // Creneau interroge et resultat correspondant a la saisie courante (null tant qu'on
  // n'a pas de reponse pour CE creneau -> affichage "Vérification...").
  const cleDispo = `${dateVal}|${heureVal}|${salleVal}`;
  const dispoCreneau = avecHeure && salleVal && dateVal && heureVal;
  const dispoValeur = dispo && dispo.cle === cleDispo ? dispo.valeur : null;

  // Idem pour la ZOE (quand la case est cochee et la date+heure saisies).
  const cleZoe = `${dateVal}|${heureVal}|zoe`;
  const dispoZoeCreneau = avecHeure && zoeVal && dateVal && heureVal;
  const dispoZoeValeur = dispoZoe && dispoZoe.cle === cleZoe ? dispoZoe.valeur : null;

  // Creneau des AGENDAS (mon agenda + collegues) : des que date + heure sont saisies.
  const cleAgenda = `${dateVal}|${heureVal}`;
  const agendaCreneau = avecHeure && dateVal && heureVal;
  const dispoAgendaValeur = dispoAgenda && dispoAgenda.cle === cleAgenda ? dispoAgenda.valeur : null;

  // Cles DEBOUNCEES (audit API 2026-07-16, P1-6) : les verifications getSchedule partent sur
  // la saisie STABILISEE, plus a chaque frappe/toggle. Le "|" est un separateur sur : ni les
  // dates, ni les heures, ni les emails de salle n'en contiennent -> on re-derive date/heure/
  // salle de la cle debouncee, ce qui garantit que la reponse est rangee sous LA cle qui a
  // servi a la requete (un resultat perime n'est jamais affiche : l'UI ne lit que la cle
  // correspondant a la saisie courante).
  const cleDispoDebouncee = useValeurDebouncee(cleDispo, DELAI_DISPO_MS);
  const cleZoeDebouncee = useValeurDebouncee(cleZoe, DELAI_DISPO_MS);
  const cleAgendaDebouncee = useValeurDebouncee(cleAgenda, DELAI_DISPO_MS);

  // Verifie la dispo de la salle des qu'une salle est choisie ET la date+heure valides.
  // Degrade "inconnu" (Graph indisponible / 403 Access Policy) : jamais bloquant. Aucun
  // setState synchrone dans le corps de l'effet (uniquement dans les callbacks async).
  useEffect(() => {
    if (!edition || !avecHeure) return;
    const [date, heure, salle] = cleDispoDebouncee.split("|");
    if (!date || !heure || !salle) return;
    let annule = false;
    verifierDispoSalleAction(coproCode, typeApi, date, heure, salle)
      .then((r) => {
        if (!annule) setDispo({ cle: cleDispoDebouncee, valeur: r.dispo });
      })
      .catch(() => {
        if (!annule) setDispo({ cle: cleDispoDebouncee, valeur: "inconnu" });
      });
    return () => {
      annule = true; // garde anti-appel-obsolete : la reponse d'un creneau abandonne est jetee
    };
  }, [edition, avecHeure, cleDispoDebouncee, coproCode, typeApi]);

  // Verifie la dispo de la ZOE quand la case est cochee (getSchedule marche sur sa boite).
  // Le toggle de la case reste immediat (geste deliberee) ; seule la saisie date/heure debounce.
  useEffect(() => {
    if (!edition || !avecHeure || !zoeVal) return;
    const [date, heure] = cleZoeDebouncee.split("|");
    if (!date || !heure) return;
    let annule = false;
    verifierDispoSalleAction(coproCode, typeApi, date, heure, ZOE_EMAIL)
      .then((r) => {
        if (!annule) setDispoZoe({ cle: cleZoeDebouncee, valeur: r.dispo });
      })
      .catch(() => {
        if (!annule) setDispoZoe({ cle: cleZoeDebouncee, valeur: "inconnu" });
      });
    return () => {
      annule = true;
    };
  }, [edition, avecHeure, zoeVal, cleZoeDebouncee, coproCode, typeApi]);

  // Verifie MON agenda (le gestionnaire connecte) des que date + heure sont saisies :
  // email absent cote action -> l'agenda de session. Meme degrade "inconnu".
  useEffect(() => {
    if (!edition || !avecHeure) return;
    const [date, heure] = cleAgendaDebouncee.split("|");
    if (!date || !heure) return;
    let annule = false;
    verifierDispoAgendaAction(coproCode, typeApi, date, heure)
      .then((r) => {
        if (!annule) setDispoAgenda({ cle: cleAgendaDebouncee, valeur: r.dispo });
      })
      .catch(() => {
        if (!annule) setDispoAgenda({ cle: cleAgendaDebouncee, valeur: "inconnu" });
      });
    return () => {
      annule = true;
    };
  }, [edition, avecHeure, cleAgendaDebouncee, coproCode, typeApi]);

  // Verifie la dispo de CHAQUE collegue selectionne sur le creneau. Une seule passe (pas
  // un hook par collegue) : on interroge tous les selectionnes en parallele et on range
  // les reponses par `${email}|${cleAgenda}`. Degrade "inconnu" par collegue.
  useEffect(() => {
    if (!edition || !avecHeure || collaborateursVal.length === 0) return;
    const [date, heure] = cleAgendaDebouncee.split("|");
    if (!date || !heure) return;
    let annule = false;
    for (const email of collaborateursVal) {
      const k = `${email}|${cleAgendaDebouncee}`;
      verifierDispoAgendaAction(coproCode, typeApi, date, heure, email)
        .then((r) => {
          if (!annule) setDispoCollab((prev) => ({ ...prev, [k]: r.dispo }));
        })
        .catch(() => {
          if (!annule) setDispoCollab((prev) => ({ ...prev, [k]: "inconnu" }));
        });
    }
    return () => {
      annule = true;
    };
    // collaborateursVal (ref) ne change qu'a une (de)selection reelle ; la cle debouncee au
    // changement de creneau STABILISE -> l'effet ne se rejoue que sur un vrai changement.
  }, [edition, avecHeure, cleAgendaDebouncee, collaborateursVal, coproCode, typeApi]);

  // Charge l'annuaire des collegues associables a l'ouverture (prochaine reunion seule) +
  // l'agence de la copro (pour le filtrage par agence). Un seul aller-retour serveur.
  useEffect(() => {
    if (!edition || !avecHeure) return;
    let annule = false;
    listerCollaborateursAction(coproCode)
      .then((r) => {
        if (annule) return;
        setCollabList(r.collaborateurs);
        setAgenceCopro(r.agenceCopro);
      })
      .catch(() => {
        if (!annule) {
          setCollabList([]);
          setAgenceCopro(null);
        }
      });
    return () => {
      annule = true;
    };
  }, [edition, avecHeure, coproCode]);

  // Dispo d'un collegue pour le creneau courant (undefined = pas encore de reponse).
  const dispoCollabValeur = (email: string) => dispoCollab[`${email}|${cleAgenda}`];

  // OCCUPE = BLOQUANT (decision Sekou 2026-07). On ne PEUT PAS fixer la date si la salle,
  // mon agenda OU un collegue invite est OCCUPE sur le creneau. Le plan (domaine pur, meme
  // regle que le serveur) EXCLUT les cibles dont un "occupe" viendrait de NOTRE propre
  // evenement deja projete (replanification creneau inchange) : re-sauver une reunion
  // inchangee (ex. ajouter un collegue) n'est jamais bloque par notre propre reservation.
  // "inconnu" (Graph off / 403) ne bloque JAMAIS. La ZOE (vehicule) reste non bloquante.
  const plan =
    avecHeure && dateVal && heureVal
      ? planifierControlesDispo(
          {
            date: dateISO ?? "",
            heure: heure ?? "",
            salle: salleEmail ?? "",
            collaborateurs: collaborateurs?.map((c) => c.email) ?? [],
          },
          { date: dateVal, heure: heureVal, salle: salleVal, collaborateurs: collaborateursVal },
        )
      : null;
  // SALLE occupee = blocage DUR (Valider grise : on ne double-reserve pas une salle).
  // MON agenda / un COLLEGUE occupe = avertissement FORCABLE ("Fixer quand meme" apres accord).
  let blocageSalle: string | null = null;
  const avertissements: string[] = [];
  if (plan) {
    if (plan.verifierAgenda && dispoAgendaValeur === "occupee")
      avertissements.push("Ton agenda est occupé sur ce créneau.");
    if (plan.salleAverifier && dispoValeur === "occupee")
      blocageSalle = `La salle ${ressourceParEmail(salleVal)?.nom ?? "sélectionnée"} est occupée sur ce créneau.`;
    for (const c of collabList) {
      if (
        collaborateursVal.includes(c.email) &&
        plan.collaborateursAverifier.includes(c.email) &&
        dispoCollabValeur(c.email) === "occupee"
      )
        avertissements.push(`L'agenda de ${c.nom.split(" ")[0]} est occupé sur ce créneau.`);
    }
  }
  const bloque = blocageSalle !== null; // dur (salle) -> grise Valider
  const aAvertir = avertissements.length > 0; // forcable (agenda/collegue) -> "Fixer quand meme"

  // CLOISONNEMENT PAR AGENCE (confort d'affichage, partition PURE cote domaine). Salles de
  // l'agence de la copro par defaut, le reste au debordement "Voir les autres agences".
  // Sans agenceCode (copro sans agence) -> partition sans filtre (tout en "meme agence").
  // La ZOE (vehicule) n'est pas concernee : elle a sa propre case, hors de ce selecteur.
  const { memeAgence: sallesAgence, autres: sallesAutres } = partitionnerParAgence(
    sallesReunion(),
    (s) => s.agence,
    agenceCode,
  );
  const sallesVisibles = voirAutresSalles ? [...sallesAgence, ...sallesAutres] : sallesAgence;
  // La salle deja reservee reste TOUJOURS affichee/selectionnable, meme repliee et meme si
  // elle appartient a une autre agence (sinon le <select> perdrait sa valeur courante).
  const sallesAffichees =
    salleVal && !sallesVisibles.some((s) => s.email === salleVal)
      ? [...sallesVisibles, ...sallesReunion().filter((s) => s.email === salleVal)]
      : sallesVisibles;

  // Idem pour les collegues : ceux de l'agence de la copro par defaut, le reste au
  // debordement. Un collegue sans agence tombe dans "autres" (jamais par defaut).
  const { memeAgence: collabAgence, autres: collabAutres } = partitionnerParAgence(
    collabList,
    (c) => c.agencyId,
    agenceCopro,
  );
  const collabVisibles = voirAutresCollab ? [...collabAgence, ...collabAutres] : collabAgence;
  // Les collegues deja associes restent TOUJOURS visibles/decochables meme replies.
  const collabAffiches = [
    ...collabVisibles,
    ...collabAutres.filter(
      (c) => collaborateursVal.includes(c.email) && !collabVisibles.some((v) => v.email === c.email),
    ),
  ];

  const ouvrir = () => {
    // Re-lecture des props courantes a chaque ouverture (corrige l'etat fige).
    setDateVal(dateISO ?? "");
    // Pre-remplissage de l'heure : heure existante, sinon 18:00 par defaut (le patron
    // veut une heure sur les evenements). Rien n'est sauve tant que "Valider" n'est
    // pas clique, donc ce defaut ne peut plus etre pose par accident.
    setHeureVal(avecHeure ? (heure ?? HEURE_DEFAUT_REUNION) : "");
    // Pre-remplissage salle / ZOE / mode / collegues depuis la reservation existante.
    setSalleVal(avecHeure ? (salleEmail ?? "") : "");
    setZoeVal(avecHeure ? Boolean(vehiculeEmail) : false);
    setModeVal(avecHeure ? (modeReunion ?? "") : "");
    setCollaborateursVal(avecHeure ? (collaborateurs?.map((c) => c.email) ?? []) : []);
    setDispo(null);
    setDispoZoe(null);
    setDispoAgenda(null);
    setDispoCollab({});
    // Debordement replie a chaque ouverture (filtrage strict par defaut).
    setVoirAutresSalles(false);
    setVoirAutresCollab(false);
    setErreur(null);
    setForcable(false);
    setConfirmeEffacer(false);
    setEdition(true);
  };

  const fermer = () => {
    setEdition(false);
    setErreur(null);
    setForcable(false);
    setConfirmeEffacer(false);
  };

  // (De)selectionne un collegue.
  const toggleCollaborateur = (email: string) => {
    setCollaborateursVal((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email],
    );
  };

  const enregistrer = (valeur: string, forcer = false) => {
    setErreur(null);
    setForcable(false);
    // Ressources / mode / collegues transmis seulement pour une prochaine date reelle
    // (pas a l'effacement).
    const salle = avecHeure && valeur ? salleVal : "";
    const vehicule = avecHeure && valeur && zoeVal ? ZOE_EMAIL : "";
    const mode = avecHeure && valeur ? modeVal : "";
    const collabs = avecHeure && valeur ? collaborateursVal : [];
    startTransition(async () => {
      const r = await action(
        coproCode,
        valeur,
        quand,
        salle || undefined,
        vehicule || undefined,
        mode || undefined,
        collabs,
        forcer,
      );
      if (!r.ok) {
        setErreur(r.erreur); // on garde l'edition ouverte pour reessayer
        setForcable(Boolean(r.forcable)); // agenda/collegue occupe -> propose "Fixer quand meme"
      } else fermer();
    });
  };

  // Clic sur "Valider" : la salle occupee bloque (bouton deja grise, double securite).
  // Un agenda/collegue occupe (aAvertir) ne bloque pas : on transmet `forcer` pour passer outre.
  const tenterEnregistrer = () => {
    if (bloque) return;
    enregistrer(valeurSaisie, aAvertir);
  };

  if (!edition) {
    // Salle / vehicule / mode / collegues reserves (hors edition) : affiches discretement.
    const salleNom = avecHeure ? ressourceParEmail(salleEmail)?.nom : undefined;
    const zoeReservee = avecHeure && Boolean(vehiculeEmail);
    const modeNom = avecHeure ? modeReunion : undefined;
    const collabs = avecHeure ? (collaborateurs ?? []) : [];
    return (
      <span className="inline-flex flex-col gap-0.5">
        <span className="inline-flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={ouvrir}
            className="inline-flex items-center gap-1.5 text-title font-medium text-ink hover:text-green-700 transition-colors duration-120 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
            title="Modifier la date"
          >
            {dateISO ? (
              <span>
                {formatDateLongue(dateISO)}
                {avecHeure && heure && <span className="text-ink-2"> à {formatHeure(heure)}</span>}
              </span>
            ) : (
              <span className="text-ink-3 font-normal">{labelVide}</span>
            )}
            <Pencil strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-2" aria-hidden />
          </button>
          {/* Mode de tenue : badge discret a cote de la date. */}
          {dateISO && modeNom && (
            <span className="inline-flex items-center h-5 px-1.5 rounded-sm bg-surface-2 border border-line text-ink-2 text-meta font-medium">
              {MODE_LABEL[modeNom]}
            </span>
          )}
        </span>
        {dateISO && (salleNom || zoeReservee) && (
          <span className="text-body text-ink-2">
            {salleNom && <>salle {salleNom}</>}
            {salleNom && zoeReservee && <> · </>}
            {zoeReservee && <>voiture ZOE</>}
          </span>
        )}
        {/* Collegues associes : prenoms/noms discrets a cote de la date. */}
        {dateISO && collabs.length > 0 && (
          <span className="text-body text-ink-2">avec {collabs.map((c) => c.nom).join(", ")}</span>
        )}
      </span>
    );
  }

  // --- Resume de la logistique (la ligne qu'on lit quand tout est replie) -------------
  // Elle doit repondre sans cliquer : sous quelle forme, ou, avec qui. Quand rien n'est
  // pose, elle le dit aussi - sinon on ne saurait pas qu'il y a quelque chose a ouvrir.
  const salleNom = salleVal ? (ressourceParEmail(salleVal)?.nom ?? "salle") : null;
  const partsResume = [
    modeVal ? MODE_LABEL[modeVal] : null,
    salleNom,
    zoeVal ? "voiture ZOE" : null,
    collaborateursVal.length > 0
      ? `${collaborateursVal.length} collègue${collaborateursVal.length > 1 ? "s" : ""}`
      : null,
  ].filter(Boolean) as string[];
  const resumeLogistique =
    partsResume.length > 0 ? partsResume.join(" · ") : "Mode, salle et collègues non précisés";

  // Collegues RETENUS, affiches en pastilles. On passe par `collabList` pour avoir le nom ;
  // un email retenu que l'annuaire n'a pas encore rendu (chargement) garde son adresse
  // plutot que de disparaitre de l'ecran - sinon on croirait l'avoir perdu.
  const collabRetenus: Collaborateur[] = collaborateursVal.map((email) => {
    const connu = collabList.find((c) => c.email.toLowerCase() === email.toLowerCase());
    return { email, nom: connu?.nom ?? email };
  });

  // --- UN SEUL bloc "A verifier" -----------------------------------------------------
  // Avant : trois zones colorees separees (agenda ambre, salle rouge, delai ambre) plus un
  // avertissement de date, empilees sous les champs. Quatre couleurs pour un seul message :
  // "regarde avant de fixer". On les rassemble ici, en gardant la distinction qui COMPTE -
  // bloquant (on ne peut pas fixer) contre forcable (on peut, apres accord).
  const pointsAVerifier: { cle: string; texte: string; bloquant?: boolean }[] = [];
  if (blocageSalle) pointsAVerifier.push({ cle: "salle", texte: blocageSalle, bloquant: true });
  for (const a of avertissements) pointsAVerifier.push({ cle: a, texte: a });
  if (avertissement && !erreur) pointsAVerifier.push({ cle: "date", texte: avertissement });
  if (delaiAg && !erreur)
    pointsAVerifier.push({
      cle: "delai",
      texte: `AG ${echeanceLisible(delaiAg.joursAvant, delaiAg.semainesAvant)} : ${
        delaiAg.niveau === "critique"
          ? "la convocation ne peut plus partir dans les temps."
          : "délai court pour préparer l'ODJ, le faire valider en CS puis convoquer."
      }`,
      bloquant: delaiAg.niveau === "critique",
    });
  const aVerifier = pointsAVerifier.length > 0;
  const tonVerif = pointsAVerifier.some((p) => p.bloquant) ? "err" : "warn";

  return (
    <span
      className="inline-flex flex-col gap-1.5"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !pending) fermer();
      }}
    >
      <span className="inline-flex items-center gap-1.5 flex-wrap">
        <Input
          type="date"
          largeur="auto"
          value={dateVal}
          autoFocus
          disabled={pending}
          aria-label={`Date ${quand === "derniere" ? "de la dernière" : "de la prochaine"} ${type === "ag" ? "AG" : "réunion de CS"}`}
          onChange={(e) => setDateVal(e.target.value)}
        />
        {avecHeure && (
          <Input
            type="time"
            largeur="auto"
            value={heureVal}
            disabled={pending || !dateVal}
            aria-label={`Heure de la prochaine ${type === "ag" ? "AG" : "réunion de CS"}`}
            onChange={(e) => setHeureVal(e.target.value)}
          />
        )}
        <Button
          type="button"
          size="sm"
          variant="primary"
          disabled={pending || !dateVal || inchange || bloque}
          onClick={tenterEnregistrer}
          title={
            bloque
              ? "Salle occupée : choisis une autre salle ou un autre créneau"
              : aAvertir
                ? "Agenda occupé : tu peux fixer quand même (après accord)"
                : "Enregistrer la date"
          }
        >
          <Check strokeWidth={2} />
          {pending ? "Enregistrement..." : aAvertir && !bloque ? "Fixer quand même" : "Valider"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={fermer}>
          Annuler
        </Button>
        {dateISO && !confirmeEffacer && (
          <Button
            type="button"
            size="sm"
            variant="danger"
            disabled={pending}
            onClick={() => setConfirmeEffacer(true)}
            title="Effacer la date (déplanifier)"
          >
            <X strokeWidth={2} /> Effacer
          </Button>
        )}
      </span>

      {/* --- LOGISTIQUE, REPLIEE PAR DEFAUT -------------------------------------------
          Une ligne de resume, depliable. Tout ce qui suit (mode, salle, ZOE, collegues,
          dispos) etait affiche en permanence : c'etait l'essentiel des 11 blocs que Sekou
          voyait "one shot" alors qu'il venait juste poser une date. */}
      {avecHeure && (
        <span className="inline-flex flex-col gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            aria-expanded={logistiqueOuverte}
            disabled={pending}
            onClick={() => setLogistiqueOuverte((v) => !v)}
          >
            {logistiqueOuverte ? (
              <ChevronDown strokeWidth={1.5} />
            ) : (
              <ChevronRight strokeWidth={1.5} />
            )}
            {resumeLogistique}
          </Button>

          {logistiqueOuverte && (
            <span className="inline-flex flex-col gap-2 pl-3 border-l border-line">
              {/* Mode de tenue : visio / presentiel / hybride, ou "non precise". Pas de
                  lien Teams genere pour l'instant ; la salle reste optionnelle en visio. */}
              <span className="inline-flex items-center gap-2 flex-wrap">
                <Select
                  largeur="auto"
                  value={modeVal}
                  disabled={pending}
                  aria-label="Mode de tenue de la réunion"
                  onChange={(e) => setModeVal(e.target.value as ModeReunion | "")}
                >
                  <option value="">Mode non précisé</option>
                  {MODES.map((m) => (
                    <option key={m.valeur} value={m.valeur}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </span>

              {/* Salle + ZOE. La room mailbox auto-accepte si le creneau est libre. */}
              <span className="inline-flex items-center gap-2 flex-wrap">
                <Select
                  largeur="auto"
                  value={salleVal}
                  disabled={pending}
                  aria-label="Salle de réunion à réserver"
                  onChange={(e) => setSalleVal(e.target.value)}
                >
                  <option value="">Aucune salle</option>
                  {sallesAffichees.map((s) => (
                    <option key={s.email} value={s.email}>
                      {s.nom}
                    </option>
                  ))}
                </Select>

                {/* Debordement : revele les salles des autres agences. */}
                {sallesAutres.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setVoirAutresSalles((v) => !v)}
                    aria-expanded={voirAutresSalles}
                    disabled={pending}
                  >
                    {voirAutresSalles ? "Masquer les autres agences" : "Voir les autres agences"}
                  </Button>
                )}

                <Choix
                  type="checkbox"
                  label="Réserver la voiture ZOE"
                  checked={zoeVal}
                  disabled={pending}
                  onChange={(e) => setZoeVal(e.target.checked)}
                />
              </span>

              {/* Dispos du creneau. Seul le vert et le gris restent ICI : ce qui est OCCUPE
                  remonte dans le bloc "A verifier" et n'est plus dit deux fois. */}
              {(agendaCreneau || dispoCreneau || dispoZoeCreneau) && (
                <span className="inline-flex items-center gap-3 flex-wrap text-body" aria-live="polite">
                  {agendaCreneau && dispoAgendaValeur !== "occupee" && (
                    <span className={dispoAgendaValeur === "libre" ? "text-ok-700" : "text-ink-2"}>
                      {dispoAgendaValeur === null
                        ? "Ton agenda : vérification…"
                        : dispoAgendaValeur === "libre"
                          ? "Ton agenda : libre"
                          : "Ton agenda : dispo inconnue"}
                    </span>
                  )}
                  {dispoCreneau && dispoValeur !== "occupee" && (
                    <span className={dispoValeur === "libre" ? "text-ok-700" : "text-ink-2"}>
                      {dispoValeur === null
                        ? "Salle : vérification…"
                        : dispoValeur === "libre"
                          ? "Salle libre"
                          : "Salle : dispo inconnue"}
                    </span>
                  )}
                  {dispoZoeCreneau && (
                    <span
                      className={
                        dispoZoeValeur === "libre"
                          ? "text-ok-700"
                          : dispoZoeValeur === "occupee"
                            ? "text-warn-700"
                            : "text-ink-2"
                      }
                    >
                      {dispoZoeValeur === null
                        ? "ZOE : vérification…"
                        : dispoZoeValeur === "libre"
                          ? "ZOE libre"
                          : dispoZoeValeur === "occupee"
                            ? "ZOE occupée"
                            : "ZOE : dispo inconnue"}
                    </span>
                  )}
                </span>
              )}

              {/* Collegues associes : les RETENUS en pastilles, la liste a la demande.
                  Douze cases a cocher permanentes etaient le plus gros bloc de l'editeur
                  pour un reglage rare. Chaque collegue retenu est invite a l'evenement
                  Outlook et sa dispo est verifiee sur le creneau. */}
              {collabList.length > 0 && (
                <span className="inline-flex flex-col gap-1.5">
                  <Eyebrow as="span">Collègues associés</Eyebrow>
                  <span className="inline-flex items-center gap-1 flex-wrap">
                    {collabRetenus.map((c) => {
                      const d = agendaCreneau ? dispoCollabValeur(c.email) : undefined;
                      return (
                        <span
                          key={c.email}
                          className="inline-flex items-center gap-1.5 h-6 pl-2 pr-1 rounded-sm bg-surface-2 border border-line text-meta text-ink"
                        >
                          {c.nom}
                          {d === "occupee" && <span className="text-warn-700">occupé</span>}
                          <button
                            type="button"
                            onClick={() => toggleCollaborateur(c.email)}
                            disabled={pending}
                            aria-label={`Retirer ${c.nom}`}
                            className="text-ink-3 hover:text-err-700 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
                          >
                            <X strokeWidth={2} className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    })}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-expanded={choixCollabOuvert}
                      disabled={pending}
                      onClick={() => setChoixCollabOuvert((v) => !v)}
                    >
                      <UserPlus strokeWidth={1.5} />
                      {choixCollabOuvert ? "Fermer la liste" : "Associer des collègues"}
                    </Button>
                  </span>

                  {choixCollabOuvert && (
                    <span className="inline-flex flex-col gap-0.5">
                      {collabAffiches.map((c) => (
                        <label
                          key={c.email}
                          className="inline-flex items-center gap-1.5 text-body text-ink cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={collaborateursVal.includes(c.email)}
                            disabled={pending}
                            onChange={() => toggleCollaborateur(c.email)}
                            className="accent-green-700 w-3.5 h-3.5"
                          />
                          {c.nom}
                        </label>
                      ))}
                      {/* Debordement : revele les collegues des autres agences. */}
                      {collabAutres.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="self-start"
                          onClick={() => setVoirAutresCollab((v) => !v)}
                          aria-expanded={voirAutresCollab}
                          disabled={pending}
                        >
                          {voirAutresCollab
                            ? "Masquer les autres agences"
                            : "Voir les autres agences"}
                        </Button>
                      )}
                    </span>
                  )}
                </span>
              )}
            </span>
          )}
        </span>
      )}

      {/* Confirmation legere de l'effacement (geste destructif : ca deplanifie). */}
      {confirmeEffacer && (
        <span className="inline-flex items-center gap-1.5 text-body text-ink-2">
          Déplanifier cette date ?
          <Button
            type="button"
            size="sm"
            variant="danger"
            disabled={pending}
            onClick={() => enregistrer("")}
          >
            {pending ? "Suppression..." : "Oui, effacer"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => setConfirmeEffacer(false)}
          >
            Non
          </Button>
        </span>
      )}

      {/* --- UN SEUL bloc "A verifier" -----------------------------------------------
          Avant : quatre zones colorees empilees (agenda ambre, salle rouge, date ambre,
          retroplanning ambre ou rouge sur quatre lignes). Quatre couleurs pour un seul
          message. On les rassemble, en gardant la seule distinction qui compte : ce qui
          BLOQUE (salle occupee, convocation hors delai) contre ce qui se force apres
          accord. Le detail du retroplanning descend dans un repli : on le consulte quand
          on en a besoin, il n'occupe plus quatre lignes en permanence. */}
      {aVerifier && !erreur && (
        <span
          className={
            "inline-flex flex-col gap-1 rounded-lg border px-2.5 py-2 text-body " +
            (tonVerif === "err"
              ? "border-err-500/30 bg-err-50 text-err-700"
              : "border-warn-500/30 bg-warn-50 text-warn-700")
          }
          role={tonVerif === "err" ? "alert" : undefined}
          aria-live="polite"
        >
          <span className="inline-flex items-center gap-1.5 font-medium">
            <AlertTriangle strokeWidth={1.5} className="w-3.5 h-3.5 shrink-0" aria-hidden />
            À vérifier avant de fixer
          </span>
          {pointsAVerifier.map((pt) => (
            <span key={pt.cle}>· {pt.texte}</span>
          ))}

          {/* Retroplanning : le detail des deux echeances, replie. */}
          {delaiAg && (
            <details className="text-ink-2">
              <summary className="cursor-pointer text-meta">Voir les échéances</summary>
              <span className="inline-flex flex-col gap-0.5 pt-1 text-meta">
                {/* Les deux ODJ, nommes : celui DU CS qu'on prepare et envoie au conseil,
                    puis celui DE L'AG que le conseil valide et qui part dans la convocation. */}
                <span className={delaiAg.odjPrepDepasse ? "text-warn-700" : undefined}>
                  · ODJ du CS à envoyer au conseil avant le {formatDateLongue(delaiAg.odjPrepISO)}
                  {delaiAg.odjPrepDepasse && " (échéance dépassée)"}
                </span>
                <span className={delaiAg.odjCsDepasse ? "text-warn-700" : undefined}>
                  · ODJ de l&apos;AG à valider avec le CS avant le {formatDateLongue(delaiAg.odjCsISO)}
                  {delaiAg.odjCsDepasse && " (échéance dépassée)"}
                </span>
                <span className={delaiAg.convocDepassee ? "text-warn-700" : undefined}>
                  · Mise sous pli avant le {formatDateLongue(delaiAg.convocISO)}
                  {delaiAg.convocDepassee && " (échéance dépassée)"}
                </span>
              </span>
            </details>
          )}

          <span className="text-ink-2 text-meta">
            {blocageSalle
              ? "Choisis une autre salle ou un autre créneau."
              : aAvertir
                ? "Après accord avec le(s) collègue(s), tu peux fixer quand même."
                : "Tu peux fixer cette date quand même."}
          </span>
        </span>
      )}

      {/* Erreur d'enregistrement : fini l'echec silencieux. Si l'echec est FORCABLE (agenda /
          collegue occupe cote serveur), on propose "Fixer quand meme" (relance avec forcer). */}
      {erreur && (
        <span className="inline-flex flex-wrap items-center gap-2 text-meta text-err-700" role="alert">
          <span>{erreur}</span>
          {forcable && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => enregistrer(valeurSaisie, true)}
            >
              Fixer quand même
            </Button>
          )}
        </span>
      )}
    </span>
  );
}
