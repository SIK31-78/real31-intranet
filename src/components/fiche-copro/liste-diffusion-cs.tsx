"use client";

// Section "Liste de diffusion - Conseil syndical" de la fiche copro.
//
// DEUX niveaux (refonte 2026-07-23, demande Sekou) :
//  - LECTURE par defaut : on AFFICHE les adresses qui recoivent REELLEMENT le mail au CS
//    (eStale en priorite, sinon la liste de secours) - fini "les infos eStale ne remontent
//    pas". Aucun controle d'edition visible : l'ecran ne pousse plus a modifier.
//  - EDITION opt-in : bouton "Modifier la liste de secours" -> chips editables de la couche
//    de SECOURS (Crypto/intranet). eStale garde la priorite : l'indicateur dit si l'edition
//    affectera le mail. Une adresse mal formee ou interne @real31.fr bloque l'enregistrement
//    (le serveur re-valide et deduplique de toute facon : defense en profondeur).

import { useState } from "react";
import { X, Save, Users, Info, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { SourceDestinataires } from "@/lib/services/coproprietes/destinataires-conseil";
import { enregistrerListeSecoursCSAction } from "./liste-diffusion-actions";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const estInterne = (e: string) => e.trim().toLowerCase().endsWith("@real31.fr");

export function ListeDiffusionCS({
  coproCode,
  sourceActive,
  estaleFournitEmails,
  emailsActifs,
  emailsSecours,
}: {
  coproCode: string;
  sourceActive: SourceDestinataires;
  estaleFournitEmails: boolean;
  emailsActifs: string[];
  emailsSecours: string[];
}) {
  const toast = useToast();
  const [edit, setEdit] = useState(false);
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
      setEdit(false);
    } else {
      toast.err(r.message);
    }
  }

  function annuler() {
    setEmails(emailsSecours);
    setSaisie("");
    setEdit(false);
  }

  return (
    <div className="border-t border-line px-4 py-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[11px] uppercase tracking-[0.5px] text-ink-3 flex items-center gap-1.5">
          <Users strokeWidth={1.5} className="w-3.5 h-3.5" />
          Liste de diffusion - Conseil syndical
        </p>
        {!edit && (
          <button
            type="button"
            onClick={() => setEdit(true)}
            className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-green-700"
          >
            <Pencil strokeWidth={1.5} className="w-3.5 h-3.5" />
            Modifier la liste de secours
          </button>
        )}
      </div>

      {!edit ? (
        // --- LECTURE : les destinataires reels du mail ------------------------------
        <div>
          <p className="text-[11.5px] text-ink-3 mb-1.5">
            {sourceActive === "estale"
              ? "Destinataires fournis par eStale (source prioritaire)."
              : sourceActive === "crypto"
                ? "Liste de secours (Crypto/intranet) - utilisée pour le mail au conseil."
                : "Aucune adresse connue pour le conseil - à saisir en secours."}
          </p>
          {emailsActifs.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1">
              {emailsActifs.map((e) => (
                <span
                  key={e}
                  className="inline-flex items-center h-6 px-2 rounded-full bg-surface-3 text-ink-2 text-[11.5px]"
                >
                  <span className="truncate max-w-[240px]">{e}</span>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-ink-4">
              Le mail au conseil n&apos;a pas encore de destinataire. Clique « Modifier la liste de
              secours » pour en saisir.
            </p>
          )}
        </div>
      ) : (
        // --- EDITION : la couche de secours (Crypto/intranet) -----------------------
        <div>
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
                autoFocus
                className="flex-1 min-w-[140px] h-6 bg-transparent text-[12px] text-ink outline-none placeholder:text-ink-4"
              />
            </div>
          </div>

          <div className="mt-2.5 flex items-center justify-between gap-3">
            <p className="text-[11px] text-ink-4">
              {emails.length} adresse{emails.length > 1 ? "s" : ""} de secours. Les adresses internes
              @real31.fr sont exclues.
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={annuler} disabled={enregistre}>
                Annuler
              </Button>
              <Button size="sm" variant="secondary" onClick={enregistrer} disabled={enregistre}>
                <Save strokeWidth={1.5} />
                {enregistre ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
