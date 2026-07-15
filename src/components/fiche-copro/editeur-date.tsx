"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Pencil, X, Check } from "lucide-react";
import { formatDateLongue, formatHeure } from "@/lib/format-date";
import { HEURE_DEFAUT_REUNION } from "@/lib/domain/reunion";
import type { ModeReunion } from "@/lib/domain/confirmation-evenement";
import { avertissementDateReunion } from "@/lib/domain/validation-date-reunion";
import { sallesReunion, vehicules, ressourceParEmail } from "@/lib/domain/salles-reunion";
import { Button } from "@/components/ui/button";
import { definirDateAg, definirDateCs, verifierDispoSalleAction } from "./dates-actions";

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
}) {
  const [edition, setEdition] = useState(false);
  const [pending, startTransition] = useTransition();
  const [dateVal, setDateVal] = useState("");
  const [heureVal, setHeureVal] = useState("");
  const [salleVal, setSalleVal] = useState("");
  const [zoeVal, setZoeVal] = useState(false);
  // Mode de reunion : "" = non precise (aucun mode). Cf. MODES / zMode cote action.
  const [modeVal, setModeVal] = useState<ModeReunion | "">("");
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
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmeEffacer, setConfirmeEffacer] = useState(false);

  // L'heure et la reservation de salle ne concernent que la PROCHAINE reunion :
  // masquees (et vides) pour "derniere" (simple correction du referentiel).
  const avecHeure = quand === "prochaine";
  const action = type === "ag" ? definirDateAg : definirDateCs;
  const labelVide = quand === "derniere" ? "Non renseignée" : "Non planifiée";

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
  const ressourceInchangee =
    salleVal === salleEnregistree && zoeVal === zoeEnregistree && modeVal === modeEnregistre;
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

  // Verifie la dispo de la salle des qu'une salle est choisie ET la date+heure valides.
  // Degrade "inconnu" (Graph indisponible / 403 Access Policy) : jamais bloquant. Aucun
  // setState synchrone dans le corps de l'effet (uniquement dans les callbacks async).
  useEffect(() => {
    if (!edition || !dispoCreneau) return;
    let annule = false;
    verifierDispoSalleAction(coproCode, type === "ag" ? "AG" : "CS", dateVal, heureVal, salleVal)
      .then((r) => {
        if (!annule) setDispo({ cle: cleDispo, valeur: r.dispo });
      })
      .catch(() => {
        if (!annule) setDispo({ cle: cleDispo, valeur: "inconnu" });
      });
    return () => {
      annule = true;
    };
  }, [edition, dispoCreneau, cleDispo, coproCode, type, dateVal, heureVal, salleVal]);

  // Verifie la dispo de la ZOE quand la case est cochee (getSchedule marche sur sa boite).
  useEffect(() => {
    if (!edition || !dispoZoeCreneau) return;
    let annule = false;
    verifierDispoSalleAction(coproCode, type === "ag" ? "AG" : "CS", dateVal, heureVal, ZOE_EMAIL)
      .then((r) => {
        if (!annule) setDispoZoe({ cle: cleZoe, valeur: r.dispo });
      })
      .catch(() => {
        if (!annule) setDispoZoe({ cle: cleZoe, valeur: "inconnu" });
      });
    return () => {
      annule = true;
    };
  }, [edition, dispoZoeCreneau, cleZoe, coproCode, type, dateVal, heureVal]);

  const ouvrir = () => {
    // Re-lecture des props courantes a chaque ouverture (corrige l'etat fige).
    setDateVal(dateISO ?? "");
    // Pre-remplissage de l'heure : heure existante, sinon 18:00 par defaut (le patron
    // veut une heure sur les evenements). Rien n'est sauve tant que "Valider" n'est
    // pas clique, donc ce defaut ne peut plus etre pose par accident.
    setHeureVal(avecHeure ? (heure ?? HEURE_DEFAUT_REUNION) : "");
    // Pre-remplissage salle / ZOE / mode depuis la reservation existante.
    setSalleVal(avecHeure ? (salleEmail ?? "") : "");
    setZoeVal(avecHeure ? Boolean(vehiculeEmail) : false);
    setModeVal(avecHeure ? (modeReunion ?? "") : "");
    setDispo(null);
    setDispoZoe(null);
    setErreur(null);
    setConfirmeEffacer(false);
    setEdition(true);
  };

  const fermer = () => {
    setEdition(false);
    setErreur(null);
    setConfirmeEffacer(false);
  };

  const enregistrer = (valeur: string) => {
    setErreur(null);
    // Ressources / mode transmis seulement pour une prochaine date reelle (pas a l'effacement).
    const salle = avecHeure && valeur ? salleVal : "";
    const vehicule = avecHeure && valeur && zoeVal ? ZOE_EMAIL : "";
    const mode = avecHeure && valeur ? modeVal : "";
    startTransition(async () => {
      const r = await action(
        coproCode,
        valeur,
        quand,
        salle || undefined,
        vehicule || undefined,
        mode || undefined,
      );
      if (!r.ok) setErreur(r.erreur); // on garde l'edition ouverte pour reessayer
      else fermer();
    });
  };

  if (!edition) {
    // Salle / vehicule / mode reserves (hors edition) : affiches discretement.
    const salleNom = avecHeure ? ressourceParEmail(salleEmail)?.nom : undefined;
    const zoeReservee = avecHeure && Boolean(vehiculeEmail);
    const modeNom = avecHeure ? modeReunion : undefined;
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
          disabled={pending || !dateVal || inchange}
          onClick={() => enregistrer(valeurSaisie)}
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

      {/* Avertissement non bloquant (date passee/future incoherente). */}
      {avertissement && !erreur && (
        <span className="text-[11px] text-warn-700">{avertissement}</span>
      )}
      {/* Erreur d'enregistrement : fini l'echec silencieux. */}
      {erreur && <span className="text-[11px] text-err-700">{erreur}</span>}
    </span>
  );
}
