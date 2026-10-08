"use client";

// Ecran du tri des e-mails V2 (ADR-046) : la file a gauche, le mail et son rattachement
// a droite. Increment 1 = lecture seule : on voit la suggestion ESTALE et ou le mail
// partirait, le bouton d'attribution arrive a l'increment 2.

import { useMemo, useState } from "react";
import { ExternalLink, Paperclip } from "lucide-react";
import type { CoproDeLaFile, FileATrier, MailDeLaFile } from "@/lib/services/tri-emails/lire-file";
import type { NatureSuggestion } from "@/lib/domain/tri-emails";
import { Badge, type BadgeTon } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";

const TON: Record<NatureSuggestion, BadgeTon> = {
  sure: "ok",
  faible: "info",
  plusieurs: "warn",
  "hors-estale": "err",
  aucune: "neutral",
};

const TITRE: Record<NatureSuggestion, string> = {
  sure: "Suggestion",
  faible: "Suggestion à confirmer",
  plusieurs: "À départager",
  "hors-estale": "Hors ESTALE",
  aucune: "Pas de suggestion",
};

function pastille(m: MailDeLaFile): string {
  const s = m.suggestion;
  if (s.nature === "sure" || s.nature === "faible") return s.candidats[0]!;
  if (s.nature === "plusieurs") return `${s.candidats.length} copros possibles`;
  if (s.nature === "hors-estale") return "Hors ESTALE";
  return "Aucune piste";
}

const heure = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

const normaliser = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function TriEmailsVue({ file }: { file: FileATrier }) {
  const [courantId, setCourantId] = useState<string | null>(file.mails[0]?.id ?? null);
  const [filtre, setFiltre] = useState("");
  // Choix de copro par mail (id -> reference). Non persiste a l'increment 1.
  const [choix, setChoix] = useState<Record<string, string>>({});

  const parRef = useMemo(() => new Map(file.copros.map((c) => [c.reference, c])), [file.copros]);

  const visibles = useMemo(() => {
    const q = normaliser(filtre.trim());
    if (!q) return file.mails;
    return file.mails.filter((m) =>
      normaliser(`${m.deNom} ${m.deAdresse} ${m.objet} ${m.suggestion.candidats.join(" ")}`).includes(q),
    );
  }, [file.mails, filtre]);

  const courant = file.mails.find((m) => m.id === courantId) ?? null;

  if (file.mails.length === 0) {
    return <EmptyState>La boîte de réception générique est vide : tout est trié.</EmptyState>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(260px,360px)_1fr] items-start">
      <div className="rounded-xl border border-line bg-surface overflow-hidden">
        <div className="p-3 border-b border-line">
          <label htmlFor="tri-filtre" className="sr-only">
            Filtrer la file
          </label>
          <input
            id="tri-filtre"
            type="search"
            value={filtre}
            onChange={(e) => setFiltre(e.target.value)}
            placeholder="Filtrer : expéditeur, objet, code copro"
            className="w-full rounded-lg border border-line bg-canvas px-3 py-1.5 text-body focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
          />
        </div>
        <ul className="max-h-[70vh] overflow-y-auto">
          {visibles.map((m) => (
            <li key={m.id} className="border-b border-line last:border-b-0">
              <button
                type="button"
                onClick={() => setCourantId(m.id)}
                aria-current={m.id === courantId}
                className={cn(
                  "w-full text-left px-4 py-2.5 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 hover:bg-surface-2",
                  m.id === courantId && "bg-green-50 hover:bg-green-50",
                )}
              >
                <span className="font-medium text-ink truncate">{m.deNom}</span>
                <span className="font-mono text-meta text-ink-3 tabular-nums">{heure(m.recuLe)}</span>
                <span className="col-span-2 text-ink-2 truncate">{m.objet}</span>
                <span className="col-span-2 mt-1">
                  <Badge ton={TON[m.suggestion.nature]}>{pastille(m)}</Badge>
                </span>
              </button>
            </li>
          ))}
          {visibles.length === 0 && <li className="p-6 text-center text-ink-3">Aucun mail ne correspond au filtre.</li>}
        </ul>
      </div>

      {courant ? (
        <DetailMail
          key={courant.id}
          mail={courant}
          copros={file.copros}
          parRef={parRef}
          choisie={choix[courant.id] ?? (courant.suggestion.candidats.length === 1 ? courant.suggestion.candidats[0]! : null)}
          choisir={(ref) => setChoix((c) => ({ ...c, [courant.id]: ref }))}
        />
      ) : (
        <EmptyState>Sélectionnez un mail dans la file.</EmptyState>
      )}
    </div>
  );
}

