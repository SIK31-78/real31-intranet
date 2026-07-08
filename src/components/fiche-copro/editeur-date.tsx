"use client";

import { useMemo, useState, useTransition } from "react";
import { Pencil, X, Check } from "lucide-react";
import { formatDateLongue, formatHeure } from "@/lib/format-date";
import { HEURE_DEFAUT_REUNION } from "@/lib/domain/reunion";
import { avertissementDateReunion } from "@/lib/domain/validation-date-reunion";
import { Button } from "@/components/ui/button";
import { definirDateAg, definirDateCs } from "./dates-actions";

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
}: {
  coproCode: string;
  type: "ag" | "cs";
  dateISO?: string;
  /** Heure existante "HH:mm" (prochaine reunion) ; absente = journee entiere. */
  heure?: string;
  quand?: "prochaine" | "derniere";
}) {
  const [edition, setEdition] = useState(false);
  const [pending, startTransition] = useTransition();
  const [dateVal, setDateVal] = useState("");
  const [heureVal, setHeureVal] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmeEffacer, setConfirmeEffacer] = useState(false);

  // L'heure ne concerne que la PROCHAINE reunion : masquee (et vide) pour "derniere".
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
  const inchange = valeurSaisie === valeurEnregistree;

  const avertissement = dateVal ? avertissementDateReunion(quand, dateVal, todayISO) : null;

  const ouvrir = () => {
    // Re-lecture des props courantes a chaque ouverture (corrige l'etat fige).
    setDateVal(dateISO ?? "");
    // Pre-remplissage de l'heure : heure existante, sinon 18:00 par defaut (le patron
    // veut une heure sur les evenements). Rien n'est sauve tant que "Valider" n'est
    // pas clique, donc ce defaut ne peut plus etre pose par accident.
    setHeureVal(avecHeure ? (heure ?? HEURE_DEFAUT_REUNION) : "");
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
    startTransition(async () => {
      const r = await action(coproCode, valeur, quand);
      if (!r.ok) setErreur(r.erreur); // on garde l'edition ouverte pour reessayer
      else fermer();
    });
  };

  if (!edition) {
    return (
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
