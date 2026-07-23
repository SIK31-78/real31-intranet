"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Pencil, X, Check } from "lucide-react";
import { formatDateLongue, formatHeure } from "@/lib/format-date";
import { HEURE_DEFAUT_REUNION } from "@/lib/domain/reunion";
import type { ModeReunion } from "@/lib/domain/confirmation-evenement";
import { avertissementDateReunion } from "@/lib/domain/validation-date-reunion";
import { sallesReunion, vehicules, ressourceParEmail } from "@/lib/domain/salles-reunion";
import { planifierControlesDispo } from "@/lib/domain/disponibilite-reunion";
import { partitionnerParAgence } from "@/lib/domain/cloisonnement-agence";
import { Button } from "@/components/ui/button";
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
            className="inline-flex items-center gap-1.5 text-[16px] font-medium text-ink hover:text-green-700 transition-colors"
            title="Modifier la date"
          >
            {dateISO ? (
              <span>
                {formatDateLongue(dateISO)}
                {avecHeure && heure && <span className="text-ink-3"> à {formatHeure(heure)}</span>}
              </span>
            ) : (
              <span className="text-ink-3">{labelVide}</span>
            )}
            <Pencil strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-3" />
          </button>
          {/* Mode de tenue : badge discret a cote de la date. */}
          {dateISO && modeNom && (
            <span className="inline-flex items-center h-5 px-1.5 rounded-full bg-surface-3 text-ink-2 text-[11px] font-medium">
              {MODE_LABEL[modeNom]}
            </span>
          )}
        </span>
        {dateISO && (salleNom || zoeReservee) && (
          <span className="text-[12px] text-ink-3">
            {salleNom && <>salle {salleNom}</>}
            {salleNom && zoeReservee && <> · </>}
            {zoeReservee && <>voiture ZOE</>}
          </span>
        )}
        {/* Collegues associes : prenoms/noms discrets a cote de la date. */}
        {dateISO && collabs.length > 0 && (
          <span className="text-[12px] text-ink-3">avec {collabs.map((c) => c.nom).join(", ")}</span>
        )}
      </span>
    );
  }

  return (
    <span
      className="inline-flex flex-col gap-1.5"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !pending) fermer();
      }}
    >
      <span className="inline-flex items-center gap-1.5 flex-wrap">
        <input
          type="date"
          value={dateVal}
          autoFocus
          disabled={pending}
          aria-label={`Date ${quand === "derniere" ? "de la dernière" : "de la prochaine"} ${type === "ag" ? "AG" : "réunion de CS"}`}
          onChange={(e) => setDateVal(e.target.value)}
          className="h-8 px-2 rounded-sm border border-line bg-surface text-[13px] disabled:opacity-50"
        />
        {avecHeure && (
          <input
            type="time"
            value={heureVal}
            disabled={pending || !dateVal}
            aria-label={`Heure de la prochaine ${type === "ag" ? "AG" : "réunion de CS"}`}
            onChange={(e) => setHeureVal(e.target.value)}
            className="h-8 px-2 rounded-sm border border-line bg-surface text-[13px] disabled:opacity-50"
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

      {/* Mon agenda (le gestionnaire connecte) : meme code couleur que la ZOE / la salle.
          Apparait des que date + heure sont saisies. "Occupe" n'empeche pas de valider,
          mais demande une confirmation ; "inconnu" (Graph off / 403) ne bloque rien. */}
      {avecHeure && agendaCreneau && (
        <span
          className={
            "inline-flex items-center gap-1 text-[12px] " +
            (dispoAgendaValeur === "libre"
              ? "text-ok-700"
              : dispoAgendaValeur === "occupee"
                ? "text-warn-700"
                : "text-ink-3")
          }
          aria-live="polite"
        >
          {dispoAgendaValeur === null
            ? "Ton agenda : vérification..."
            : dispoAgendaValeur === "libre"
              ? "Ton agenda : libre"
              : dispoAgendaValeur === "occupee"
                ? "Ton agenda : occupé"
                : "Ton agenda : dispo inconnue"}
        </span>
      )}

      {/* Mode de tenue (prochaine reunion seulement) : visio / presentiel / hybride,
          ou "non precise". Note : pas de lien Teams genere pour l'instant (limitation),
          la salle reste optionnelle meme en visio / hybride. */}
      {avecHeure && (
        <span className="inline-flex items-center gap-2 flex-wrap">
          <select
            value={modeVal}
            disabled={pending}
            aria-label="Mode de tenue de la réunion"
            onChange={(e) => setModeVal(e.target.value as ModeReunion | "")}
            className="h-8 px-2 rounded-sm border border-line bg-surface text-[13px] disabled:opacity-50"
          >
            <option value="">Mode non précisé</option>
            {MODES.map((m) => (
              <option key={m.valeur} value={m.valeur}>
                {m.label}
              </option>
            ))}
          </select>
        </span>
      )}

      {/* Reservation de salle (prochaine reunion seulement) : selecteur groupe par
          agence + case ZOE. La room mailbox auto-accepte si le creneau est libre. */}
      {avecHeure && (
        <span className="inline-flex items-center gap-2 flex-wrap">
          <select
            value={salleVal}
            disabled={pending}
            aria-label="Salle de réunion à réserver"
            onChange={(e) => setSalleVal(e.target.value)}
            className="h-8 px-2 rounded-sm border border-line bg-surface text-[13px] disabled:opacity-50"
          >
            <option value="">Aucune salle</option>
            {sallesAffichees.map((s) => (
              <option key={s.email} value={s.email}>
                {s.nom}
              </option>
            ))}
          </select>

          {/* Debordement : revele les salles des autres agences (n'apparait que s'il y en a
              et qu'un filtre est actif). Vrai bouton accessible (aria-expanded). */}
          {sallesAutres.length > 0 && (
            <button
              type="button"
              onClick={() => setVoirAutresSalles((v) => !v)}
              aria-expanded={voirAutresSalles}
              disabled={pending}
              className="text-[12px] text-info-700 hover:underline disabled:opacity-50"
            >
              {voirAutresSalles ? "Masquer les autres agences" : "Voir les autres agences"}
            </button>
          )}

          <label className="inline-flex items-center gap-1.5 text-[13px] text-ink-2">
            <input
              type="checkbox"
              checked={zoeVal}
              disabled={pending}
              onChange={(e) => setZoeVal(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Réserver la voiture ZOE
          </label>

          {/* Dispo de la ZOE (meme code couleur), a cote de la case. */}
          {dispoZoeCreneau && (
            <span
              className={
                "inline-flex items-center gap-1 text-[12px] " +
                (dispoZoeValeur === "libre"
                  ? "text-ok-700"
                  : dispoZoeValeur === "occupee"
                    ? "text-warn-700"
                    : "text-ink-3")
              }
              aria-live="polite"
            >
              {dispoZoeValeur === null
                ? "Vérification..."
                : dispoZoeValeur === "libre"
                  ? "ZOE libre"
                  : dispoZoeValeur === "occupee"
                    ? "ZOE occupée"
                    : "Dispo inconnue"}
            </span>
          )}

          {/* Indicateur de dispo : vert (libre) / ambre (occupee) / gris (inconnue).
              N'apparait que quand une salle est choisie et la date+heure saisies. */}
          {dispoCreneau && (
            <span
              className={
                "inline-flex items-center gap-1 text-[12px] " +
                (dispoValeur === "libre"
                  ? "text-ok-700"
                  : dispoValeur === "occupee"
                    ? "text-warn-700"
                    : "text-ink-3")
              }
              aria-live="polite"
            >
              {dispoValeur === null
                ? "Vérification..."
                : dispoValeur === "libre"
                  ? "Salle libre"
                  : dispoValeur === "occupee"
                    ? "Salle occupée"
                    : "Dispo inconnue"}
            </span>
          )}
        </span>
      )}

      {/* Collaborateurs associes (prochaine reunion seulement) : multi-selection des
          collegues du cabinet. Chaque collegue coche est invite a l'evenement Outlook
          (il apparait dans son agenda) et sa dispo est verifiee sur le creneau. */}
      {avecHeure && collabList.length > 0 && (
        <span className="inline-flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.5px] text-ink-3">
            Collaborateurs associés
          </span>
          <span className="inline-flex flex-col gap-0.5">
            {collabAffiches.map((c) => {
              const coche = collaborateursVal.includes(c.email);
              const d = coche && agendaCreneau ? dispoCollabValeur(c.email) : undefined;
              return (
                <label
                  key={c.email}
                  className="inline-flex items-center gap-1.5 text-[13px] text-ink-2"
                >
                  <input
                    type="checkbox"
                    checked={coche}
                    disabled={pending}
                    onChange={() => toggleCollaborateur(c.email)}
                    className="h-3.5 w-3.5"
                  />
                  {c.nom}
                  {coche && agendaCreneau && (
                    <span
                      className={
                        "text-[12px] " +
                        (d === "libre"
                          ? "text-ok-700"
                          : d === "occupee"
                            ? "text-warn-700"
                            : "text-ink-3")
                      }
                      aria-live="polite"
                    >
                      {d === undefined
                        ? "· vérification..."
                        : d === "libre"
                          ? "· libre"
                          : d === "occupee"
                            ? "· occupé"
                            : "· dispo inconnue"}
                    </span>
                  )}
                </label>
              );
            })}
          </span>
          {/* Debordement : revele les collegues des autres agences (n'apparait que s'il y
              en a et qu'un filtre est actif). Vrai bouton accessible (aria-expanded). */}
          {collabAutres.length > 0 && (
            <button
              type="button"
              onClick={() => setVoirAutresCollab((v) => !v)}
              aria-expanded={voirAutresCollab}
              disabled={pending}
              className="self-start text-[12px] text-info-700 hover:underline disabled:opacity-50"
            >
              {voirAutresCollab ? "Masquer les autres agences" : "Voir les autres agences"}
            </button>
          )}
        </span>
      )}

      {/* Confirmation legere de l'effacement (geste destructif : ca deplanifie). */}
      {confirmeEffacer && (
        <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-2">
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

      {/* SALLE occupee : BLOQUANT DUR (Valider grise) - on ne double-reserve pas une salle. */}
      {blocageSalle && (
        <span
          className="inline-flex flex-col gap-0.5 text-[12px] text-err-700"
          role="alert"
          aria-live="polite"
        >
          <span className="font-medium">Salle indisponible :</span>
          <span>· {blocageSalle}</span>
          <span className="text-ink-3">Choisis une autre salle ou un autre créneau.</span>
        </span>
      )}
      {/* AGENDA / COLLEGUE occupe : AVERTISSEMENT (ambre), NON bloquant. "Valider" devient
          "Fixer quand meme" : apres accord avec le(s) collegue(s), on fixe la date. */}
      {!blocageSalle && aAvertir && (
        <span className="inline-flex flex-col gap-0.5 text-[12px] text-warn-700" aria-live="polite">
          {avertissements.map((a) => (
            <span key={a}>· {a}</span>
          ))}
          <span className="text-ink-3">
            Après accord avec le(s) collègue(s), tu peux fixer quand même (« Fixer quand même »).
          </span>
        </span>
      )}

      {/* Avertissement non bloquant (date passee/future incoherente). */}
      {avertissement && !erreur && (
        <span className="text-[11px] text-warn-700">{avertissement}</span>
      )}
      {/* Erreur d'enregistrement : fini l'echec silencieux. Si l'echec est FORCABLE (agenda /
          collegue occupe cote serveur), on propose "Fixer quand meme" (relance avec forcer). */}
      {erreur && (
        <span className="inline-flex flex-wrap items-center gap-2 text-[11px] text-err-700" role="alert">
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
