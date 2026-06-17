"use client";

// Mode CS : composer l'ordre du jour d'une AG en piochant dans la bibliotheque de
// resolutions du cabinet (motion bank eStale, ADR-024), + ajout de resolutions libres.
// Brouillon CLIENT (pas encore de persistance ni d'ecriture eStale - increment suivant).

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Plus, X, ArrowUp, ArrowDown, ArrowLeft, Check, AlertTriangle, ListChecks, Loader2, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { MajoriteBadge } from "@/components/resolutions/majorite-badge";
import type { MajoriteResolution, Resolution } from "@/lib/domain/resolution";
import { MAJORITE_LABEL, MAJORITE_ORDRE } from "@/lib/domain/resolution";
import type { AssembleeAg, MotionAg } from "@/lib/domain/assemblee";
import type { BibliothequeData } from "@/lib/services/resolutions/get-bibliotheque";
import { enregistrerProjetAction, creerAgAction } from "@/app/odj/[id]/composer/actions";

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

  const router = useRouter();
  const [enregistrement, demarrerEnregistrement] = useTransition();
  const [message, setMessage] = useState<{ ton: "ok" | "err"; texte: string } | null>(null);
  // Motions existantes (eStale) marquees pour suppression.
  const [aSupprimer, setASupprimer] = useState<Set<string>>(new Set());

  function toggleSupprimer(motionId: string) {
    setASupprimer((s) => {
      const n = new Set(s);
      if (n.has(motionId)) n.delete(motionId);
      else n.add(motionId);
      return n;
    });
  }

  // Ordre des motions de tete (null = ordre naturel d'eStale). Les enfants suivent leur groupe.
  const topLevelIds = useMemo(
    () => (assemblee?.motions ?? []).filter((m) => !m.estEnfant).map((m) => m.id),
    [assemblee],
  );
  const [ordre, setOrdre] = useState<string[] | null>(null);
  const ordreChange =
    ordre !== null &&
    (ordre.length !== topLevelIds.length || ordre.some((id, i) => id !== topLevelIds[i]));

  function deplacerTop(topId: string, delta: number) {
    setOrdre(() => {
      const base = ordre ?? topLevelIds;
      const i = base.indexOf(topId);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= base.length) return base;
      const copie = [...base];
      [copie[i], copie[j]] = [copie[j], copie[i]];
      return copie;
    });
  }

  const motionsOrdonnees = useMemo(() => {
    const motions = assemblee?.motions ?? [];
    const parId = new Map(motions.map((m) => [m.id, m]));
    const enfantsDe = grouperEnfants(motions);
    const out: MotionAg[] = [];
    for (const topId of ordre ?? topLevelIds) {
      const t = parId.get(topId);
      if (!t) continue;
      out.push(t);
      for (const e of enfantsDe.get(topId) ?? []) out.push(e);
    }
    return out;
  }, [assemblee, ordre, topLevelIds]);

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

  const etatAg: "ouverte" | "cloturee" | "absente" = !assemblee
    ? "absente"
    : assemblee.cloturee
      ? "cloturee"
      : "ouverte";

  const nbModifs = draft.length + aSupprimer.size + (ordreChange ? 1 : 0);

  function enregistrer() {
    if (!assemblee || assemblee.cloturee) return;
    setMessage(null);
    if (nbModifs === 0) {
      setMessage({ ton: "ok", texte: "AG déjà à jour - aucune modification à enregistrer." });
      return;
    }
    const meetingId = assemblee.meetingId;
    const supprimer = [...aSupprimer];
    const items = draft.map((r) => ({ id: r.id, titre: r.titre, corps: r.corps, majorite: r.majorite }));

    // Nouvel ordre : rangs hierarchiques (top "1","2".. + enfants "N.j"), hors motions retirees.
    const inputOrdre: { motionID: string; rank: string }[] = [];
    if (ordreChange) {
      const enfantsDe = grouperEnfants(assemblee.motions);
      const tops = (ordre ?? topLevelIds).filter((id) => !aSupprimer.has(id));
      tops.forEach((topId, i) => {
        inputOrdre.push({ motionID: topId, rank: String(i + 1) });
        (enfantsDe.get(topId) ?? [])
          .filter((e) => !aSupprimer.has(e.id))
          .forEach((e, j) => inputOrdre.push({ motionID: e.id, rank: `${i + 1}.${j + 1}` }));
      });
    }

    demarrerEnregistrement(async () => {
      const res = await enregistrerProjetAction(meetingId, supprimer, items, inputOrdre);
      if (res.ok) {
        setMessage({
          ton: "ok",
          texte: `AG mise à jour : ${res.ajoutees} ajout(s), ${res.supprimees} retrait(s)${ordreChange ? ", ordre appliqué" : ""}.`,
        });
        setDraft([]);
        setASupprimer(new Set());
        setOrdre(null);
        router.refresh();
      } else {
        setMessage({ ton: "err", texte: res.erreur });
      }
    });
  }

  const [creation, demarrerCreation] = useTransition();
  function creerAg() {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Créer une nouvelle AG ordinaire dans eStale pour cette copropriété ? Le socle standard sera ajouté automatiquement.",
      )
    ) {
      return;
    }
    setMessage(null);
    demarrerCreation(async () => {
      const res = await creerAgAction(copro.code);
      if (res.ok) router.refresh();
      else setMessage({ ton: "err", texte: res.erreur });
    });
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
          Retire ce que tu ne veux pas dans l&apos;AG, pioche dans la bibliothèque du cabinet (eStale)
          ou ajoute des résolutions libres, puis enregistre : l&apos;AG eStale est mise à jour pour
          correspondre exactement à ta composition.
        </p>
      </div>

      {etatAg !== "ouverte" && (
        <AlerteEtatAg etat={etatAg} onCreer={creerAg} creation={creation} />
      )}

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
          editable={etatAg === "ouverte"}
        />

        <div className="flex flex-col gap-5">
          <AssembleeExistante
            assemblee={assemblee}
            motionsAffichees={motionsOrdonnees}
            editable={etatAg === "ouverte"}
            aSupprimer={aSupprimer}
            onToggleSupprimer={toggleSupprimer}
            onDeplacerTop={deplacerTop}
          />
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
            etatAg={etatAg}
            enregistrement={enregistrement}
            onEnregistrer={enregistrer}
            message={message}
          />
        </div>
      </div>
    </div>
  );
}

