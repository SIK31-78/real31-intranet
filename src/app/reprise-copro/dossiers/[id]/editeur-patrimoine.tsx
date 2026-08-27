"use client";

// EDITEUR DE CORRECTIONS du jeu patrimoine (ADR-030, chantier prioritaire).
//
// Quand un fichier verse porte une erreur (un tantieme faux, un lot
// manque, un doublon d'owner) et bloque l'injection. Cet editeur transforme l'impasse en gestes :
// on edite lots / cles+tantiemes / owners / attributions section par section, les auto-checks
// repassent, le dossier redevient injectable. AUCUNE mutation eStale : ca ne touche QUE le jeu
// local (persiste en base). Le GESTE CLE : corriger un tantieme faux GUIDE par l'ecart de la cle.
//
// Modele d'interaction :
//   - Editions de valeurs (champs, tantiemes) : brouillon local -> "Enregistrer" par section.
//   - Gestes structurels (ajouter / supprimer / fusionner / reattacher) : appliques a l'unite.
// Chaque application appelle corrigerJeuAction (Zod + cloisonnement serveur) et rafraichit le jeu
// + le recap remontes (compteurs / badges / ecarts recalcules) via onApplied.

import { useState, useTransition } from "react";
import {
  Pencil,
  Plus,
  Trash2,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Users,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { USAGES, CIVILITES } from "@/lib/reprise/domain/patrimoine";
import type { JeuDeDonnees, Lot, Owner, Usage, Civilite } from "@/lib/reprise/domain/patrimoine";
import type { Correction } from "@/lib/reprise/domain/corrections-patrimoine";
import type { RecapPatrimoine } from "@/lib/reprise/services/orchestrateur-patrimoine";
import { corrigerJeuAction } from "./actions";

// Petit nom d'owner pour l'affichage (PII en UI = ok ; jamais en log serveur).
function nomOwner(o: Owner): string {
  return [o.nom, o.prenom].filter((s) => s && s.trim().length > 0).join(" ") || o.id;
}

const inputCls = "h-7 rounded border border-line bg-surface px-1.5 text-[12.5px] text-ink w-full";

// Hook d'application : envoie des corrections au serveur et remonte le jeu/recap rafraichis.
function useAppliquer(dossierRef: string, onApplied: (jeu: JeuDeDonnees, recap: RecapPatrimoine) => void) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const appliquer = (corrections: Correction[], okMsg: string, apres?: () => void) => {
    if (corrections.length === 0) {
      apres?.();
      return;
    }
    start(async () => {
      const r = await corrigerJeuAction(dossierRef, corrections);
      if (r.ok) {
        onApplied(r.jeu, r.recap);
        toast.ok(okMsg);
        if (r.notes.length > 0) toast.ok(r.notes.join(" "));
        apres?.();
      } else {
        toast.err(r.message);
      }
    });
  };
  return { appliquer, pending };
}

// Cartouche de section repliable avec compteur + slot d'edition.
function SectionRepliable({
  titre,
  compteur,
  ouvert,
  onToggle,
  children,
}: {
  titre: string;
  compteur: number;
  ouvert: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-line bg-surface">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        {ouvert ? (
          <ChevronDown strokeWidth={1.75} className="w-4 h-4 text-ink-3 shrink-0" />
        ) : (
          <ChevronRight strokeWidth={1.75} className="w-4 h-4 text-ink-3 shrink-0" />
        )}
        <span className="text-[13px] font-medium text-ink">{titre}</span>
        <span className="text-[11px] font-mono text-ink-4">{compteur}</span>
      </button>
      {ouvert && <div className="border-t border-line p-3">{children}</div>}
    </div>
  );
}

