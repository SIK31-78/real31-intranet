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
import { X, Save, Users, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardBody } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Callout } from "@/components/ui/callout";
import { useToast } from "@/components/ui/toast";
import type { SourceDestinataires } from "@/lib/services/coproprietes/destinataires-conseil";
import { enregistrerListeSecoursCSAction } from "./liste-diffusion-actions";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const estInterne = (e: string) => e.trim().toLowerCase().endsWith("@real31.fr");

const SOURCE_LABEL: Record<SourceDestinataires, string> = {
  estale: "Destinataires fournis par ESTALE (source prioritaire)",
  crypto: "Liste de secours (Crypto/intranet), utilisée pour le mail au conseil",
  aucune: "Aucune adresse connue pour le conseil",
};

export function ListeDiffusionCS({
  coproCode,
  sourceActive,
  estaleFournitEmails,
  destinatairesActifs,
  emailsSecours,
}: {
  coproCode: string;
  sourceActive: SourceDestinataires;
  estaleFournitEmails: boolean;
  destinatairesActifs: { email: string; nom?: string }[];
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
    <CardBody padding="sm" className="border-t border-line flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Eyebrow className="flex items-center gap-1.5">
          <Users strokeWidth={1.5} className="w-3.5 h-3.5" aria-hidden />
          Liste de diffusion · Conseil syndical
        </Eyebrow>
        {!edit && (
          <Button variant="ghost" size="sm" onClick={() => setEdit(true)}>
            <Pencil strokeWidth={1.5} />
            Modifier la liste de secours
          </Button>
        )}
      </div>

      {!edit ? (
        // --- REPLIE : une ligne, pas sept adresses ---------------------------------
        // Sekou, 2026-09-11 : "la liste de diffusion ne doit apparaitre que si on souhaite
        // la modifier". La fiche etait mangee par une grappe de chips qu'on ne lit jamais.
        // On garde ce qui repond a la question posee en passant - COMBIEN de personnes
        // recoivent le mail, et D'OU viennent les adresses - et le detail s'ouvre au clic.
        <p className="text-body text-ink-2">
          {destinatairesActifs.length > 0 ? (
            <>
              <span className="text-ink font-medium tabular-nums">{destinatairesActifs.length}</span>{" "}
              destinataire{destinatairesActifs.length > 1 ? "s" : ""} · {SOURCE_LABEL[sourceActive]}
            </>
          ) : (
            "Aucun destinataire : à saisir dans la liste de secours."
          )}
        </p>
      ) : (
        // --- EDITION : la couche de secours (Crypto/intranet) -----------------------
        <div className="flex flex-col gap-2.5">
          {/* Indicateur de SOURCE ACTIVE, derive de la vraie cascade. */}
          <Callout ton={estaleFournitEmails ? "info" : "ok"}>
            {estaleFournitEmails
              ? "ESTALE fournit les destinataires : cette liste ne sert qu'en secours, la modifier ne change pas le mail."
              : "Aucun email de conseil dans ESTALE : cette liste de secours est utilisée pour le mail."}
          </Callout>

          {/* Quand ESTALE fournit les destinataires, ils ne sont PAS ceux qu'on edite en
              dessous. On les montre donc ici, une fois le panneau ouvert : c'est le seul
              endroit ou "qui recoit vraiment le mail" reste lisible depuis que la lecture
              est repliee. NOM du membre quand on le connait, adresse en second (Sekou :
              "je ne sais pas qui est testcs2@real31.fr"). */}
          {estaleFournitEmails && destinatairesActifs.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Eyebrow>Destinataires réels du mail</Eyebrow>
              <div className="flex flex-wrap items-center gap-1">
                {destinatairesActifs.map((d) => (
                  <span
                    key={d.email}
                    title={d.email}
                    className="inline-flex items-center gap-1.5 h-6 px-2 rounded-sm bg-surface-2 border border-line text-meta"
                  >
                    {d.nom && <span className="font-medium text-ink">{d.nom}</span>}
                    <span className="truncate max-w-60 text-ink-2">{d.email}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Chips editables. */}
          <div className="border border-line bg-surface rounded-md px-2.5 py-2">
            <div className="flex flex-wrap items-center gap-1">
              {emails.map((e) => {
                const ok = EMAIL_RE.test(e) && !estInterne(e);
                return (
                  <span
                    key={e}
                    className={`inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-sm border text-meta ${
                      ok ? "bg-surface-2 border-line text-ink-2" : "bg-err-50 border-err-500/30 text-err-700"
                    }`}
                    title={ok ? undefined : estInterne(e) ? "Adresse interne REAL31 (exclue)" : "Adresse invalide"}
                  >
                    <span className="truncate max-w-56">{e}</span>
                    <button
                      type="button"
                      onClick={() => setEmails(emails.filter((x) => x !== e))}
                      aria-label={`Retirer ${e}`}
                      className="text-ink-3 hover:text-err-700 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
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
                className="flex-1 min-w-36 h-6 bg-transparent text-body text-ink outline-none placeholder:text-ink-3"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-meta text-ink-2 tabular-nums">
              {emails.length} adresse{emails.length > 1 ? "s" : ""} de secours · les adresses @real31.fr sont exclues
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={annuler} disabled={enregistre}>
                Annuler
              </Button>
              <Button size="sm" variant="secondary" onClick={enregistrer} loading={enregistre}>
                <Save strokeWidth={1.5} />
                Enregistrer
              </Button>
            </div>
          </div>
        </div>
      )}
    </CardBody>
  );
}