// --- Colonne droite (haut) : l'AG telle qu'elle existe deja dans eStale ----

/** Regroupe les sous-resolutions par id de groupe parent (dans leur ordre). */
function grouperEnfants(motions: MotionAg[]): Map<string, MotionAg[]> {
  const m = new Map<string, MotionAg[]>();
  for (const mo of motions) {
    if (mo.estEnfant && mo.parentId) {
      const arr = m.get(mo.parentId) ?? [];
      arr.push(mo);
      m.set(mo.parentId, arr);
    }
  }
  return m;
}

/** Numerote les motions de tete (1, 2, 3...) ; les enfants n'ont pas de numero. Marque
 *  le premier / dernier de tete (pour desactiver monter / descendre). */
function numeroter(
  motions: MotionAg[],
): { m: MotionAg; numero: number; premierTop: boolean; dernierTop: boolean }[] {
  const nbTops = motions.filter((mo) => !mo.estEnfant).length;
  let n = 0;
  return motions.map((m) => {
    if (!m.estEnfant) n += 1;
    return {
      m,
      numero: n,
      premierTop: !m.estEnfant && n === 1,
      dernierTop: !m.estEnfant && n === nbTops,
    };
  });
}

function AssembleeExistante({
  assemblee,
  motionsAffichees,
  editable,
  aSupprimer,
  onToggleSupprimer,
  onDeplacerTop,
}: {
  assemblee: AssembleeAg | null;
  motionsAffichees: MotionAg[];
  editable: boolean;
  aSupprimer: Set<string>;
  onToggleSupprimer: (motionId: string) => void;
  onDeplacerTop: (topId: string, delta: number) => void;
}) {
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
        {assemblee.dateISO ? ` - ${assemblee.dateISO}` : ""}
        {assemblee.cloturee
          ? " · clôturée (non modifiable)"
          : editable
            ? " · retire, réordonne (flèches) ce que tu veux"
            : ""}
      </p>
      <Card>
        {motionsAffichees.length === 0 ? (
          <p className="px-4 py-6 text-[13px] text-ink-3 text-center">AG sans résolution.</p>
        ) : (
          <ol className="divide-y divide-line">
            {numeroter(motionsAffichees).map(({ m, numero, premierTop, dernierTop }) => {
              const marque = aSupprimer.has(m.id);
              return (
                <li
                  key={m.id}
                  className={`flex items-start gap-2 px-3 py-2 ${marque ? "opacity-50" : ""} ${m.estEnfant ? "pl-7" : ""}`}
                >
                  <span className="font-mono text-[12px] text-ink-3 w-5 text-right shrink-0 pt-0.5">
                    {m.estEnfant ? "·" : `${numero}.`}
                  </span>
                  {editable && !m.estEnfant && (
                    <span className="flex flex-col -my-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onDeplacerTop(m.id, -1)}
                        disabled={premierTop}
                        aria-label="Monter"
                        title="Monter"
                        className="h-4 inline-flex items-center text-ink-3 hover:text-ink disabled:opacity-25"
                      >
                        <ArrowUp strokeWidth={1.5} className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeplacerTop(m.id, 1)}
                        disabled={dernierTop}
                        aria-label="Descendre"
                        title="Descendre"
                        className="h-4 inline-flex items-center text-ink-3 hover:text-ink disabled:opacity-25"
                      >
                        <ArrowDown strokeWidth={1.5} className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[13px] ${m.estGroupe ? "font-semibold text-ink" : "text-ink"} ${marque ? "line-through" : ""}`}
                      >
                        {m.titre}
                      </span>
                      {m.estGroupe ? (
                        <span className="text-[10px] uppercase tracking-wide text-ink-4">groupe</span>
                      ) : (
                        <MajoriteBadge majorite={m.majorite} />
                      )}
                    </div>
                    {m.cleRepartition && !m.estGroupe && (
                      <p className="mt-0.5 text-[11px] text-ink-4">{m.cleRepartition}</p>
                    )}
                  </div>
                  {editable && (
                    <button
                      type="button"
                      onClick={() => onToggleSupprimer(m.id)}
                      aria-label={marque ? "Annuler le retrait" : "Retirer de l'ODJ"}
                      title={marque ? "Annuler le retrait" : "Retirer de l'ODJ"}
                      className="w-7 h-7 inline-flex items-center justify-center rounded-sm text-ink-3 hover:bg-surface-2 hover:text-ink shrink-0"
                    >
                      {marque ? (
                        <RotateCcw strokeWidth={1.5} className="w-3.5 h-3.5" />
                      ) : (
                        <X strokeWidth={1.5} className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </Card>
    </div>
  );
}

// --- Banniere d'etat de l'AG (cloturee / absente) -------------------------

function AlerteEtatAg({
  etat,
  onCreer,
  creation,
}: {
  etat: "cloturee" | "absente";
  onCreer: () => void;
  creation: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-warn-500/30 bg-warn-50 px-3.5 py-2.5">
      <AlertTriangle strokeWidth={1.5} className="w-4 h-4 text-warn-700 shrink-0 mt-px" />
      <div className="flex-1 min-w-0">
        <p className="text-[12.5px] text-warn-700">
          {etat === "cloturee" ? (
            <>
              <span className="font-medium">AG clôturée</span> - on ne peut plus la modifier. Pour
              préparer une nouvelle convocation (ex. comptes refusés, reconvocation), crée une
              nouvelle AG.
            </>
          ) : (
            <>
              <span className="font-medium">Aucune AG eStale</span> pour cette copropriété. Crée-en
              une avant de composer l&apos;ordre du jour.
            </>
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={onCreer}
        disabled={creation}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-warn-700 text-surface text-[12px] font-medium hover:opacity-90 transition-opacity disabled:opacity-60 shrink-0"
      >
        {creation && <Loader2 strokeWidth={2} className="w-3.5 h-3.5 animate-spin" />}
        Créer une nouvelle AG
      </button>
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
  editable,
}: {
  data: BibliothequeData;
  visibles: Resolution[];
  q: string;
  setQ: (v: string) => void;
  filtre: MajoriteResolution | "all";
  setFiltre: (v: MajoriteResolution | "all") => void;
  dejaAjoute: Set<string>;
  onAjouter: (r: Resolution) => void;
  editable: boolean;
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
                      disabled={ajoute || !editable}
                      className={`inline-flex items-center gap-1 h-7 px-2 rounded-sm text-[12px] font-medium shrink-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
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
  etatAg,
  enregistrement,
  onEnregistrer,
  message,
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
  etatAg: "ouverte" | "cloturee" | "absente";
  enregistrement: boolean;
  onEnregistrer: () => void;
  message: { ton: "ok" | "err"; texte: string } | null;
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
          disabled={etatAg !== "ouverte"}
          className="inline-flex items-center justify-center gap-1.5 h-9 rounded-md border border-dashed border-line-2 text-[13px] text-ink-2 hover:border-green-700 hover:text-green-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-line-2 disabled:hover:text-ink-2"
        >
          <Plus strokeWidth={1.5} className="w-4 h-4" /> Ajouter une résolution libre
        </button>
      )}

      <button
        type="button"
        onClick={onEnregistrer}
        disabled={etatAg !== "ouverte" || enregistrement}
        title={
          etatAg === "ouverte"
            ? "Ajoute les résolutions composées dans l'AG eStale"
            : etatAg === "cloturee"
              ? "AG clôturée : non modifiable"
              : "Aucune AG eStale (création à venir, palier 3)"
        }
        className="h-9 inline-flex items-center justify-center gap-1.5 rounded-md bg-green-700 text-surface text-[13px] font-medium hover:bg-green-600 transition-colors disabled:bg-surface-2 disabled:text-ink-3 disabled:cursor-not-allowed"
      >
        {enregistrement && <Loader2 strokeWidth={2} className="w-4 h-4 animate-spin" />}
        {etatAg === "ouverte"
          ? "Enregistrer dans l'AG eStale"
          : etatAg === "cloturee"
            ? "AG clôturée (non modifiable)"
            : "Créer l'AG d'abord (à venir)"}
      </button>

      {message && (
        <p className={`text-[12px] ${message.ton === "ok" ? "text-ok-700" : "text-err-700"}`}>
          {message.texte}
        </p>
      )}
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
