"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Pencil, X, Check } from "lucide-react";
import { formatDateLongue, formatHeure } from "@/lib/format-date";
import { HEURE_DEFAUT_REUNION } from "@/lib/domain/reunion";
import type { ModeReunion } from "@/lib/domain/confirmation-evenement";
import { avertissementDateReunion } from "@/lib/domain/validation-date-reunion";
import { sallesReunion, vehicules, ressourceParEmail } from "@/lib/domain/salles-reunion";
import { Button } from "@/components/ui/button";
import {
  definirDateAg,
  definirDateCs,
  verifierDispoSalleAction,
  verifierDispoAgendaAction,
  listerCollaborateursAction,
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
  const [collabList, setCollabList] = useState<Collaborateur[]>([]);
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
  const [confirmeEffacer, setConfirmeEffacer] = useState(false);
  // Un creneau "occupe" (mon agenda ou un collegue) ne BLOQUE pas : il exige une
  // confirmation explicite au Valider. Ce drapeau passe a true au 1er clic si un
  // conflit existe, et affiche l'avertissement + le bouton "planifier quand meme".
  const [confirmeOccupe, setConfirmeOccupe] = useState(false);

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

  // Verifie la dispo de la salle des qu'une salle est choisie ET la date+heure valides.
  // Degrade "inconnu" (Graph indisponible / 403 Access Policy) : jamais bloquant. Aucun
  // setState synchrone dans le corps de l'effet (uniquement dans les callbacks async).
  useEffect(() => {
    if (!edition || !dispoCreneau) return;
    let annule = false;
    verifierDispoSalleAction(coproCode, typeApi, dateVal, heureVal, salleVal)
      .then((r) => {
        if (!annule) setDispo({ cle: cleDispo, valeur: r.dispo });
      })
      .catch(() => {
        if (!annule) setDispo({ cle: cleDispo, valeur: "inconnu" });
      });
    return () => {
      annule = true;
    };
  }, [edition, dispoCreneau, cleDispo, coproCode, typeApi, dateVal, heureVal, salleVal]);

  // Verifie la dispo de la ZOE quand la case est cochee (getSchedule marche sur sa boite).
  useEffect(() => {
    if (!edition || !dispoZoeCreneau) return;
    let annule = false;
    verifierDispoSalleAction(coproCode, typeApi, dateVal, heureVal, ZOE_EMAIL)
      .then((r) => {
        if (!annule) setDispoZoe({ cle: cleZoe, valeur: r.dispo });
      })
      .catch(() => {
        if (!annule) setDispoZoe({ cle: cleZoe, valeur: "inconnu" });
      });
    return () => {
      annule = true;
    };
  }, [edition, dispoZoeCreneau, cleZoe, coproCode, typeApi, dateVal, heureVal]);

  // Verifie MON agenda (le gestionnaire connecte) des que date + heure sont saisies :
  // email absent cote action -> l'agenda de session. Meme degrade "inconnu".
  useEffect(() => {
    if (!edition || !agendaCreneau) return;
    let annule = false;
    verifierDispoAgendaAction(coproCode, typeApi, dateVal, heureVal)
      .then((r) => {
        if (!annule) setDispoAgenda({ cle: cleAgenda, valeur: r.dispo });
      })
      .catch(() => {
        if (!annule) setDispoAgenda({ cle: cleAgenda, valeur: "inconnu" });
      });
    return () => {
      annule = true;
    };
  }, [edition, agendaCreneau, cleAgenda, coproCode, typeApi, dateVal, heureVal]);

  // Verifie la dispo de CHAQUE collegue selectionne sur le creneau. Une seule passe (pas
  // un hook par collegue) : on interroge tous les selectionnes en parallele et on range
  // les reponses par `${email}|${cleAgenda}`. Degrade "inconnu" par collegue.
  useEffect(() => {
    if (!edition || !agendaCreneau || collaborateursVal.length === 0) return;
    let annule = false;
    for (const email of collaborateursVal) {
      const k = `${email}|${cleAgenda}`;
      verifierDispoAgendaAction(coproCode, typeApi, dateVal, heureVal, email)
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
    // collaborateursVal (ref) ne change qu'a une (de)selection reelle ; cleAgenda au
    // changement de creneau -> l'effet ne se rejoue que sur un vrai changement.
  }, [edition, agendaCreneau, cleAgenda, collaborateursVal, coproCode, typeApi, dateVal, heureVal]);

  // Charge l'annuaire des collegues associables a l'ouverture (prochaine reunion seule).
  useEffect(() => {
    if (!edition || !avecHeure) return;
    let annule = false;
    listerCollaborateursAction()
      .then((l) => {
        if (!annule) setCollabList(l);
      })
      .catch(() => {
        if (!annule) setCollabList([]);
      });
    return () => {
      annule = true;
    };
  }, [edition, avecHeure]);

  // Dispo d'un collegue pour le creneau courant (undefined = pas encore de reponse).
  const dispoCollabValeur = (email: string) => dispoCollab[`${email}|${cleAgenda}`];

  // Conflit d'agenda = mon agenda occupe OU au moins un collegue occupe (sur ce creneau).
  const monAgendaOccupe = dispoAgendaValeur === "occupee";
  const collabOccupe = collaborateursVal.some((e) => dispoCollabValeur(e) === "occupee");
  const aUnConflit = avecHeure && (monAgendaOccupe || collabOccupe);

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
    setErreur(null);
    setConfirmeEffacer(false);
    setConfirmeOccupe(false);
    setEdition(true);
  };

  const fermer = () => {
    setEdition(false);
    setErreur(null);
    setConfirmeEffacer(false);
    setConfirmeOccupe(false);
  };

  // (De)selectionne un collegue. Toute modification annule une confirmation d'occupation
  // en cours (le conflit peut avoir change).
  const toggleCollaborateur = (email: string) => {
    setConfirmeOccupe(false);
    setCollaborateursVal((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email],
    );
  };

  const enregistrer = (valeur: string) => {
    setErreur(null);
    setConfirmeOccupe(false);
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
      );
      if (!r.ok) setErreur(r.erreur); // on garde l'edition ouverte pour reessayer
      else fermer();
    });
  };

  // Clic sur "Valider" : un conflit d'agenda non encore confirme n'enregistre pas tout
  // de suite -> il affiche l'avertissement (bloc dedie). "Inconnu" ne bloque jamais.
  const tenterEnregistrer = () => {
    if (aUnConflit && !confirmeOccupe) {
      setConfirmeOccupe(true);
      return;
    }
    enregistrer(valeurSaisie);
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
          onChange={(e) => {
            setConfirmeOccupe(false);
            setDateVal(e.target.value);
          }}
          className="h-8 px-2 rounded-sm border border-line bg-surface text-[13px] disabled:opacity-50"
        />
        {avecHeure && (
          <input
            type="time"
            value={heureVal}
            disabled={pending || !dateVal}
            aria-label={`Heure de la prochaine ${type === "ag" ? "AG" : "réunion de CS"}`}
            onChange={(e) => {
              setConfirmeOccupe(false);
              setHeureVal(e.target.value);
            }}
            className="h-8 px-2 rounded-sm border border-line bg-surface text-[13px] disabled:opacity-50"
          />
        )}
        <Button
          type="button"
          size="sm"
          variant="primary"
          disabled={pending || !dateVal || inchange}
          onClick={tenterEnregistrer}
          title="Enregistrer la date"
        >
          <Check strokeWidth={2} />
          {pending ? "Enregistrement..." : "Valider"}
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
            {sallesReunion().map((s) => (
              <option key={s.email} value={s.email}>
                {s.nom}
              </option>
            ))}
          </select>

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
            {collabList.map((c) => {
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

      {/* Conflit d'agenda (non bloquant) : confirmation explicite avant d'enregistrer. */}
      {confirmeOccupe && (
        <span className="inline-flex items-center gap-1.5 flex-wrap text-[12px] text-warn-700">
          {monAgendaOccupe && collabOccupe
            ? "Ton agenda et celui d'un collègue ont déjà un rendez-vous sur ce créneau."
            : monAgendaOccupe
              ? "Tu as déjà un rendez-vous sur ce créneau."
              : "Un collègue a déjà un rendez-vous sur ce créneau."}
          <Button
            type="button"
            size="sm"
            variant="primary"
            disabled={pending}
            onClick={() => enregistrer(valeurSaisie)}
          >
            {pending ? "Enregistrement..." : "Planifier quand même"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => setConfirmeOccupe(false)}
          >
            Annuler
          </Button>
        </span>
      )}

      {/* Avertissement non bloquant (date passee/future incoherente). */}
      {avertissement && !erreur && (
        <span className="text-[11px] text-warn-700">{avertissement}</span>
      )}
      {/* Erreur d'enregistrement : fini l'echec silencieux. */}
      {erreur && <span className="text-[11px] text-err-700">{erreur}</span>}
    </span>
  );
}
