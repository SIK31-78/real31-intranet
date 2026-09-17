"use client";

// Mode CS : composer l'ordre du jour d'une AG en piochant dans la bibliotheque de
// resolutions du cabinet (motion bank Estale, ADR-024), + ajout de resolutions libres.
// L'enregistrement ecrit REELLEMENT dans l'AG Estale (ajouts/retraits/ordre, additif).

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Plus, X, ArrowUp, ArrowDown, ArrowLeft, Check, AlertTriangle, ListChecks, Loader2, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { MajoriteBadge } from "@/components/resolutions/majorite-badge";
import type { MajoriteResolution, Resolution } from "@/lib/domain/resolution";
import { MAJORITE_LABEL, MAJORITE_ORDRE, numeroterResolutions, rangParent } from "@/lib/domain/resolution";
import { jourCanonique } from "@/lib/format-date";
import type { AssembleeAg, MotionAg } from "@/lib/domain/assemblee";
import type { BibliothequeData } from "@/lib/services/resolutions/get-bibliotheque";
import { enregistrerProjetAction, creerAgAction } from "@/app/odj/[id]/composer/actions";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page";

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
  const confirmer = useConfirm();
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
  // Motions existantes (Estale) marquees pour suppression.
  const [aSupprimer, setASupprimer] = useState<Set<string>>(new Set());

  function toggleSupprimer(motionId: string) {
    setASupprimer((s) => {
      const n = new Set(s);
      if (n.has(motionId)) n.delete(motionId);
      else n.add(motionId);
      return n;
    });
  }

  // Ordre des motions de tete (null = ordre naturel d'Estale). Les enfants suivent leur groupe.
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

  // Resolutions de la bibliotheque DEJA presentes dans l'AG Estale (match par titre
  // normalise, hors motions marquees pour retrait). Le picker ne voyait jusqu'ici que le
  // brouillon : on evite d'ajouter un doublon d'une resolution deja dans l'AG.
  const dejaDansAg = useMemo(() => {
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
    const titresAg = new Set(
      (assemblee?.motions ?? []).filter((m) => !aSupprimer.has(m.id)).map((m) => norm(m.titre)),
    );
    return new Set(data.resolutions.filter((r) => titresAg.has(norm(r.titre))).map((r) => r.id));
  }, [assemblee, aSupprimer, data.resolutions]);

  // L'AG Estale ciblee porte-t-elle une date differente de celle visee par l'intranet ?
  // (Ex. date d'AG intranet posee, mais le Meeting Estale a une autre date.) On avertit :
  // l'ODJ compose s'applique a CETTE AG Estale, pas a la date intranet.
  const datesDivergent = useMemo(() => {
    const iso = assemblee?.dateISO;
    if (!dateAg || !iso) return false;
    return jourCanonique(dateAg) !== jourCanonique(iso);
  }, [dateAg, assemblee]);

  // Picker conscient des groupes : on liste les resolutions de TETE (les sous-resolutions
  // s'affichent sous leur groupe). Un groupe matche s'il matche lui-meme ou un de ses enfants.
  const visibles = useMemo(() => {
    const terme = q.trim().toLowerCase();
    const match = (r: Resolution) =>
      r.titre.toLowerCase().includes(terme) ||
      r.corps.toLowerCase().includes(terme) ||
      r.motsCles.some((m) => m.toLowerCase().includes(terme));
    return data.resolutions.filter((r) => {
      if (rangParent(r.rank) !== null) return false; // les enfants sont montres sous leur groupe
      if (filtre !== "all" && r.majorite !== filtre) return false;
      if (!terme) return true;
      const enfants = data.resolutions.filter((c) => rangParent(c.rank) === r.rank);
      return match(r) || enfants.some(match);
    });
  }, [data.resolutions, q, filtre]);

  function ajouter(r: Resolution) {
    if (dejaAjoute.has(r.id) || dejaDansAg.has(r.id)) return;
    const enfants = r.estGroupe
      ? data.resolutions.filter((c) => rangParent(c.rank) === r.rank)
      : [];
    const aAjouter = [r, ...enfants];
    setDraft((d) => [...d, ...aAjouter.filter((x) => !d.some((y) => y.id === x.id))]);
  }
  function retirer(id: string) {
    setDraft((d) => {
      const cible = d.find((r) => r.id === id);
      // Retirer un groupe retire aussi ses sous-resolutions.
      if (cible?.estGroupe) {
        return d.filter((r) => r.id !== id && rangParent(r.rank) !== cible.rank);
      }
      return d.filter((r) => r.id !== id);
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
        rank: "",
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
    // Ordre voulu des motions de tete EXISTANTES (hors retirees) ; le serveur recalcule
    // tous les rangs (existant + nouvelles, avec nesting des groupes).
    const ordreTop = (ordre ?? topLevelIds).filter((id) => !aSupprimer.has(id));

    demarrerEnregistrement(async () => {
      const res = await enregistrerProjetAction(copro.code, meetingId, supprimer, items, ordreTop);
      if (res.ok) {
        setMessage({
          ton: "ok",
          texte:
            `AG mise à jour : ${res.ajoutees} ajout(s), ${res.supprimees} retrait(s)` +
            (res.dejaPresentes > 0
              ? `, ${res.dejaPresentes} déjà présente(s) (non dupliquées)`
              : "") +
            `${ordreChange ? ", ordre appliqué" : ""}.`,
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
  async function creerAg() {
    const ok = await confirmer({
      titre: "Créer une nouvelle AG ordinaire ?",
      message: "Une AG ordinaire sera créée dans Estale pour cette copropriété (le socle standard est ajouté automatiquement).",
      confirmer: "Créer l'AG",
    });
    if (!ok) return;
    setMessage(null);
    demarrerCreation(async () => {
      const res = await creerAgAction(copro.code);
      if (res.ok) router.refresh();
      else setMessage({ ton: "err", texte: res.erreur });
    });
  }

  // `dateAg` arrive AFFICHEE ("07/09/2026") : l'injecter telle quelle dans l'URL cassait
  // le lien (les slashes -> segments -> 404). L'id de la route ODJ attend l'ISO.
  const dateAgURL = dateAg && /^\d{2}\/\d{2}\/\d{4}$/.test(dateAg)
    ? dateAg.split("/").reverse().join("-")
    : dateAg;
  const retour = `/odj/${dateAgURL ? `${copro.code}__${dateAgURL}` : copro.code}`;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <PageHeader
          eyebrow={
            <Link href={retour} className="inline-flex items-center gap-1 hover:text-ink">
              <ArrowLeft strokeWidth={1.5} className="w-3 h-3" /> Retour à l&apos;ODJ
            </Link>
          }
          titre="Mode CS : composer l'ordre du jour"
          code={copro.code}
          meta={`${copro.nom}${dateAg ? ` · AG du ${dateAg}` : " · date d'AG non définie"}`}
          aide={
            <p>
              Retirez ce que vous ne voulez pas dans l&apos;AG, piochez dans la bibliothèque du cabinet (ESTALE) ou
              ajoutez des résolutions libres, puis enregistrez : l&apos;AG ESTALE est mise à jour pour correspondre
              exactement à votre composition.
            </p>
          }
        />
      </div>

      {etatAg !== "ouverte" && (
        <AlerteEtatAg etat={etatAg} onCreer={creerAg} creation={creation} />
      )}

      {datesDivergent && assemblee?.dateISO && (
        <div className="flex items-start gap-3 rounded-md border border-warn-500/30 bg-warn-50 px-3.5 py-2.5">
          <AlertTriangle strokeWidth={1.5} className="w-4 h-4 text-warn-700 shrink-0 mt-px" />
          <p className="text-body text-warn-700">
            <span className="font-medium">Dates divergentes.</span> L&apos;intranet vise l&apos;AG
            du {dateAg}, mais l&apos;AG Estale ciblée est datée du {assemblee.dateISO}. L&apos;ODJ
            que tu composes s&apos;applique à <span className="font-medium">cette AG Estale</span> -
            vérifie que c&apos;est la bonne avant d&apos;enregistrer.
          </p>
        </div>
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
          dejaDansAg={dejaDansAg}
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
            nbModifs={nbModifs}
          />
        </div>
      </div>
    </div>
  );
}

// --- Colonne droite (haut) : l'AG telle qu'elle existe deja dans Estale ----

/** Numerote le brouillon (regle unique du domaine : un enfant de groupe n'a pas de numero). */
function numeroterDraft(draft: Resolution[]): { r: Resolution; numero: number; enfant: boolean }[] {
  return numeroterResolutions(draft, (r) => rangParent(r.rank) !== null).map(({ item, numero, enfant }) => ({ r: item, numero, enfant }));
}

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

/** Numerote les motions eStale (meme regle du domaine que le brouillon). */
function numeroter(
  motions: MotionAg[],
): { m: MotionAg; numero: number; premierTop: boolean; dernierTop: boolean }[] {
  return numeroterResolutions(motions, (mo) => Boolean(mo.estEnfant)).map(({ item, numero, premierTop, dernierTop }) => ({ m: item, numero, premierTop, dernierTop }));
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
          <p className="text-body text-ink-3">
            Aucune AG ordinaire trouvée pour cette copro dans Estale. Elle sera créée à
            l&apos;enregistrement (le socle standard s&apos;ajoutera automatiquement).
          </p>
        </div>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-2.5">
      <h2 className="text-body font-semibold uppercase tracking-[0.06em] text-ink-3 flex items-center gap-1.5">
        <ListChecks strokeWidth={1.5} className="w-3.5 h-3.5" />
        Déjà dans l&apos;AG Estale ({assemblee.motions.length})
      </h2>
      <p className="text-meta text-ink-3 -mt-1">
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
          <p className="px-4 py-6 text-body text-ink-3 text-center">AG sans résolution.</p>
        ) : (
          <ol className="divide-y divide-line">
            {numeroter(motionsAffichees).map(({ m, numero, premierTop, dernierTop }) => {
              const marque = aSupprimer.has(m.id);
              return (
                <li
                  key={m.id}
                  className={`flex items-start gap-2 px-3 py-2 ${marque ? "opacity-50" : ""} ${m.estEnfant ? "pl-7" : ""}`}
                >
                  <span className="font-mono text-body text-ink-3 w-5 text-right shrink-0 pt-0.5">
                    {m.estEnfant ? "·" : `${numero}.`}
                  </span>
                  {editable && !m.estEnfant && (
                    <span className="flex flex-col -my-0.5 shrink-0">
                      <Button
                        onClick={() => onDeplacerTop(m.id, -1)}
                        disabled={premierTop}
                        aria-label="Monter"
                        title="Monter"
                        variant="ghost"
                      >
                        <ArrowUp strokeWidth={1.5} className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        onClick={() => onDeplacerTop(m.id, 1)}
                        disabled={dernierTop}
                        aria-label="Descendre"
                        title="Descendre"
                        variant="ghost"
                      >
                        <ArrowDown strokeWidth={1.5} className="w-3.5 h-3.5" />
                      </Button>
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-body ${m.estGroupe ? "font-semibold text-ink" : "text-ink"} ${marque ? "line-through" : ""}`}
                      >
                        {m.titre}
                      </span>
                      {m.estGroupe ? (
                        <span className="text-meta uppercase tracking-wide text-ink-3">groupe</span>
                      ) : (
                        <MajoriteBadge majorite={m.majorite} />
                      )}
                    </div>
                    {m.cleRepartition && !m.estGroupe && (
                      <p className="mt-0.5 text-meta text-ink-3">{m.cleRepartition}</p>
                    )}
                  </div>
                  {editable && (
                    <Button
                      onClick={() => onToggleSupprimer(m.id)}
                      aria-label={marque ? "Annuler le retrait" : "Retirer de l'ODJ"}
                      title={marque ? "Annuler le retrait" : "Retirer de l'ODJ"}
                      variant="secondary" size="sm" iconOnly className="w-7 shrink-0"
                    >
                      {marque ? (
                        <RotateCcw strokeWidth={1.5} className="w-3.5 h-3.5" />
                      ) : (
                        <X strokeWidth={1.5} className="w-3.5 h-3.5" />
                      )}
                    </Button>
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
        <p className="text-body text-warn-700">
          {etat === "cloturee" ? (
            <>
              <span className="font-medium">AG clôturée</span> - on ne peut plus la modifier. Pour
              préparer une nouvelle convocation (ex. comptes refusés, reconvocation), crée une
              nouvelle AG.
            </>
          ) : (
            <>
              <span className="font-medium">Aucune AG Estale</span> pour cette copropriété. Crée-en
              une avant de composer l&apos;ordre du jour.
            </>
          )}
        </p>
      </div>
      <Button
        onClick={onCreer}
        disabled={creation}
        variant="ghost" className="shrink-0"
      >
        {creation && <Loader2 strokeWidth={2} className="w-3.5 h-3.5 animate-spin" />}
        Créer une nouvelle AG
      </Button>
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
  dejaDansAg,
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
  dejaDansAg: Set<string>;
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
      <h2 className="text-body font-semibold uppercase tracking-[0.06em] text-ink-3">
        Bibliothèque ({data.resolutions.length})
      </h2>

      {data.indisponible ? (
        <Card>
          <div className="flex items-start gap-2.5 px-4 py-6">
            <AlertTriangle strokeWidth={1.5} className="w-4 h-4 text-warn-700 shrink-0 mt-px" />
            <p className="text-body text-warn-700">
              Bibliothèque Estale temporairement indisponible. Rechargez la page dans un instant.
            </p>
          </div>
        </Card>
      ) : (
        <>
          <div className="relative">
            <Search strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3" />
            <Input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher..."
              aria-label="Rechercher dans la bibliotheque"
             
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
              const enAg = !ajoute && dejaDansAg.has(r.id);
              const enfants = r.estGroupe
                ? data.resolutions.filter((c) => rangParent(c.rank) === r.rank)
                : [];
              return (
                <Card key={r.id}>
                  <div className="px-3 py-2.5 flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-body font-medium text-ink">{r.titre}</span>
                        {r.estGroupe ? (
                          <span className="text-meta uppercase tracking-wide text-ink-3">
                            groupe · {enfants.length}
                          </span>
                        ) : (
                          <MajoriteBadge majorite={r.majorite} />
                        )}
                      </div>
                      {r.corps && !r.estGroupe && (
                        <p className="mt-1 text-body text-ink-3 line-clamp-2">{r.corps}</p>
                      )}
                      {r.estGroupe && enfants.length > 0 && (
                        <ul className="mt-1.5 flex flex-col gap-1">
                          {enfants.map((e) => (
                            <li key={e.id} className="flex items-center gap-1.5 text-meta text-ink-3">
                              <span className="text-ink-3">·</span>
                              <span className="truncate">{e.titre}</span>
                              <MajoriteBadge majorite={e.majorite} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onAjouter(r)}
                      disabled={ajoute || enAg || !editable}
                      title={enAg ? "Déjà présente dans l'AG Estale (pas de doublon)" : undefined}
                      className={`inline-flex items-center gap-1 h-7 px-2 rounded-sm text-body font-medium shrink-0 transition-colors disabled:cursor-not-allowed ${
 ajoute
                          ? "text-ok-700 cursor-default"
                          : enAg
                            ? "text-ink-3 cursor-default"
                            : "bg-surface border border-line text-ink hover:bg-surface-2 hover:border-line-2 disabled:opacity-40"
                      }`}
                    >
                      {ajoute ? (
                        <>
                          <Check strokeWidth={2} className="w-3.5 h-3.5" /> Ajouté
                        </>
                      ) : enAg ? (
                        <>
                          <ListChecks strokeWidth={2} className="w-3.5 h-3.5" /> Déjà dans l&apos;AG
                        </>
                      ) : (
                        <>
                          <Plus strokeWidth={2} className="w-3.5 h-3.5" /> {r.estGroupe ? "Ajouter le groupe" : "Ajouter"}
                        </>
                      )}
                    </button>
                  </div>
                </Card>
              );
            })}
            {visibles.length === 0 && (
              <p className="text-body text-ink-3 px-1 py-6 text-center">Aucun résultat.</p>
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
  nbModifs,
}: {
  draft: Resolution[];
  onRetirer: (id: string) => void;
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
  nbModifs: number;
}) {
  // Numerote les resolutions de tete du brouillon (enfants de groupe : sans numero).
  const lignes = numeroterDraft(draft);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-body font-semibold uppercase tracking-[0.06em] text-ink-3">
        À ajouter ({draft.length} résolution{draft.length > 1 ? "s" : ""})
      </h2>

      <Card>
        {draft.length === 0 ? (
          <p className="px-4 py-8 text-body text-ink-3 text-center">
            Aucune résolution. Ajoute-en depuis la bibliothèque, ou crée une résolution libre.
          </p>
        ) : (
          <ol className="divide-y divide-line">
            {lignes.map(({ r, numero, enfant }) => {
              return (
                <li key={r.id} className={`flex items-start gap-2.5 px-3 py-2.5 ${enfant ? "pl-7" : ""}`}>
                  <span className="font-mono text-body text-ink-3 w-5 text-right shrink-0 pt-0.5">
                    {enfant ? "·" : `${numero}.`}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-body ${r.estGroupe ? "font-semibold" : "font-medium"} text-ink`}>
                        {r.titre}
                      </span>
                      {r.estGroupe ? (
                        <span className="text-meta uppercase tracking-wide text-ink-3">groupe</span>
                      ) : (
                        <MajoriteBadge majorite={r.majorite} />
                      )}
                      {r.id.startsWith("libre-") && (
                        <span className="text-meta text-ink-3 uppercase tracking-wide">libre</span>
                      )}
                    </div>
                    {r.corps && !r.estGroupe && (
                      <p className="mt-1 text-body text-ink-3 line-clamp-2">{r.corps}</p>
                    )}
                  </div>
                  {!enfant && (
                    <IconBtn label="Retirer" onClick={() => onRetirer(r.id)}>
                      <X strokeWidth={1.5} className="w-3.5 h-3.5" />
                    </IconBtn>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      {formOuvert ? (
        <Card>
          <div className="px-3 py-3 flex flex-col gap-2.5">
            <Input
              value={libreTitre}
              onChange={(e) => setLibreTitre(e.target.value)}
              placeholder="Intitulé de la résolution"
              aria-label="Intitule de la resolution libre"
             
            />
            <div className="flex items-center gap-2">
              <label htmlFor="libre-majorite" className="text-body text-ink-3">Majorité</label>
              <Select
                id="libre-majorite"
                value={libreMajorite}
                onChange={(e) => setLibreMajorite(e.target.value as MajoriteResolution)}
                largeur="auto"
              >
                {MAJORITE_ORDRE.map((m) => (
                  <option key={m} value={m}>
                    {MAJORITE_LABEL[m]}
                  </option>
                ))}
              </Select>
            </div>
            <Textarea
              value={libreCorps}
              onChange={(e) => setLibreCorps(e.target.value)}
              placeholder="Texte de la résolution (optionnel)"
              rows={3}
             
            />
            <div className="flex items-center gap-2 justify-end">
              <Button
                onClick={() => setFormOuvert(false)}
                variant="secondary"
              >
                Annuler
              </Button>
              <Button
                onClick={onAjouterLibre}
                disabled={!libreTitre.trim()}
                variant="secondary"
              >
                Ajouter à l&apos;ODJ
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <Button
          onClick={() => setFormOuvert(true)}
          disabled={etatAg !== "ouverte"}
          variant="secondary" size="lg"
        >
          <Plus strokeWidth={1.5} className="w-4 h-4" /> Ajouter une résolution libre
        </Button>
      )}

      {etatAg === "ouverte" && nbModifs > 0 && !enregistrement && (
        <p className="text-body text-ink-3">
          {nbModifs} modification{nbModifs > 1 ? "s" : ""} en attente - rien n&apos;est écrit dans
          l&apos;AG Estale tant que tu n&apos;as pas cliqué « Enregistrer ».
        </p>
      )}

      <Button
        onClick={onEnregistrer}
        disabled={etatAg !== "ouverte" || enregistrement}
        aria-busy={enregistrement}
        title={
          etatAg === "ouverte"
            ? "Ajoute les résolutions composées dans l'AG Estale"
            : etatAg === "cloturee"
              ? "AG clôturée : non modifiable"
              : "Aucune AG Estale (création à venir, palier 3)"
        }
        variant="primary" size="lg"
      >
        {enregistrement && <Loader2 strokeWidth={2} className="w-4 h-4 animate-spin" />}
        {enregistrement
          ? "Application en cours..."
          : etatAg === "ouverte"
            ? "Enregistrer dans l'AG Estale"
            : etatAg === "cloturee"
              ? "AG clôturée (non modifiable)"
              : "Créer l'AG d'abord (à venir)"}
      </Button>

      {/* Progression : le bouton est verrouille pendant l'application (mutations eStale en
          sequence) - on l'explique pour eviter le re-clic / la fermeture d'onglet. */}
      {enregistrement && (
        <p role="status" aria-live="polite" className="text-body text-ink-3">
          Application de l&apos;ODJ dans eStale... Ne ferme pas la page. En cas d&apos;échec en
          cours de route, relance l&apos;enregistrement : rien ne sera dupliqué.
        </p>
      )}

      {message && (
        message.ton === "ok" ? (
          <p role="status" aria-live="polite" className="text-body text-ok-700">
            {message.texte}
          </p>
        ) : (
          <p role="alert" className="text-body text-err-700">
            {message.texte}
          </p>
        )
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
      className={`h-7 px-2.5 rounded-full text-body font-medium border transition-colors ${
 actif ? "bg-ink text-white border-ink" : "bg-surface text-ink-2 border-line hover:border-line-2 hover:text-ink"
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
    <Button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      variant="secondary" size="sm" iconOnly className="w-7"
    >
      {children}
    </Button>
  );
}
