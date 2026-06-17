"use client";

// Mode CS : composer l'ordre du jour d'une AG en piochant dans la bibliotheque de
// resolutions du cabinet (motion bank eStale, ADR-024), + ajout de resolutions libres.
// Brouillon CLIENT (pas encore de persistance ni d'ecriture eStale - increment suivant).

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search, Plus, X, ArrowUp, ArrowDown, ArrowLeft, Check, AlertTriangle, ListChecks } from "lucide-react";
import { Card } from "@/components/ui/card";
import { MajoriteBadge } from "@/components/resolutions/majorite-badge";
import type { MajoriteResolution, Resolution } from "@/lib/domain/resolution";
import { MAJORITE_LABEL, MAJORITE_ORDRE } from "@/lib/domain/resolution";
import type { AssembleeAg } from "@/lib/domain/assemblee";
import type { BibliothequeData } from "@/lib/services/resolutions/get-bibliotheque";

export function ComposerOdj({
  copro,
  dateAg,
  data,
  assemblee,
}: {
  copro: { code: string; nom: string };
  dateAg?: string;
  data: BibliothequeData;
  assemblee: AssembleeAg | null;
}) {
  const [draft, setDraft] = useState<Resolution[]>([]);
  const [q, setQ] = useState("");
  const [filtre, setFiltre] = useState<MajoriteResolution | "all">("all");
  const compteurLibre = useRef(0);

  const [formOuvert, setFormOuvert] = useState(false);
  const [libreTitre, setLibreTitre] = useState("");
  const [libreMajorite, setLibreMajorite] = useState<MajoriteResolution>("A25");
  const [libreCorps, setLibreCorps] = useState("");

  const dejaAjoute = useMemo(() => new Set(draft.map((r) => r.id)), [draft]);

  const visibles = useMemo(() => {
    const terme = q.trim().toLowerCase();
    return data.resolutions.filter((r) => {
      if (filtre !== "all" && r.majorite !== filtre) return false;
      if (!terme) return true;
      return (
        r.titre.toLowerCase().includes(terme) ||
        r.corps.toLowerCase().includes(terme) ||
        r.motsCles.some((m) => m.toLowerCase().includes(terme))
      );
    });
  }, [data.resolutions, q, filtre]);

  function ajouter(r: Resolution) {
    if (dejaAjoute.has(r.id)) return;
    setDraft((d) => [...d, r]);
  }
  function retirer(id: string) {
    setDraft((d) => d.filter((r) => r.id !== id));
  }
  function deplacer(i: number, delta: number) {
    setDraft((d) => {
      const j = i + delta;
      if (j < 0 || j >= d.length) return d;
      const copie = [...d];
      [copie[i], copie[j]] = [copie[j], copie[i]];
      return copie;
    });
  }
  function ajouterLibre() {
    const titre = libreTitre.trim();
    if (!titre) return;
    compteurLibre.current += 1;
    setDraft((d) => [
      ...d,
      {
        id: `libre-${compteurLibre.current}`,
        titre,
        corps: libreCorps.trim(),
        majorite: libreMajorite,
        motsCles: [],
        parDefaut: false,
      },
    ]);
    setLibreTitre("");
    setLibreCorps("");
    setFormOuvert(false);
  }

  const retour = `/odj/${dateAg ? `${copro.code}__${dateAg}` : copro.code}`;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={retour} className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-green-700">
          <ArrowLeft strokeWidth={1.5} className="w-3.5 h-3.5" /> Retour à l&apos;ODJ
        </Link>
        <h1 className="mt-1 text-[20px] font-semibold text-ink">Mode CS - composer l&apos;ordre du jour</h1>
        <p className="mt-0.5 text-[13px] text-ink-2">
          {copro.nom} ({copro.code}){dateAg ? ` - AG du ${dateAg}` : " - date d'AG non définie"}
        </p>
        <p className="mt-1 text-[12px] text-ink-4">
          Pioche les résolutions dans la bibliothèque du cabinet (eStale) pour bâtir l&apos;ordre du
          jour ; ajoute des résolutions libres au besoin. Brouillon non encore enregistré - la
          sauvegarde et l&apos;envoi vers eStale arrivent à l&apos;étape suivante.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <BibliothequePicker
          data={data}
          visibles={visibles}
          q={q}
          setQ={setQ}
          filtre={filtre}
          setFiltre={setFiltre}
          dejaAjoute={dejaAjoute}
          onAjouter={ajouter}
        />

        <div className="flex flex-col gap-5">
          <AssembleeExistante assemblee={assemblee} />
          <OdjEnConstruction
            draft={draft}
            onRetirer={retirer}
            onDeplacer={deplacer}
            formOuvert={formOuvert}
            setFormOuvert={setFormOuvert}
            libreTitre={libreTitre}
            setLibreTitre={setLibreTitre}
            libreMajorite={libreMajorite}
            setLibreMajorite={setLibreMajorite}
            libreCorps={libreCorps}
            setLibreCorps={setLibreCorps}
            onAjouterLibre={ajouterLibre}
          />
        </div>
      </div>
    </div>
  );
}