export function EditeurPatrimoine({
  dossierRef,
  jeu,
  recap,
  dejaInjecte,
  expandeeCle,
  onExpandCle,
  onApplied,
}: {
  dossierRef: string;
  jeu: JeuDeDonnees;
  recap: RecapPatrimoine;
  dejaInjecte: boolean;
  /** Code de la cle actuellement depliee (controle depuis le parent : guidage par l'ecart). */
  expandeeCle: string | null;
  onExpandCle: (code: string | null) => void;
  onApplied: (jeu: JeuDeDonnees, recap: RecapPatrimoine) => void;
}) {
  // Section cles+tantiemes ouverte par defaut (la ou se corrige l'ecart) ; forcee ouverte tant
  // qu'une cle est depliee (guidage par l'ecart) sans effet de bord.
  const [ouvertes, setOuvertes] = useState<Record<string, boolean>>({ tantiemes: true });
  const toggle = (k: string) => setOuvertes((o) => ({ ...o, [k]: !o[k] }));
  const tantiemesOuvert = ouvertes.tantiemes !== false || expandeeCle !== null;

  return (
    <section>
      <div className="flex items-center gap-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">Editeur de corrections</h3>
        <Badge ton="info">jeu local</Badge>
      </div>
      <p className="mt-1 text-[12px] text-ink-3">
        Corrige a la main ce que l&apos;extraction a mal lu (tantieme faux, lot manque, doublon).
        Les auto-checks repassent apres chaque enregistrement.
      </p>

      {dejaInjecte && (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-warn-500/40 bg-warn-50 px-3 py-2 text-[12px] text-warn-700">
          <AlertTriangle strokeWidth={1.75} className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Ce dossier a deja ete injecte dans eStale : les corrections ne modifient QUE le jeu local,
            <span className="font-medium"> pas eStale</span>. Les correctifs eStale restent manuels pour
            l&apos;instant (utile ici pour re-produire des xlsx corriges).
          </span>
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2">
        <SectionRepliable titre="Cles et tantiemes" compteur={jeu.cles.length} ouvert={tantiemesOuvert} onToggle={() => toggle("tantiemes")}>
          <ClesTantiemesEditor
            dossierRef={dossierRef}
            jeu={jeu}
            recap={recap}
            expandee={expandeeCle}
            onExpand={onExpandCle}
            onApplied={onApplied}
          />
        </SectionRepliable>

        <SectionRepliable titre="Lots" compteur={jeu.lots.length} ouvert={!!ouvertes.lots} onToggle={() => toggle("lots")}>
          <LotsEditor dossierRef={dossierRef} jeu={jeu} onApplied={onApplied} />
        </SectionRepliable>

        <SectionRepliable titre="Coproprietaires" compteur={jeu.owners.length} ouvert={!!ouvertes.owners} onToggle={() => toggle("owners")}>
          <OwnersEditor dossierRef={dossierRef} jeu={jeu} onApplied={onApplied} />
        </SectionRepliable>

        <SectionRepliable titre="Attributions" compteur={jeu.attributions.length} ouvert={!!ouvertes.attributions} onToggle={() => toggle("attributions")}>
          <AttributionsEditor dossierRef={dossierRef} jeu={jeu} onApplied={onApplied} />
        </SectionRepliable>
      </div>
    </section>
  );
}

// --- CLES + TANTIEMES (le geste cle : corriger un tantieme faux guide par l'ecart) ----------

function ClesTantiemesEditor({
  dossierRef,
  jeu,
  recap,
  expandee,
  onExpand,
  onApplied,
}: {
  dossierRef: string;
  jeu: JeuDeDonnees;
  recap: RecapPatrimoine;
  /** Cle depliee (controlee par le parent : guidage par l'ecart depuis le tableau recap). */
  expandee: string | null;
  onExpand: (code: string | null) => void;
  onApplied: (jeu: JeuDeDonnees, recap: RecapPatrimoine) => void;
}) {
  const ecartParCle = new Map(recap.cles.map((c) => [c.code, c]));

  return (
    <div className="flex flex-col gap-1.5">
      {jeu.cles.map((cle) => {
        const rc = ecartParCle.get(cle.code);
        const ecart = rc?.ecart ?? 0;
        const ouverte = expandee === cle.code;
        // Cle de remontage : change apres chaque enregistrement (somme/nb/libelle/total) -> la
        // sous-vue repart des vraies valeurs sans effet setState (evite set-state-in-effect).
        const signature = `${cle.code}:${rc?.nbLots ?? 0}:${rc?.sommeCalculee ?? 0}:${cle.libelle}:${cle.totalAttendu}`;
        return (
          <div key={cle.code} className="rounded border border-line">
            <button
              type="button"
              onClick={() => onExpand(ouverte ? null : cle.code)}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
            >
              {ouverte ? <ChevronDown strokeWidth={1.75} className="w-3.5 h-3.5 text-ink-4" /> : <ChevronRight strokeWidth={1.75} className="w-3.5 h-3.5 text-ink-4" />}
              <span className="font-mono text-[12px] text-ink-2">{cle.code}</span>
              <span className="text-[12.5px] text-ink truncate flex-1">{cle.libelle}</span>
              <span className="text-[11px] text-ink-4 shrink-0">
                {rc?.sommeCalculee ?? 0} / {cle.totalAttendu}
              </span>
              <Badge ton={ecart === 0 ? "ok" : "err"}>{ecart === 0 ? "ok" : `ecart ${ecart}`}</Badge>
            </button>
            {ouverte && (
              <TantiemesCle
                key={signature}
                dossierRef={dossierRef}
                jeu={jeu}
                cleCode={cle.code}
                totalAttendu={cle.totalAttendu}
                libelle={cle.libelle}
                defaut={!!cle.defaut}
                onApplied={onApplied}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

interface LigneTant {
  lot: number;
  valeur: string;
  orig?: number; // valeur d'origine (undefined = ligne ajoutee)
}

function TantiemesCle({
  dossierRef,
  jeu,
  cleCode,
  totalAttendu,
  libelle,
  defaut,
  onApplied,
}: {
  dossierRef: string;
  jeu: JeuDeDonnees;
  cleCode: string;
  totalAttendu: number;
  libelle: string;
  defaut: boolean;
  onApplied: (jeu: JeuDeDonnees, recap: RecapPatrimoine) => void;
}) {
  const { appliquer, pending } = useAppliquer(dossierRef, onApplied);
  const seed = (): LigneTant[] =>
    jeu.tantiemes
      .filter((t) => t.cleCode === cleCode)
      .sort((a, b) => a.lot - b.lot)
      .map((t) => ({ lot: t.lot, valeur: String(t.valeur), orig: t.valeur }));
  // Seed initial : le parent remonte ce composant (key = signature de la cle) apres chaque
  // enregistrement, donc l'etat repart toujours des vraies valeurs sans effet de re-seed.
  const [lignes, setLignes] = useState<LigneTant[]>(seed);
  const [libelleDraft, setLibelleDraft] = useState(libelle);
  const [totalDraft, setTotalDraft] = useState(String(totalAttendu));
  const [nouveauLot, setNouveauLot] = useState("");

  const somme = lignes.reduce((s, l) => s + (Number(l.valeur) || 0), 0);
  const total = Number(totalDraft) || 0;
  const ecart = somme - total;

  const setValeur = (lot: number, valeur: string) =>
    setLignes((ls) => ls.map((l) => (l.lot === lot ? { ...l, valeur } : l)));
  const retirer = (lot: number) => setLignes((ls) => ls.filter((l) => l.lot !== lot));
  const ajouterLigne = () => {
    const n = Number(nouveauLot);
    if (!Number.isInteger(n) || n <= 0) return;
    if (lignes.some((l) => l.lot === n)) return;
    setLignes((ls) => [...ls, { lot: n, valeur: "0" }].sort((a, b) => a.lot - b.lot));
    setNouveauLot("");
  };

  const enregistrer = () => {
    const corrections: Correction[] = [];
    // Cle : libelle / total attendu modifies.
    const champsCle: { libelle?: string; totalAttendu?: number } = {};
    if (libelleDraft !== libelle) champsCle.libelle = libelleDraft;
    if (total !== totalAttendu) champsCle.totalAttendu = total;
    if (Object.keys(champsCle).length > 0) corrections.push({ type: "cle.modifier", code: cleCode, champs: champsCle });

    const origLots = new Set(seed().map((l) => l.lot));
    for (const l of lignes) {
      const v = Number(l.valeur);
      if (!Number.isFinite(v)) continue;
      if (l.orig === undefined) {
        corrections.push({ type: "tantieme.ajouter", tantieme: { cleCode, lot: l.lot, valeur: v } });
      } else if (v !== l.orig) {
        corrections.push({ type: "tantieme.modifier", cleCode, lot: l.lot, valeur: v });
      }
    }
    for (const lot of origLots) {
      if (!lignes.some((l) => l.lot === lot)) corrections.push({ type: "tantieme.supprimer", cleCode, lot });
    }
    appliquer(corrections, "Cle enregistree.");
  };

  return (
    <div className="border-t border-line bg-surface-2 p-2.5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <label className="flex flex-col gap-0.5 sm:col-span-2">
          <span className="text-[10.5px] text-ink-4">Libelle {defaut ? "(cle par defaut)" : ""}</span>
          <input value={libelleDraft} onChange={(e) => setLibelleDraft(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10.5px] text-ink-4">Total attendu</span>
          <input value={totalDraft} onChange={(e) => setTotalDraft(e.target.value)} inputMode="numeric" className={cn(inputCls, "font-mono")} />
        </label>
      </div>

      <div className="mt-2 max-h-72 overflow-y-auto rounded border border-line bg-surface">
        <table className="w-full text-[12.5px]">
          <thead className="sticky top-0 bg-surface-2 text-[10.5px] uppercase text-ink-4">
            <tr>
              <th className="px-2 py-1 text-left font-medium">Lot</th>
              <th className="px-2 py-1 text-right font-medium">Tantieme</th>
              <th className="px-2 py-1" />
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => {
              const modifiee = l.orig !== undefined && Number(l.valeur) !== l.orig;
              return (
                <tr key={l.lot} className={cn("border-t border-line", modifiee && "bg-info-50")}>
                  <td className="px-2 py-1 font-mono text-ink-2">{l.lot}</td>
                  <td className="px-2 py-1 text-right">
                    <input
                      value={l.valeur}
                      onChange={(e) => setValeur(l.lot, e.target.value)}
                      inputMode="numeric"
                      className={cn(inputCls, "text-right font-mono w-24 ml-auto")}
                    />
                  </td>
                  <td className="px-2 py-1 text-right">
                    <button type="button" onClick={() => retirer(l.lot)} className="text-ink-4 hover:text-err-700" aria-label={`Retirer le lot ${l.lot}`}>
                      <Trash2 strokeWidth={1.5} className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Ecart live : le guide de correction (attendu vs somme, difference en evidence). */}
      <div className="mt-2 flex items-center gap-2 text-[12px]">
        <span className="text-ink-3">Somme <span className="font-mono text-ink">{somme}</span> / attendu <span className="font-mono text-ink">{total}</span></span>
        <Badge ton={ecart === 0 ? "ok" : "err"} dot>
          {ecart === 0 ? "equilibree" : `ecart ${ecart > 0 ? "+" : ""}${ecart}`}
        </Badge>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          value={nouveauLot}
          onChange={(e) => setNouveauLot(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ajouterLigne()}
          placeholder="N° lot"
          inputMode="numeric"
          className={cn(inputCls, "w-20 font-mono")}
        />
        <Button type="button" variant="secondary" onClick={ajouterLigne} disabled={pending}>
          <Plus strokeWidth={1.5} className="w-3.5 h-3.5" /> Ajouter une ligne
        </Button>
        <div className="flex-1" />
        <Button type="button" variant="primary" onClick={enregistrer} disabled={pending}>
          <Check strokeWidth={1.75} className="w-3.5 h-3.5" /> {pending ? "..." : "Enregistrer"}
        </Button>
      </div>
    </div>
  );
}

// --- LOTS -------------------------------------------------------------------

interface LigneLot {
  numero: number;
  type: string;
  usage: string;
  commentaire: string;
  etage: string;
  orig: Lot;
}

function LotsEditor({
  dossierRef,
  jeu,
  onApplied,
}: {
  dossierRef: string;
  jeu: JeuDeDonnees;
  onApplied: (jeu: JeuDeDonnees, recap: RecapPatrimoine) => void;
}) {
  const { appliquer, pending } = useAppliquer(dossierRef, onApplied);
  const confirmer = useConfirm();
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<LigneLot[]>([]);
  // Ajout de lot.
  const [nvNumero, setNvNumero] = useState("");
  const [nvType, setNvType] = useState("");
  const [nvUsage, setNvUsage] = useState<Usage>("residential");
  const [nvComment, setNvComment] = useState("");

  const seed = (): LigneLot[] =>
    [...jeu.lots]
      .sort((a, b) => a.numero - b.numero)
      .map((l) => ({
        numero: l.numero,
        type: l.type,
        usage: l.usage,
        commentaire: l.commentaire,
        etage: l.etage !== undefined ? String(l.etage) : "",
        orig: l,
      }));

  const entrer = () => {
    setRows(seed());
    setEditing(true);
  };

  const set = (numero: number, champ: keyof LigneLot, val: string) =>
    setRows((rs) => rs.map((r) => (r.numero === numero ? { ...r, [champ]: val } : r)));

  const enregistrer = () => {
    const corrections: Correction[] = [];
    for (const r of rows) {
      const champs: { type?: string; usage?: Usage; commentaire?: string; etage?: number } = {};
      if (r.type !== r.orig.type) champs.type = r.type;
      if (r.usage !== r.orig.usage) champs.usage = r.usage as Usage;
      if (r.commentaire !== r.orig.commentaire) champs.commentaire = r.commentaire;
      const etageNum = r.etage.trim() === "" ? undefined : Number(r.etage);
      if (etageNum !== r.orig.etage && !(etageNum === undefined && r.orig.etage === undefined)) {
        if (etageNum !== undefined && Number.isFinite(etageNum)) champs.etage = etageNum;
      }
      if (Object.keys(champs).length > 0) corrections.push({ type: "lot.modifier", numero: r.numero, champs });
    }
    appliquer(corrections, "Lots enregistres.", () => setEditing(false));
  };

  const supprimer = async (numero: number) => {
    const nbTant = jeu.tantiemes.filter((t) => t.lot === numero).length;
    const nbAttr = jeu.attributions.filter((a) => a.lot === numero).length;
    const ok = await confirmer({
      titre: `Supprimer le lot ${numero} ?`,
      message:
        nbTant + nbAttr > 0
          ? `Ce lot porte ${nbTant} tantieme(s) et ${nbAttr} attribution(s) : ils seront supprimes en cascade.`
          : "Ce lot n'a ni tantieme ni attribution.",
      confirmer: "Supprimer",
      annuler: "Annuler",
      danger: true,
    });
    if (!ok) return;
    appliquer([{ type: "lot.supprimer", numero, cascade: true }], `Lot ${numero} supprime.`);
  };

  const ajouter = () => {
    const n = Number(nvNumero);
    if (!Number.isInteger(n) || n <= 0) return;
    appliquer(
      [{ type: "lot.ajouter", lot: { numero: n, type: nvType.trim() || "Lot", usage: nvUsage, commentaire: nvComment.trim() } }],
      `Lot ${n} ajoute.`,
      () => {
        setNvNumero("");
        setNvType("");
        setNvComment("");
      },
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[11.5px] text-ink-3">{jeu.lots.length} lot(s)</span>
        {!editing ? (
          <Button type="button" variant="secondary" onClick={entrer}>
            <Pencil strokeWidth={1.5} className="w-3.5 h-3.5" /> Modifier
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
              <X strokeWidth={1.5} className="w-3.5 h-3.5" /> Annuler
            </Button>
            <Button type="button" variant="primary" onClick={enregistrer} disabled={pending}>
              <Check strokeWidth={1.75} className="w-3.5 h-3.5" /> {pending ? "..." : "Enregistrer"}
            </Button>
          </div>
        )}
      </div>

      <div className="mt-2 max-h-96 overflow-auto rounded border border-line">
        <table className="w-full text-[12.5px]">
          <thead className="sticky top-0 bg-surface-2 text-[10.5px] uppercase text-ink-4">
            <tr>
              <th className="px-2 py-1 text-left font-medium">N°</th>
              <th className="px-2 py-1 text-left font-medium">Type</th>
              <th className="px-2 py-1 text-left font-medium">Usage</th>
              <th className="px-2 py-1 text-left font-medium">Etage</th>
              <th className="px-2 py-1 text-left font-medium">Commentaire</th>
              {editing && <th className="px-2 py-1" />}
            </tr>
          </thead>
          <tbody>
            {(editing ? rows : seed()).map((r) => (
              <tr key={r.numero} className="border-t border-line align-top">
                <td className="px-2 py-1 font-mono text-ink-2">{r.numero}</td>
                {editing ? (
                  <>
                    <td className="px-2 py-1"><input value={r.type} onChange={(e) => set(r.numero, "type", e.target.value)} className={inputCls} /></td>
                    <td className="px-2 py-1">
                      <select value={r.usage} onChange={(e) => set(r.numero, "usage", e.target.value)} className={cn(inputCls, "w-28")}>
                        {USAGES.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1"><input value={r.etage} onChange={(e) => set(r.numero, "etage", e.target.value)} inputMode="numeric" className={cn(inputCls, "w-14 font-mono")} /></td>
                    <td className="px-2 py-1"><input value={r.commentaire} onChange={(e) => set(r.numero, "commentaire", e.target.value)} className={inputCls} /></td>
                    <td className="px-2 py-1 text-right">
                      <button type="button" onClick={() => supprimer(r.numero)} className="text-ink-4 hover:text-err-700" aria-label={`Supprimer le lot ${r.numero}`}>
                        <Trash2 strokeWidth={1.5} className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-2 py-1 text-ink">{r.type}</td>
                    <td className="px-2 py-1 text-ink-2">{r.usage}</td>
                    <td className="px-2 py-1 font-mono text-ink-2">{r.etage}</td>
                    <td className="px-2 py-1 text-ink-2 truncate max-w-[16rem]">{r.commentaire}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded border border-dashed border-line bg-surface-2 p-2">
          <span className="text-[11px] font-medium text-ink-3 w-full">Ajouter un lot manque</span>
          <input value={nvNumero} onChange={(e) => setNvNumero(e.target.value)} placeholder="N°" inputMode="numeric" className={cn(inputCls, "w-16 font-mono")} />
          <input value={nvType} onChange={(e) => setNvType(e.target.value)} placeholder="Type" className={cn(inputCls, "w-32")} />
          <select value={nvUsage} onChange={(e) => setNvUsage(e.target.value as Usage)} className={cn(inputCls, "w-28")}>
            {USAGES.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <input value={nvComment} onChange={(e) => setNvComment(e.target.value)} placeholder="Commentaire" className={cn(inputCls, "flex-1 min-w-[8rem]")} />
          <Button type="button" variant="secondary" onClick={ajouter} disabled={pending || nvNumero.trim() === ""}>
            <Plus strokeWidth={1.5} className="w-3.5 h-3.5" /> Ajouter
          </Button>
        </div>
      )}
    </div>
  );
}

// --- OWNERS (edition champs + fusion doublons + suppression avec reattribution) --------------

interface LigneOwner {
  id: string;
  civilite: string;
  nom: string;
  prenom: string;
  email: string;
  telPortable: string;
  adrVille: string;
  orig: Owner;
}

function OwnersEditor({
  dossierRef,
  jeu,
  onApplied,
}: {
  dossierRef: string;
  jeu: JeuDeDonnees;
  onApplied: (jeu: JeuDeDonnees, recap: RecapPatrimoine) => void;
}) {
  const { appliquer, pending } = useAppliquer(dossierRef, onApplied);
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<LigneOwner[]>([]);
  const [selection, setSelection] = useState<string[]>([]); // pour la fusion (2 max)
  const [survivant, setSurvivant] = useState<string | null>(null);
  const [suppression, setSuppression] = useState<{ id: string; vers: string } | null>(null);

  const nbLotsPar = new Map<string, number>();
  for (const a of jeu.attributions) nbLotsPar.set(a.ownerId, (nbLotsPar.get(a.ownerId) ?? 0) + 1);

  const seed = (): LigneOwner[] =>
    jeu.owners.map((o) => ({
      id: o.id,
      civilite: o.civilite,
      nom: o.nom,
      prenom: o.prenom ?? "",
      email: o.email ?? "",
      telPortable: o.telPortable ?? "",
      adrVille: o.adrVille ?? "",
      orig: o,
    }));

  const entrer = () => {
    setRows(seed());
    setSelection([]);
    setSurvivant(null);
    setSuppression(null);
    setEditing(true);
  };

  const set = (id: string, champ: keyof LigneOwner, val: string) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [champ]: val } : r)));

  const enregistrer = () => {
    const corrections: Correction[] = [];
    for (const r of rows) {
      const champs: Record<string, unknown> = {};
      if (r.civilite !== r.orig.civilite) champs.civilite = r.civilite as Civilite;
      if (r.nom !== r.orig.nom) champs.nom = r.nom;
      if (r.prenom !== (r.orig.prenom ?? "")) champs.prenom = r.prenom;
      if (r.email !== (r.orig.email ?? "")) champs.email = r.email;
      if (r.telPortable !== (r.orig.telPortable ?? "")) champs.telPortable = r.telPortable;
      if (r.adrVille !== (r.orig.adrVille ?? "")) champs.adrVille = r.adrVille;
      if (Object.keys(champs).length > 0) corrections.push({ type: "owner.modifier", id: r.id, champs });
    }
    appliquer(corrections, "Coproprietaires enregistres.", () => setEditing(false));
  };

  const toggleSel = (id: string) => {
    setSelection((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 2 ? [...s, id] : s));
    // Le survivant doit toujours faire partie de la selection courante (evite un choix perime).
    setSurvivant((sv) => (sv === id || selection.includes(sv ?? "") ? sv : null));
  };

  const fusionSurvivantValide = survivant !== null && selection.includes(survivant);

  const fusionner = () => {
    if (selection.length !== 2 || !fusionSurvivantValide) return;
    const absorbe = selection.find((x) => x !== survivant)!;
    appliquer([{ type: "owner.fusionner", survivantId: survivant, absorbeId: absorbe }], "Coproprietaires fusionnes.", () => {
      setSelection([]);
      setSurvivant(null);
    });
  };

  const confirmerSuppression = () => {
    if (!suppression) return;
    const aDesLots = (nbLotsPar.get(suppression.id) ?? 0) > 0;
    const corr: Correction = aDesLots
      ? { type: "owner.supprimer", id: suppression.id, reattribuerVers: suppression.vers }
      : { type: "owner.supprimer", id: suppression.id };
    if (aDesLots && !suppression.vers) return; // reattribution obligatoire
    appliquer([corr], "Coproprietaire supprime.", () => setSuppression(null));
  };

  const autres = (id: string) => jeu.owners.filter((o) => o.id !== id);

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[11.5px] text-ink-3">{jeu.owners.length} coproprietaire(s)</span>
        {!editing ? (
          <Button type="button" variant="secondary" onClick={entrer}>
            <Pencil strokeWidth={1.5} className="w-3.5 h-3.5" /> Modifier
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
              <X strokeWidth={1.5} className="w-3.5 h-3.5" /> Annuler
            </Button>
            <Button type="button" variant="primary" onClick={enregistrer} disabled={pending}>
              <Check strokeWidth={1.75} className="w-3.5 h-3.5" /> {pending ? "..." : "Enregistrer"}
            </Button>
          </div>
        )}
      </div>

      {editing && selection.length === 2 && (
        <div className="mt-2 rounded border border-info-500/40 bg-info-50 p-2 text-[12px]">
          <div className="flex items-center gap-1.5 font-medium text-ink">
            <Users strokeWidth={1.5} className="w-3.5 h-3.5" /> Fusionner ces deux coproprietaires (doublon)
          </div>
          <p className="mt-1 text-ink-3">Choisir l&apos;entite a CONSERVER (ses donnees sont gardees ; l&apos;autre est reattachee) :</p>
          <div className="mt-1.5 flex flex-wrap gap-3">
            {selection.map((id) => {
              const o = jeu.owners.find((x) => x.id === id);
              return (
                <label key={id} className="flex items-center gap-1.5 text-[12.5px] text-ink">
                  <input type="radio" name="survivant" checked={survivant === id} onChange={() => setSurvivant(id)} />
                  {o ? nomOwner(o) : id}
                </label>
              );
            })}
          </div>
          <div className="mt-2">
            <Button type="button" variant="primary" onClick={fusionner} disabled={pending || !fusionSurvivantValide}>
              Fusionner
            </Button>
          </div>
        </div>
      )}

      <div className="mt-2 max-h-96 overflow-auto rounded border border-line">
        <table className="w-full text-[12.5px]">
          <thead className="sticky top-0 bg-surface-2 text-[10.5px] uppercase text-ink-4">
            <tr>
              {editing && <th className="px-2 py-1" />}
              <th className="px-2 py-1 text-left font-medium">Civ.</th>
              <th className="px-2 py-1 text-left font-medium">Nom</th>
              <th className="px-2 py-1 text-left font-medium">Prenom</th>
              <th className="px-2 py-1 text-left font-medium">Email</th>
              <th className="px-2 py-1 text-left font-medium">Tel</th>
              <th className="px-2 py-1 text-left font-medium">Ville</th>
              <th className="px-2 py-1 text-right font-medium">Lots</th>
              {editing && <th className="px-2 py-1" />}
            </tr>
          </thead>
          <tbody>
            {(editing ? rows : seed()).map((r) => (
              <tr key={r.id} className="border-t border-line align-top">
                {editing && (
                  <td className="px-2 py-1">
                    <input type="checkbox" checked={selection.includes(r.id)} onChange={() => toggleSel(r.id)} aria-label={`Selectionner ${r.nom} pour fusion`} />
                  </td>
                )}
                {editing ? (
                  <>
                    <td className="px-2 py-1">
                      <select value={r.civilite} onChange={(e) => set(r.id, "civilite", e.target.value)} className={cn(inputCls, "w-20")}>
                        {CIVILITES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1"><input value={r.nom} onChange={(e) => set(r.id, "nom", e.target.value)} className={cn(inputCls, "w-32")} /></td>
                    <td className="px-2 py-1"><input value={r.prenom} onChange={(e) => set(r.id, "prenom", e.target.value)} className={cn(inputCls, "w-28")} /></td>
                    <td className="px-2 py-1"><input value={r.email} onChange={(e) => set(r.id, "email", e.target.value)} className={cn(inputCls, "w-40")} /></td>
                    <td className="px-2 py-1"><input value={r.telPortable} onChange={(e) => set(r.id, "telPortable", e.target.value)} className={cn(inputCls, "w-28 font-mono")} /></td>
                    <td className="px-2 py-1"><input value={r.adrVille} onChange={(e) => set(r.id, "adrVille", e.target.value)} className={cn(inputCls, "w-28")} /></td>
                    <td className="px-2 py-1 text-right font-mono text-ink-3">{nbLotsPar.get(r.id) ?? 0}</td>
                    <td className="px-2 py-1 text-right">
                      <button type="button" onClick={() => setSuppression({ id: r.id, vers: autres(r.id)[0]?.id ?? "" })} className="text-ink-4 hover:text-err-700" aria-label={`Supprimer ${r.nom}`}>
                        <Trash2 strokeWidth={1.5} className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-2 py-1 text-ink-2">{r.civilite}</td>
                    <td className="px-2 py-1 text-ink">{r.nom}</td>
                    <td className="px-2 py-1 text-ink-2">{r.prenom}</td>
                    <td className="px-2 py-1 text-ink-2 truncate max-w-[12rem]">{r.email}</td>
                    <td className="px-2 py-1 font-mono text-ink-2">{r.telPortable}</td>
                    <td className="px-2 py-1 text-ink-2">{r.adrVille}</td>
                    <td className="px-2 py-1 text-right font-mono text-ink-3">{nbLotsPar.get(r.id) ?? 0}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Suppression d'un owner : reattribution obligatoire s'il porte des lots. */}
      {editing && suppression && (
        <div className="mt-2 rounded border border-err-500/40 bg-err-50 p-2 text-[12px]">
          {(() => {
            const o = jeu.owners.find((x) => x.id === suppression.id);
            const nbLots = nbLotsPar.get(suppression.id) ?? 0;
            return (
              <>
                <div className="font-medium text-err-700">Supprimer {o ? nomOwner(o) : suppression.id} ?</div>
                {nbLots > 0 ? (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-ink-2">
                    <span>{nbLots} lot(s) : reattribuer a</span>
                    <select value={suppression.vers} onChange={(e) => setSuppression({ id: suppression.id, vers: e.target.value })} className={cn(inputCls, "w-44")}>
                      {autres(suppression.id).map((a) => <option key={a.id} value={a.id}>{nomOwner(a)}</option>)}
                    </select>
                  </div>
                ) : (
                  <div className="mt-1 text-ink-3">Ce coproprietaire n&apos;a aucun lot.</div>
                )}
                <div className="mt-2 flex gap-2">
                  <Button type="button" variant="ghost" onClick={() => setSuppression(null)} disabled={pending}>Annuler</Button>
                  <Button type="button" variant="danger" onClick={confirmerSuppression} disabled={pending || (nbLots > 0 && !suppression.vers)}>
                    Supprimer
                  </Button>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {editing && <AjouterOwner appliquer={appliquer} pending={pending} jeu={jeu} />}
    </div>
  );
}

function AjouterOwner({
  appliquer,
  pending,
  jeu,
}: {
  appliquer: (c: Correction[], msg: string, apres?: () => void) => void;
  pending: boolean;
  jeu: JeuDeDonnees;
}) {
  const [civilite, setCivilite] = useState<Civilite>("m");
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [lotsSaisis, setLotsSaisis] = useState("");

  const existingIds = jeu.owners.map((o) => o.id);
  const numerosConnus = new Set(jeu.lots.map((l) => l.numero));

  // Lots a rattacher (cas comptable : l'ancien syndic avait plusieurs comptes 450 pour une
  // meme personne / une identite manquante -> on cree le coproprietaire ET ses attributions
  // en UN geste transactionnel). Saisie "3, 115, 124" ; lots inconnus refuses avant envoi.
  const lots = lotsSaisis
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((s) => Number(s));
  const lotsInvalides = lots.filter((n) => !Number.isInteger(n) || !numerosConnus.has(n));

  const ajouter = () => {
    if (nom.trim() === "" || lotsInvalides.length > 0) return;
    // Identifiant interne stable, unique : suffixe incremental sur "manuel".
    let n = 1;
    let id = `manuel-${n}`;
    while (existingIds.includes(id)) id = `manuel-${++n}`;
    const corrections: Correction[] = [
      { type: "owner.ajouter", owner: { id, civilite, nom: nom.trim(), ...(prenom.trim() ? { prenom: prenom.trim() } : {}), pro: false } },
      // Sequentiel et transactionnel : l'owner existe quand les attributions sont validees.
      ...lots.map((numero): Correction => ({ type: "attribution.ajouter", lot: numero, ownerId: id })),
    ];
    appliquer(
      corrections,
      lots.length > 0 ? `Coproprietaire ajoute + ${lots.length} lot(s) rattache(s).` : "Coproprietaire ajoute.",
      () => {
        setNom("");
        setPrenom("");
        setLotsSaisis("");
      },
    );
  };

  return (
    <div className="mt-2 flex flex-wrap items-end gap-2 rounded border border-dashed border-line bg-surface-2 p-2">
      <span className="text-[11px] font-medium text-ink-3 w-full">
        Ajouter un coproprietaire (et rattacher ses lots en un geste)
      </span>
      <select value={civilite} onChange={(e) => setCivilite(e.target.value as Civilite)} className={cn(inputCls, "w-20")}>
        {CIVILITES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="NOM" className={cn(inputCls, "w-32")} />
      <input value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder="Prenom" className={cn(inputCls, "w-28")} />
      <input
        value={lotsSaisis}
        onChange={(e) => setLotsSaisis(e.target.value)}
        placeholder="Lots (ex. 3, 115)"
        className={cn(inputCls, "w-32", lotsInvalides.length > 0 && "border-err")}
        title="Numeros de lots a rattacher, separes par des virgules (optionnel)"
      />
      {lotsInvalides.length > 0 && (
        <span className="text-[11px] text-err">Lot(s) inconnu(s) : {lotsInvalides.join(", ")}</span>
      )}
      <Button
        type="button"
        variant="secondary"
        onClick={ajouter}
        disabled={pending || nom.trim() === "" || lotsInvalides.length > 0}
      >
        <Plus strokeWidth={1.5} className="w-3.5 h-3.5" /> Ajouter
      </Button>
    </div>
  );
}

// --- ATTRIBUTIONS (reattacher un lot a un autre owner) ----------------------

function AttributionsEditor({
  dossierRef,
  jeu,
  onApplied,
}: {
  dossierRef: string;
  jeu: JeuDeDonnees;
  onApplied: (jeu: JeuDeDonnees, recap: RecapPatrimoine) => void;
}) {
  const { appliquer, pending } = useAppliquer(dossierRef, onApplied);
  const [lot, setLot] = useState("");
  const [vers, setVers] = useState("");

  const nomPar = new Map(jeu.owners.map((o) => [o.id, nomOwner(o)]));
  const attributions = [...jeu.attributions].sort((a, b) => a.lot - b.lot);

  const reattacher = () => {
    const n = Number(lot);
    if (!Number.isInteger(n) || !vers) return;
    const cibles = jeu.attributions.filter((a) => a.lot === n);
    const corr: Correction =
      cibles.length === 1
        ? { type: "attribution.reattacher", lot: n, versOwnerId: vers, deOwnerId: cibles[0]!.ownerId }
        : cibles.length === 0
          ? { type: "attribution.ajouter", ownerId: vers, lot: n }
          : { type: "attribution.reattacher", lot: n, versOwnerId: vers, deOwnerId: cibles[0]!.ownerId };
    appliquer([corr], `Lot ${n} rattache.`, () => {
      setLot("");
      setVers("");
    });
  };

  const supprimer = (ownerId: string, lotNum: number) =>
    appliquer([{ type: "attribution.supprimer", ownerId, lot: lotNum }], `Attribution retiree (lot ${lotNum}).`);

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2 rounded border border-dashed border-line bg-surface-2 p-2">
        <span className="text-[11px] font-medium text-ink-3 w-full">Rattacher un lot a un coproprietaire</span>
        <input value={lot} onChange={(e) => setLot(e.target.value)} placeholder="N° lot" inputMode="numeric" className={cn(inputCls, "w-20 font-mono")} />
        <select value={vers} onChange={(e) => setVers(e.target.value)} className={cn(inputCls, "w-52")}>
          <option value="">- coproprietaire -</option>
          {jeu.owners.map((o) => <option key={o.id} value={o.id}>{nomOwner(o)}</option>)}
        </select>
        <Button type="button" variant="secondary" onClick={reattacher} disabled={pending || lot.trim() === "" || vers === ""}>
          <Check strokeWidth={1.5} className="w-3.5 h-3.5" /> Rattacher
        </Button>
      </div>

      <div className="mt-2 max-h-80 overflow-auto rounded border border-line">
        <table className="w-full text-[12.5px]">
          <thead className="sticky top-0 bg-surface-2 text-[10.5px] uppercase text-ink-4">
            <tr>
              <th className="px-2 py-1 text-left font-medium">Lot</th>
              <th className="px-2 py-1 text-left font-medium">Coproprietaire</th>
              <th className="px-2 py-1" />
            </tr>
          </thead>
          <tbody>
            {attributions.map((a) => (
              <tr key={`${a.lot}#${a.ownerId}`} className="border-t border-line">
                <td className="px-2 py-1 font-mono text-ink-2">{a.lot}</td>
                <td className="px-2 py-1 text-ink">{nomPar.get(a.ownerId) ?? a.ownerId}</td>
                <td className="px-2 py-1 text-right">
                  <button type="button" onClick={() => supprimer(a.ownerId, a.lot)} className="text-ink-4 hover:text-err-700" aria-label={`Retirer l'attribution du lot ${a.lot}`}>
                    <Trash2 strokeWidth={1.5} className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
