"use client";

// Bouton + modale de composition du mail au conseil syndical (increment 2 "dates CS/AG").
// FLUX IMPERATIF : pre-rempli (serveur) -> le gestionnaire RELIT et modifie tout
// (destinataires, objet, corps) -> clic Envoyer avec confirmation -> envoi reel. JAMAIS
// d'envoi automatique. Les primitives du design system sont reutilisees (Button, toasts,
// confirmation). Grise ("à venir") tant que le mail n'est pas active pour ce compte.

import { useEffect, useId, useState, useTransition } from "react";
import { Mail, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { preparerMailReunionAction, envoyerMailReunionAction } from "./mail-reunion-actions";
import type { SourceDestinataires } from "@/lib/services/coproprietes/destinataires-conseil";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SOURCE_LABEL: Record<SourceDestinataires, string> = {
  estale: "destinataires depuis eStale (conseil syndical)",
  crypto: "destinataires depuis la liste de diffusion Crypto",
  aucune: "aucune adresse trouvée - saisissez-les ci-dessous",
};

export function MailReunionBouton({
  coproCode,
  actif,
}: {
  coproCode: string;
  actif: boolean;
}) {
  const toast = useToast();
  const confirmer = useConfirm();
  const [ouvert, setOuvert] = useState(false);
  const [prep, startPrep] = useTransition();
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [source, setSource] = useState<SourceDestinataires | null>(null);
  const [a, setA] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [sujet, setSujet] = useState("");
  const [corps, setCorps] = useState("");

  function ouvrir() {
    startPrep(async () => {
      const r = await preparerMailReunionAction(coproCode);
      if (!r.ok) {
        toast.err(r.message);
        return;
      }
      setSource(r.source);
      setA(r.emails);
      setCc([]);
      setSujet(r.sujet);
      setCorps(r.corps);
      setOuvert(true);
    });
  }

  async function envoyer() {
    if (a.filter((e) => EMAIL_RE.test(e)).length === 0) {
      toast.err("Ajoutez au moins un destinataire valide en « À ».");
      return;
    }
    const mauvais = [...a, ...cc].find((e) => !EMAIL_RE.test(e));
    if (mauvais) {
      toast.err(`Adresse invalide : ${mauvais}`);
      return;
    }
    if (!(await confirmer({
      titre: "Envoyer le mail au conseil syndical ?",
      message: `${a.length} destinataire${a.length > 1 ? "s" : ""} en « À »${
        cc.length ? `, ${cc.length} en copie` : ""
      }. L'envoi est immédiat et irréversible.`,
      confirmer: "Envoyer",
    }))) {
      return;
    }
    setEnvoiEnCours(true);
    const r = await envoyerMailReunionAction(coproCode, a, cc, sujet, corps);
    setEnvoiEnCours(false);
    if (r.ok) {
      toast.ok("Mail envoyé au conseil syndical.");
      setOuvert(false);
    } else {
      toast.err(r.message);
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        disabled={!actif || prep}
        title={
          actif
            ? "Composer un mail d'information au conseil syndical (relecture avant envoi)"
            : "Envoi de mail à venir (non activé pour votre compte)"
        }
        onClick={ouvrir}
      >
        <Mail strokeWidth={1.5} />
        {prep ? "Préparation…" : "Préparer le mail au CS (dates CS/AG)"}
      </Button>

      {ouvert && (
        <ModaleComposition
          source={source}
          a={a}
          cc={cc}
          sujet={sujet}
          corps={corps}
          envoiEnCours={envoiEnCours}
          onA={setA}
          onCc={setCc}
          onSujet={setSujet}
          onCorps={setCorps}
          onFermer={() => setOuvert(false)}
          onEnvoyer={envoyer}
        />
      )}
    </>
  );
}

function ModaleComposition({
  source,
  a,
  cc,
  sujet,
  corps,
  envoiEnCours,
  onA,
  onCc,
  onSujet,
  onCorps,
  onFermer,
  onEnvoyer,
}: {
  source: SourceDestinataires | null;
  a: string[];
  cc: string[];
  sujet: string;
  corps: string;
  envoiEnCours: boolean;
  onA: (v: string[]) => void;
  onCc: (v: string[]) => void;
  onSujet: (v: string) => void;
  onCorps: (v: string) => void;
  onFermer: () => void;
  onEnvoyer: () => void;
}) {
  const titreId = useId();
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape" && !envoiEnCours) onFermer();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [envoiEnCours, onFermer]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titreId}
    >
      <div className="absolute inset-0 bg-black/30" onClick={() => !envoiEnCours && onFermer()} />
      <div className="relative w-full max-w-[560px] max-h-full overflow-y-auto rounded-lg border border-line bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 id={titreId} className="text-[14px] font-medium text-ink flex items-center gap-1.5">
            <Mail strokeWidth={1.5} className="w-4 h-4 text-ink-3" />
            Mail au conseil syndical
          </h2>
          <button
            type="button"
            onClick={onFermer}
            disabled={envoiEnCours}
            aria-label="Fermer"
            className="text-ink-4 hover:text-ink disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-3 flex flex-col gap-3">
          {source && (
            <p className="text-[11.5px] text-ink-3">
              {SOURCE_LABEL[source]}. Relisez et modifiez avant d&apos;envoyer.
            </p>
          )}

          <div className="rounded-md border border-line bg-surface px-2.5 py-2 flex flex-col gap-1">
            <LigneDest label="À" valeurs={a} onChange={onA} />
            <LigneDest label="Cc" valeurs={cc} onChange={onCc} />
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-3">Objet</span>
            <input
              value={sujet}
              onChange={(e) => onSujet(e.target.value)}
              className="h-8 rounded-md border border-line bg-surface px-2.5 text-[13px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-green-600"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-3">Message</span>
            <textarea
              value={corps}
              onChange={(e) => onCorps(e.target.value)}
              rows={11}
              className="rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] leading-relaxed text-ink outline-none resize-y focus-visible:ring-2 focus-visible:ring-green-600"
            />
          </label>
          <p className="text-[11px] text-ink-4">
            La signature est ajoutée automatiquement à l&apos;envoi.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <Button variant="ghost" size="sm" onClick={onFermer} disabled={envoiEnCours}>
            Annuler
          </Button>
          <Button variant="primary" size="sm" onClick={onEnvoyer} disabled={envoiEnCours}>
            <Send strokeWidth={1.5} />
            {envoiEnCours ? "Envoi…" : "Envoyer"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Editeur d'une ligne de destinataires : chips + ajout/retrait (calque Mes emails).
function LigneDest({
  label,
  valeurs,
  onChange,
}: {
  label: string;
  valeurs: string[];
  onChange: (v: string[]) => void;
}) {
  const [saisie, setSaisie] = useState("");
  const ajouter = () => {
    const e = saisie.trim().replace(/[,;]$/, "").trim();
    if (e && !valeurs.includes(e)) onChange([...valeurs, e]);
    setSaisie("");
  };
  return (
    <div className="flex items-start gap-2 min-h-[24px]">
      <span className="w-7 shrink-0 pt-1 text-[11px] font-medium text-ink-3">{label}</span>
      <div className="flex-1 flex flex-wrap items-center gap-1">
        {valeurs.map((e) => {
          const valide = EMAIL_RE.test(e);
          return (
            <span
              key={e}
              className={`inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-full text-[11.5px] ${
                valide ? "bg-surface-3 text-ink-2" : "bg-err-50 text-err-700"
              }`}
              title={valide ? undefined : "Adresse invalide"}
            >
              <span className="truncate max-w-[220px]">{e}</span>
              <button
                type="button"
                onClick={() => onChange(valeurs.filter((x) => x !== e))}
                aria-label={`Retirer ${e}`}
                className="text-ink-4 hover:text-err-700"
              >
                <X strokeWidth={2} className="w-3 h-3" />
              </button>
            </span>
          );
        })}
        <input
          value={saisie}
          onChange={(ev) => setSaisie(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === "Enter" || ev.key === "," || ev.key === ";") {
              ev.preventDefault();
              ajouter();
            }
          }}
          onBlur={ajouter}
          placeholder="ajouter une adresse…"
          className="flex-1 min-w-[120px] h-6 bg-transparent text-[12px] text-ink outline-none placeholder:text-ink-4"
        />
      </div>
    </div>
  );
}