// --- Colonne droite (haut) : l'AG telle qu'elle existe deja dans eStale ----

function AssembleeExistante({ assemblee }: { assemblee: AssembleeAg | null }) {
  if (!assemblee) {
    return (
      <Card>
        <div className="px-4 py-4 flex items-start gap-2.5">
          <AlertTriangle strokeWidth={1.5} className="w-4 h-4 text-ink-3 shrink-0 mt-px" />
          <p className="text-[12.5px] text-ink-3">
            Aucune AG ordinaire trouvée pour cette copro dans eStale. Elle sera créée à
            l&apos;enregistrement (le socle standard s&apos;ajoutera automatiquement).
          </p>
        </div>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-2.5">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-ink-3 flex items-center gap-1.5">
        <ListChecks strokeWidth={1.5} className="w-3.5 h-3.5" />
        Déjà dans l&apos;AG eStale ({assemblee.motions.length})
      </h2>
      <p className="text-[11.5px] text-ink-4 -mt-1">
        {assemblee.nom}
        {assemblee.dateISO ? ` - ${assemblee.dateISO}` : ""} · lecture seule (l&apos;édition arrive
        au palier suivant)
      </p>
      <Card>
        {assemblee.motions.length === 0 ? (
          <p className="px-4 py-6 text-[13px] text-ink-3 text-center">AG sans résolution.</p>
        ) : (
          <ol className="divide-y divide-line">
            {assemblee.motions.map((m, i) => (
              <li key={m.id} className="flex items-start gap-2.5 px-3 py-2">
                <span className="font-mono text-[12px] text-ink-3 w-5 text-right shrink-0 pt-0.5">{i + 1}.</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] text-ink">{m.titre}</span>
                    <MajoriteBadge majorite={m.majorite} />
                  </div>
                  {m.cleRepartition && (
                    <p className="mt-0.5 text-[11px] text-ink-4">{m.cleRepartition}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}

// --- Colonne gauche : la bibliotheque (picker) ----------------------------

function BibliothequePicker({
  data,
  visibles,
  q,
  setQ,
  filtre,
  setFiltre,
  dejaAjoute,
  onAjouter,
}: {
  data: BibliothequeData;
  visibles: Resolution[];
  q: string;
  setQ: (v: string) => void;
  filtre: MajoriteResolution | "all";
  setFiltre: (v: MajoriteResolution | "all") => void;
  dejaAjoute: Set<string>;
  onAjouter: (r: Resolution) => void;
}) {
  const parMajorite = useMemo(() => {
    const m = new Map<MajoriteResolution, number>();
    for (const r of data.resolutions) m.set(r.majorite, (m.get(r.majorite) ?? 0) + 1);
    return m;
  }, [data.resolutions]);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-ink-3">
        Bibliothèque ({data.resolutions.length})
      </h2>

      {data.indisponible ? (
        <Card>
          <div className="flex items-start gap-2.5 px-4 py-6">
            <AlertTriangle strokeWidth={1.5} className="w-4 h-4 text-warn-700 shrink-0 mt-px" />
            <p className="text-[13px] text-warn-700">
              Bibliothèque eStale temporairement indisponible. Rechargez la page dans un instant.
            </p>
          </div>
        </Card>
      ) : (
        <>
          <div className="relative">
            <Search strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher..."
              className="w-full h-9 pl-9 pr-3 rounded-md border border-line bg-surface text-[13px] text-ink placeholder:text-ink-3 focus:outline-none focus:border-green-700"
            />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Filtrer par majorité">
            <Chip actif={filtre === "all"} onClick={() => setFiltre("all")}>
              Tout
            </Chip>
            {MAJORITE_ORDRE.filter((m) => parMajorite.has(m)).map((m) => (
              <Chip key={m} actif={filtre === m} onClick={() => setFiltre(m)}>
                {MAJORITE_LABEL[m]}
              </Chip>
            ))}
          </div>

          <div className="flex flex-col gap-2 max-h-[60vh] overflow-auto pr-1">
            {visibles.map((r) => {
              const ajoute = dejaAjoute.has(r.id);
              return (
                <Card key={r.id}>
                  <div className="px-3 py-2.5 flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-ink">{r.titre}</span>
                        <MajoriteBadge majorite={r.majorite} />
                      </div>
                      {r.corps && <p className="mt-1 text-[12px] text-ink-3 line-clamp-2">{r.corps}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => onAjouter(r)}
                      disabled={ajoute}
                      className={`inline-flex items-center gap-1 h-7 px-2 rounded-sm text-[12px] font-medium shrink-0 transition-colors ${
                        ajoute
                          ? "text-ok-700 cursor-default"
                          : "bg-green-700 text-surface hover:bg-green-600"
                      }`}
                    >
                      {ajoute ? (
                        <>
                          <Check strokeWidth={2} className="w-3.5 h-3.5" /> Ajouté
                        </>
                      ) : (
                        <>
                          <Plus strokeWidth={2} className="w-3.5 h-3.5" /> Ajouter
                        </>
                      )}
                    </button>
                  </div>
                </Card>
              );
            })}
            {visibles.length === 0 && (
              <p className="text-[13px] text-ink-3 px-1 py-6 text-center">Aucun résultat.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// --- Colonne droite : l'ODJ en construction -------------------------------

function OdjEnConstruction({
  draft,
  onRetirer,
  onDeplacer,
  formOuvert,
  setFormOuvert,
  libreTitre,
  setLibreTitre,
  libreMajorite,
  setLibreMajorite,
  libreCorps,
  setLibreCorps,
  onAjouterLibre,
}: {
  draft: Resolution[];
  onRetirer: (id: string) => void;
  onDeplacer: (i: number, delta: number) => void;
  formOuvert: boolean;
  setFormOuvert: (v: boolean) => void;
  libreTitre: string;
  setLibreTitre: (v: string) => void;
  libreMajorite: MajoriteResolution;
  setLibreMajorite: (v: MajoriteResolution) => void;
  libreCorps: string;
  setLibreCorps: (v: string) => void;
  onAjouterLibre: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-ink-3">
        À ajouter ({draft.length} résolution{draft.length > 1 ? "s" : ""})
      </h2>

      <Card>
        {draft.length === 0 ? (
          <p className="px-4 py-8 text-[13px] text-ink-3 text-center">
            Aucune résolution. Ajoute-en depuis la bibliothèque, ou crée une résolution libre.
          </p>
        ) : (
          <ol className="divide-y divide-line">
            {draft.map((r, i) => (
              <li key={r.id} className="flex items-start gap-2.5 px-3 py-2.5">
                <span className="font-mono text-[12px] text-ink-3 w-5 text-right shrink-0 pt-0.5">{i + 1}.</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-ink">{r.titre}</span>
                    <MajoriteBadge majorite={r.majorite} />
                    {r.id.startsWith("libre-") && (
                      <span className="text-[10px] text-ink-4 uppercase tracking-wide">libre</span>
                    )}
                  </div>
                  {r.corps && <p className="mt-1 text-[12px] text-ink-3 line-clamp-2">{r.corps}</p>}
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <IconBtn label="Monter" onClick={() => onDeplacer(i, -1)} disabled={i === 0}>
                    <ArrowUp strokeWidth={1.5} className="w-3.5 h-3.5" />
                  </IconBtn>
                  <IconBtn label="Descendre" onClick={() => onDeplacer(i, 1)} disabled={i === draft.length - 1}>
                    <ArrowDown strokeWidth={1.5} className="w-3.5 h-3.5" />
                  </IconBtn>
                  <IconBtn label="Retirer" onClick={() => onRetirer(r.id)}>
                    <X strokeWidth={1.5} className="w-3.5 h-3.5" />
                  </IconBtn>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {formOuvert ? (
        <Card>
          <div className="px-3 py-3 flex flex-col gap-2.5">
            <input
              value={libreTitre}
              onChange={(e) => setLibreTitre(e.target.value)}
              placeholder="Intitulé de la résolution"
              className="w-full h-9 px-3 rounded-md border border-line bg-surface text-[13px] focus:outline-none focus:border-green-700"
            />
            <div className="flex items-center gap-2">
              <label className="text-[12px] text-ink-3">Majorité</label>
              <select
                value={libreMajorite}
                onChange={(e) => setLibreMajorite(e.target.value as MajoriteResolution)}
                className="h-8 px-2 rounded-md border border-line bg-surface text-[12px] focus:outline-none focus:border-green-700"
              >
                {MAJORITE_ORDRE.map((m) => (
                  <option key={m} value={m}>
                    {MAJORITE_LABEL[m]}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              value={libreCorps}
              onChange={(e) => setLibreCorps(e.target.value)}
              placeholder="Texte de la résolution (optionnel)"
              rows={3}
              className="w-full px-3 py-2 rounded-md border border-line bg-surface text-[13px] focus:outline-none focus:border-green-700 resize-y"
            />
            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={() => setFormOuvert(false)}
                className="h-8 px-3 rounded-md text-[12px] text-ink-2 hover:bg-surface-2"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={onAjouterLibre}
                disabled={!libreTitre.trim()}
                className="h-8 px-3 rounded-md bg-green-700 text-surface text-[12px] font-medium hover:bg-green-600 disabled:opacity-50"
              >
                Ajouter à l&apos;ODJ
              </button>
            </div>
          </div>
        </Card>
      ) : (
        <button
          type="button"
          onClick={() => setFormOuvert(true)}
          className="inline-flex items-center justify-center gap-1.5 h-9 rounded-md border border-dashed border-line-2 text-[13px] text-ink-2 hover:border-green-700 hover:text-green-700 transition-colors"
        >
          <Plus strokeWidth={1.5} className="w-4 h-4" /> Ajouter une résolution libre
        </button>
      )}

      <button
        type="button"
        disabled
        title="Bientôt : enregistrer le projet et l'envoyer vers eStale"
        className="h-9 rounded-md bg-surface-2 text-ink-3 text-[13px] font-medium cursor-not-allowed"
      >
        Enregistrer le projet (à venir)
      </button>
    </div>
  );
}

// --- Petits UI -------------------------------------------------------------

function Chip({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={`h-7 px-2.5 rounded-full text-[12px] font-medium border transition-colors ${
        actif ? "bg-green-700 text-surface border-green-700" : "bg-surface text-ink-2 border-line hover:border-line-2"
      }`}
    >
      {children}
    </button>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="w-7 h-7 inline-flex items-center justify-center rounded-sm text-ink-3 hover:bg-surface-2 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