function DetailMail({
  mail,
  copros,
  parRef,
  choisie,
  choisir,
}: {
  mail: MailDeLaFile;
  copros: CoproDeLaFile[];
  parRef: Map<string, CoproDeLaFile>;
  choisie: string | null;
  choisir: (ref: string) => void;
}) {
  const [recherche, setRecherche] = useState("");
  const s = mail.suggestion;
  const copro = choisie ? parRef.get(choisie) ?? null : null;
  const dest = copro?.destination ?? null;

  const resultats = useMemo(() => {
    const q = normaliser(recherche.trim());
    if (!q) return [];
    return copros.filter((c) => normaliser(`${c.reference} ${c.nom} ${c.adresse}`).includes(q)).slice(0, 8);
  }, [copros, recherche]);

  return (
    <div className="flex flex-col gap-4 min-w-0">
      <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-title font-medium text-ink text-balance">{mail.objet}</h2>
            <p className="text-meta text-ink-2 mt-0.5">
              {mail.deNom} · <span className="font-mono">{mail.deAdresse}</span> · {heure(mail.recuLe)}
            </p>
          </div>
          {mail.lienOutlook && (
            <a
              href={mail.lienOutlook}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line-2 px-3 py-1.5 text-body font-medium hover:bg-surface-2"
            >
              Ouvrir dans Outlook
              <ExternalLink strokeWidth={1.5} className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
          )}
        </div>
        <p className="mt-3 pt-3 border-t border-line whitespace-pre-line text-ink-2 max-w-[68ch]">{mail.apercu}</p>
        {mail.aPiecesJointes && (
          <p className="mt-3 inline-flex items-center gap-1.5 text-meta text-ink-3">
            <Paperclip strokeWidth={1.5} className="w-3.5 h-3.5" aria-hidden="true" />
            Pièces jointes : à ouvrir dans Outlook
          </p>
        )}
      </section>

      <section className="rounded-xl border border-line bg-surface p-4 sm:p-5 flex flex-col gap-3">
        <h3 className="text-meta uppercase tracking-wider text-ink-3 font-medium">Rattacher à une copropriété</h3>

        <div
          className={cn(
            "rounded-lg border px-3 py-2.5 flex flex-col gap-2",
            s.nature === "sure" ? "border-green-200 bg-green-50" : s.nature === "aucune" ? "border-line bg-surface-2" : "border-transparent bg-warn-50",
          )}
        >
          <strong className="font-medium text-ink">{TITRE[s.nature]}</strong>
          <span className="text-meta text-ink-2">{s.raison}</span>
          {s.candidats.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {s.candidats.map((ref) => (
                <button
                  key={ref}
                  type="button"
                  onClick={() => choisir(ref)}
                  aria-pressed={choisie === ref}
                  className={cn(
                    "rounded-lg border border-line-2 bg-surface px-2.5 py-1 text-left text-body hover:bg-surface-2",
                    choisie === ref && "border-green-600 ring-1 ring-green-600",
                  )}
                >
                  <span className="font-mono text-meta text-green-700 font-medium">{ref}</span> {parRef.get(ref)?.nom}
                </button>
              ))}
            </div>
          )}
        </div>

        {s.nature !== "hors-estale" && (
          <div>
            <label htmlFor="tri-recherche" className="sr-only">
              Chercher une copropriété ESTALE
            </label>
            <input
              id="tri-recherche"
              type="search"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Chercher une copropriété ESTALE : code, nom, adresse"
              autoComplete="off"
              className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-body focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
            />
            {resultats.length > 0 && (
              <ul className="mt-1.5 rounded-lg border border-line divide-y divide-line max-h-56 overflow-y-auto">
                {resultats.map((c) => (
                  <li key={c.reference}>
                    <button
                      type="button"
                      onClick={() => {
                        choisir(c.reference);
                        setRecherche("");
                      }}
                      className="w-full flex gap-3 px-3 py-1.5 text-left hover:bg-surface-2"
                    >
                      <span className="font-mono text-meta text-green-700 min-w-[52px]">{c.reference}</span>
                      <span className="text-ink">{c.nom}</span>
                      <span className="ml-auto text-meta text-ink-3 truncate">{c.adresse}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {copro && (
          <div className="grid gap-2.5 sm:grid-cols-3 mt-1">
            <Case titre="Gestionnaire ESTALE">
              {dest ? (
                <>
                  <span className="font-medium text-ink">{dest.gestionnaire.nomComplet}</span>
                  <span className="text-meta text-ink-2">
                    {dest.assistant ? `Assistant : ${dest.assistant.nomComplet}` : "Pas d'assistant dans ESTALE"}
                  </span>
                </>
              ) : (
                <span className="text-ink-2">Pas de gestionnaire au mandat dans ESTALE</span>
              )}
            </Case>
            <Case titre="Rangé dans">
              {dest?.dossier ? (
                <span className="font-mono text-body text-ink">{dest.dossier}</span>
              ) : (
                <span className="text-ink-2">Initiales du gestionnaire inconnues dans l&apos;intranet</span>
              )}
            </Case>
            <Case titre="Étiquette Outlook">
              <span className="font-mono text-meta w-fit rounded bg-info-50 text-info-700 px-2 py-0.5 font-medium">
                {copro.reference}
              </span>
            </Case>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 mt-1">
          <Button variant="primary" disabled>
            {dest?.initiales ? `Attribuer à ${dest.initiales}` : "Attribuer"}
          </Button>
          <span className="text-meta text-ink-3">Lecture seule pour l&apos;instant : l&apos;attribution arrive à l&apos;étape suivante.</span>
        </div>
      </section>
    </div>
  );
}

function Case({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-canvas px-3 py-2.5 flex flex-col gap-0.5">
      <span className="text-meta uppercase tracking-wider text-ink-3">{titre}</span>
      {children}
    </div>
  );
}
