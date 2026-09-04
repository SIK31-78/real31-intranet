"use client";

// Declencheur global "Signaler un bug / une idée" : petit bouton flottant discret (bas
// droite), present sur toutes les pages authentifiees (monte dans AppShell). Au clic ->
// modale : type (bug / idée), description (requis), sévérité, + capture AUTOMATIQUE du
// pathname courant. L'auteur vient de la session serveur (pas de champ ici). Envoi via
// server action, bouton verrouille pendant l'envoi (pas de double envoi), confirmation
// "Merci, c'est remonté".

import { useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { Bug, Lightbulb, MessageSquarePlus, Check } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { envoyerFeedback } from "@/app/feedback/actions";
import {
  APPLICATIONS_FEEDBACK,
  LIBELLES_APPLICATION,
  type ApplicationFeedback,
  type SeveriteFeedback,
  type TypeFeedback,
} from "@/lib/domain/feedback";

const SEVERITES: { valeur: SeveriteFeedback; label: string; aide: string }[] = [
  { valeur: "bloquant", label: "Bloquant", aide: "M'empêche de travailler." },
  { valeur: "genant", label: "Gênant", aide: "Contournable, mais pénible." },
  { valeur: "confort", label: "Confort", aide: "Ce serait un plus." },
];

export function FeedbackTrigger() {
  const pathname = usePathname();
  const [ouvert, setOuvert] = useState(false);
  const [type, setType] = useState<TypeFeedback>("bug");
  const [application, setApplication] = useState<ApplicationFeedback>("real31");
  const [lien, setLien] = useState("");
  const [description, setDescription] = useState("");
  const [severite, setSeverite] = useState<SeveriteFeedback>("genant");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoye, setEnvoye] = useState(false);
  const [enCours, startTransition] = useTransition();

  function reset() {
    setType("bug");
    setApplication("real31");
    setLien("");
    setDescription("");
    setSeverite("genant");
    setErreur(null);
    setEnvoye(false);
  }

  function fermer() {
    setOuvert(false);
    // Laisse l'animation de fermeture avant de reinitialiser l'etat.
    setTimeout(reset, 150);
  }

  function soumettre() {
    setErreur(null);
    startTransition(async () => {
      // real31 : le pathname est capture automatiquement ; autre application : le lien
      // colle par le collaborateur (facultatif).
      const r = await envoyerFeedback({
        type,
        description,
        severite,
        application,
        page: application === "real31" ? pathname : lien.trim() || undefined,
      });
      if (!r.ok) {
        setErreur(r.message ?? "Envoi impossible.");
        return;
      }
      setEnvoye(true);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        aria-label="Signaler un bug ou une idée"
        title="Signaler un bug ou une idée"
        className={cn(
          "fixed bottom-4 right-4 z-50 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-2 text-[12.5px] font-medium text-ink-2 shadow-md",
          "hover:bg-surface-2 hover:text-ink transition-colors",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-1",
        )}
      >
        <MessageSquarePlus strokeWidth={1.5} className="h-4 w-4 shrink-0 text-ink-3" />
        <span className="hidden sm:inline">Un bug / une idée ?</span>
      </button>

      {ouvert && (
        <Modal titre="Signaler un bug / une idée" onFermer={fermer}>
          {envoye ? (
            <div className="px-6 py-10 flex flex-col items-center text-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50 text-green-700">
                <Check strokeWidth={1.75} className="h-5 w-5" />
              </span>
              <div className="text-[15px] font-medium text-ink">Merci, c&apos;est remonté</div>
              <p className="text-[13px] text-ink-3 max-w-[320px]">
                On l&apos;a bien reçu. Tu suivras ce qui est prévu et livré dans « Nouveautés ».
              </p>
              <div className="mt-2">
                <Button variant="primary" onClick={fermer}>
                  Fermer
                </Button>
              </div>
            </div>
          ) : (
            <div className="px-4 py-4 flex flex-col gap-4">
              {/* Application concernee : les collegues remontent aussi les bugs des
                  autres outils du cabinet (demande Sekou 2026-09-04). */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[12px] text-ink-2">Quelle application ?</span>
                <div className="flex flex-wrap gap-2">
                  {APPLICATIONS_FEEDBACK.map((a) => {
                    const actif = application === a;
                    return (
                      <button
                        key={a}
                        type="button"
                        onClick={() => setApplication(a)}
                        aria-pressed={actif}
                        className={cn(
                          "rounded-md border px-3 py-1.5 text-[13px] transition-colors",
                          "focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-1",
                          actif
                            ? "border-green-600/40 bg-green-50 text-green-700 font-medium"
                            : "border-line bg-surface text-ink-2 hover:bg-surface-2",
                        )}
                      >
                        {LIBELLES_APPLICATION[a]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Type : bug / idée */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[12px] text-ink-2">De quoi s&apos;agit-il ?</span>
                <div className="flex gap-2">
                  {(
                    [
                      { valeur: "bug" as const, label: "Un bug", icon: Bug },
                      { valeur: "idee" as const, label: "Une idée", icon: Lightbulb },
                    ]
                  ).map((o) => {
                    const Icon = o.icon;
                    const actif = type === o.valeur;
                    return (
                      <button
                        key={o.valeur}
                        type="button"
                        onClick={() => setType(o.valeur)}
                        aria-pressed={actif}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[13px] transition-colors",
                          "focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-1",
                          actif
                            ? "border-green-600/40 bg-green-50 text-green-700 font-medium"
                            : "border-line bg-surface text-ink-2 hover:bg-surface-2",
                        )}
                      >
                        <Icon strokeWidth={1.5} className="h-3.5 w-3.5" />
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Description (requis) */}
              <label className="flex flex-col gap-1.5 text-[12px] text-ink-2">
                {type === "bug" ? "Que s'est-il passé ?" : "Ton idée en quelques mots"}
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  maxLength={2000}
                  placeholder={
                    type === "bug"
                      ? "Ex. Le bouton « Convoquer » ne fait rien quand je clique dessus…"
                      : "Ex. Pouvoir exporter la liste des copros en CSV…"
                  }
                  className="w-full resize-y rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] text-ink placeholder:text-ink-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
                />
              </label>

              {/* Sévérité */}
              <fieldset className="flex flex-col gap-1.5">
                <legend className="text-[12px] text-ink-2 mb-1">Importance</legend>
                <div className="flex flex-col gap-1.5 sm:flex-row sm:gap-2">
                  {SEVERITES.map((s) => (
                    <label
                      key={s.valeur}
                      className={cn(
                        "flex-1 cursor-pointer rounded-md border px-2.5 py-2 text-[13px] transition-colors",
                        severite === s.valeur
                          ? "border-green-600/40 bg-green-50"
                          : "border-line bg-surface hover:bg-surface-2",
                      )}
                    >
                      <span className="flex items-center gap-1.5">
                        <input
                          type="radio"
                          name="severite"
                          checked={severite === s.valeur}
                          onChange={() => setSeverite(s.valeur)}
                          className="accent-green-700"
                        />
                        <span className={cn("font-medium", severite === s.valeur ? "text-green-700" : "text-ink")}>
                          {s.label}
                        </span>
                      </span>
                      <span className="mt-0.5 block pl-5 text-[11.5px] text-ink-3">{s.aide}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {/* Page concernee : capturee automatiquement sur real31, lien libre
                  (facultatif) pour les autres applications. */}
              {application === "real31" ? (
                <p className="text-[11.5px] text-ink-4">
                  Page concernée : <code className="font-mono text-ink-3">{pathname}</code> (jointe automatiquement).
                </p>
              ) : (
                <label className="flex flex-col gap-1.5 text-[12px] text-ink-2">
                  La page concernée (facultatif)
                  <input
                    type="text"
                    value={lien}
                    onChange={(e) => setLien(e.target.value)}
                    maxLength={280}
                    placeholder="Colle un lien si tu en as un…"
                    className="w-full rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] text-ink placeholder:text-ink-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
                  />
                </label>
              )}

              {erreur && <div className="text-[12.5px] text-err-700">{erreur}</div>}

              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" onClick={fermer} disabled={enCours}>
                  Annuler
                </Button>
                <Button variant="primary" onClick={soumettre} disabled={enCours || !description.trim()}>
                  {enCours ? "Envoi…" : "Envoyer"}
                </Button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
