"use client";

// Section "Liste de diffusion - Conseil syndical" de la fiche copro. Rend EDITABLE la
// couche de SECOURS (Crypto/intranet) des destinataires du mail au CS.
//
// POINT CLE (non negociable) : cette liste reste le FALLBACK. eStale garde la priorite.
// Pour une copro dont eStale fournit deja les emails du conseil, editer ici NE CHANGE RIEN
// au mail -> l'indicateur de source le dit explicitement, sinon l'utilisateur edite sans
// comprendre pourquoi le mail est inchange. L'info vient de la vraie cascade (serveur).
//
// Edition : chips ajout/retrait (calque du composant du mail au CS). Une adresse mal formee
// ou interne @real31.fr est signalee et bloque l'enregistrement ; le serveur re-valide et
// deduplique de toute facon (defense en profondeur, domaine partage).

import { useState } from "react";
import { X, Save, Users, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { enregistrerListeSecoursCSAction } from "./liste-diffusion-actions";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const estInterne = (e: string) => e.trim().toLowerCase().endsWith("@real31.fr");

export function ListeDiffusionCS({
  coproCode,
  estaleFournitEmails,
  emailsSecours,
}: {
  coproCode: string;
  estaleFournitEmails: boolean;
  emailsSecours: string[];
}) {
  const toast = useToast();
  const [emails, setEmails] = useState<string[]>(emailsSecours);
  const [saisie, setSaisie] = useState("");
  const [enregistre, setEnregistre] = useState(false);

  function ajouter() {
    const e = saisie.trim().replace(/[,;]$/, "").trim();
    if (e && !emails.some((x) => x.toLowerCase() === e.toLowerCase())) {
      setEmails([...emails, e]);
    }
    setSaisie("");
  }

  const invalide = emails.find((e) => !EMAIL_RE.test(e) || estInterne(e));

  async function enregistrer() {
    if (invalide) {
      toast.err(
        estInterne(invalide)
          ? `Adresse interne exclue : ${invalide} (le mail part vers le conseil, pas les collègues).`
          : `Adresse invalide : ${invalide}`,
      );
      return;
    }
    setEnregistre(true);
    const r = await enregistrerListeSecoursCSAction(coproCode, emails);
    setEnregistre(false);
    if (r.ok) {
      setEmails(r.emails); // reflet du nettoyage serveur (dedup / exclusions)
      toast.ok("Liste de secours enregistrée.");
    } else {
      toast.err(r.message);
    }
  }

  return (
    <div className="border-t border-line px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.5px] text-ink-3 mb-2 flex items-center gap-1.5">
        <Users strokeWidth={1.5} className="w-3.5 h-3.5" />
        Liste de diffusion - Conseil syndical (secours)
      </p>

      {/* Indicateur de SOURCE ACTIVE, derive de la vraie cascade. */}
      <div
        className={`flex items-start gap-2 rounded-md border px-2.5 py-2 mb-2.5 ${
          estaleFournitEmails
            ? "border-info-500/30 bg-info-50 text-info-700"
            : "border-ok-500/30 bg-ok-50 text-ok-700"
        }`}
      >
        <Info strokeWidth={1.5} className="w-3.5 h-3.5 shrink-0 mt-px" />
        <p className="text-[11.5px] leading-relaxed">
          {estaleFournitEmails ? (
            <>
              Les destinataires du mail viennent d&apos;<b>eStale</b> pour cette copropriété - la
              liste ci-dessous ne sert que de <b>secours</b> si eStale n&apos;a plus d&apos;email de
              conseil. La modifier ne changera pas le mail tant qu&apos;eStale fournit des adresses.
            </>
          ) : (
            <>
              Cette copropriété utilise <b>cette liste de secours</b> pour le mail au conseil (aucun
              email de conseil dans eStale). Vos modifications seront <b>utilisées</b> pour le mail.
            </>
          )}
        </p>
      </div>

      {/* Chips editables. */}
      <div className="rounded-md border border-line bg-surface px-2.5 py-2">
        <div className="flex flex-wrap items-center gap-1">
          {emails.map((e) => {
            const ok = EMAIL_RE.test(e) && !estInterne(e);
            return (
              <span
                key={e}
                className={`inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-full text-[11.5px] ${
                  ok ? "bg-surface-3 text-ink-2" : "bg-err-50 text-err-700"
                }`}
                title={ok ? undefined : estInterne(e) ? "Adresse interne REAL31 (exclue)" : "Adresse invalide"}
              >
                <span className="truncate max-w-[220px]">{e}</span>
                <button
                  type="button"
                  onClick={() => setEmails(emails.filter((x) => x !== e))}
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
            aria-label="Ajouter une adresse à la liste de secours"
            className="flex-1 min-w-[140px] h-6 bg-transparent text-[12px] text-ink outline-none placeholder:text-ink-4"
          />
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-3">
        <p className="text-[11px] text-ink-4">
          {emails.length} adresse{emails.length > 1 ? "s" : ""} de secours. Les adresses internes
          @real31.fr sont exclues.
        </p>
        <Button size="sm" variant="secondary" onClick={enregistrer} disabled={enregistre}>
          <Save strokeWidth={1.5} />
          {enregistre ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </div>
  );
}
