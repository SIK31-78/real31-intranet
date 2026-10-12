"use client";

// Résultats de l'écran « Échanges » : la liste (du plus récent au plus ancien) et, au clic,
// le mail complet avec ses pièces jointes. Lecture seule ; on répond depuis Outlook.

import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, ExternalLink, Paperclip, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { VisionneusePj, type ApercuPj } from "@/components/mes-emails/visionneuse-pj";
import { sensDe, type EchangeTrouve, type Sens } from "@/lib/domain/echanges";
import type { PieceJointeRef } from "@/lib/domain/mes-emails";
import { lireEchangeAction, lirePieceJointeEchangeAction, listerPiecesJointesEchangeAction } from "@/app/echanges/actions";

const SENS: Record<Sens, { libelle: string; Icone: typeof ArrowDownLeft; ton: "info" | "ok" | "neutral" }> = {
  recu: { libelle: "Reçu", Icone: ArrowDownLeft, ton: "info" },
  envoye: { libelle: "Envoyé", Icone: ArrowUpRight, ton: "ok" },
  interne: { libelle: "Interne", Icone: Users, ton: "neutral" },
};

const date = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

const taille = (o: number) => (o > 1_000_000 ? `${(o / 1_000_000).toFixed(1)} Mo` : `${Math.max(1, Math.round(o / 1000))} Ko`);

export function EchangesVue({ echanges, plusieursBoites }: { echanges: EchangeTrouve[]; plusieursBoites: boolean }) {
  const [choisi, setChoisi] = useState<EchangeTrouve | null>(echanges[0] ?? null);
  if (echanges.length === 0) return <EmptyState>Aucun échange ne correspond à cette recherche.</EmptyState>;

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] items-start">
      <ul className="flex flex-col rounded-lg border border-line bg-surface divide-y divide-line overflow-hidden">
        {echanges.map((e) => {
          const s = SENS[sensDe(e)];
          const actif = choisi?.boite === e.boite && choisi.id === e.id;
          const qui = sensDe(e) === "envoye" ? `À ${e.a.join(", ") || "?"}` : e.deNom || e.deAdresse;
          return (
            <li key={`${e.boite}|${e.id}`}>
              <button
                type="button"
                onClick={() => setChoisi(e)}
                aria-current={actif}
                className={`w-full flex flex-col gap-0.5 px-3 py-2 text-left hover:bg-surface-2 ${actif ? "bg-surface-2" : ""}`}
              >
                <span className="flex items-center gap-2 text-meta text-ink-3">
                  <s.Icone strokeWidth={1.5} className="w-3.5 h-3.5" aria-hidden="true" />
                  {s.libelle} · {date(e.date)}
                  {plusieursBoites && <span className="truncate">· {e.boite}</span>}
                  {e.aPiecesJointes && <Paperclip strokeWidth={1.5} className="w-3.5 h-3.5 ml-auto" aria-label="Pièces jointes" />}
                </span>
                <span className="text-body text-ink truncate">{e.objet}</span>
                <span className="text-meta text-ink-2 truncate">{qui}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {choisi && <Detail key={`${choisi.boite}|${choisi.id}`} e={choisi} />}
    </div>
  );
}

function Detail({ e }: { e: EchangeTrouve }) {
  const [corps, setCorps] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const s = SENS[sensDe(e)];

  useEffect(() => {
    let actif = true;
    lireEchangeAction({ boite: e.boite, id: e.id }).then((r) => {
      if (!actif) return;
      if (r.ok) setCorps(r.donnees ?? "");
      else setErreur(r.erreur);
    });
    return () => {
      actif = false;
    };
  }, [e.boite, e.id]);

  return (
    <article className="rounded-lg border border-line bg-surface p-4 flex flex-col gap-2 lg:sticky lg:top-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge ton={s.ton}>{s.libelle}</Badge>
        <span className="text-meta text-ink-3">{date(e.date)} · {e.boite}</span>
        {e.lienOutlook && (
          <a href={e.lienOutlook} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-meta text-green-700 hover:underline">
            Ouvrir dans Outlook <ExternalLink strokeWidth={1.5} className="w-3.5 h-3.5" aria-hidden="true" />
          </a>
        )}
      </div>
      <h2 className="text-title text-ink">{e.objet}</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-meta">
        <dt className="text-ink-3">De</dt>
        <dd className="text-ink-2 break-all">{e.deNom && e.deNom !== e.deAdresse ? `${e.deNom} <${e.deAdresse}>` : e.deAdresse}</dd>
        <dt className="text-ink-3">À</dt>
        <dd className="text-ink-2 break-all">{e.a.join(", ") || "—"}</dd>
        {e.cc.length > 0 && (
          <>
            <dt className="text-ink-3">Cc</dt>
            <dd className="text-ink-2 break-all">{e.cc.join(", ")}</dd>
          </>
        )}
      </dl>
      <div className="max-h-[45vh] overflow-y-auto whitespace-pre-wrap text-body text-ink border-t border-line pt-2">
        {erreur ? <span className="text-err-700">{erreur}</span> : corps === null ? <span className="text-ink-3">Chargement…</span> : corps.trim() || e.apercu}
      </div>
      {e.aPiecesJointes && <PiecesJointes boite={e.boite} internetMessageId={e.internetMessageId} />}
    </article>
  );
}

function PiecesJointes({ boite, internetMessageId }: { boite: string; internetMessageId: string }) {
  const [pieces, setPieces] = useState<PieceJointeRef[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [apercu, setApercu] = useState<ApercuPj | null>(null);
  const [ouverture, setOuverture] = useState<string | null>(null);

  useEffect(() => {
    let actif = true;
    listerPiecesJointesEchangeAction({ boite, internetMessageId }).then((r) => {
      if (!actif) return;
      if (r.ok) setPieces(r.donnees ?? []);
      else setErreur(r.erreur);
    });
    return () => {
      actif = false;
    };
  }, [boite, internetMessageId]);

  // L'URL objet du blob est libérée à la fermeture de l'aperçu.
  useEffect(() => () => {
    if (apercu) URL.revokeObjectURL(apercu.url);
  }, [apercu]);

  async function ouvrir(pj: PieceJointeRef) {
    setOuverture(pj.id);
    const r = await lirePieceJointeEchangeAction({ boite, internetMessageId, attachmentId: pj.id });
    setOuverture(null);
    if (!r.ok || !r.donnees) {
      setErreur(r.ok ? "Pièce jointe vide." : r.erreur);
      return;
    }
    const octets = Uint8Array.from(atob(r.donnees.base64), (c) => c.charCodeAt(0));
    const type = r.donnees.type || "application/octet-stream";
    setApercu({ nom: r.donnees.nom, type, url: URL.createObjectURL(new Blob([octets], { type })) });
  }

  return (
    <div className="flex flex-col gap-1.5 border-t border-line pt-2">
      <span className="inline-flex items-center gap-1.5 text-meta text-ink-3">
        <Paperclip strokeWidth={1.5} className="w-3.5 h-3.5" aria-hidden="true" />
        Pièces jointes
      </span>
      {erreur && <span className="text-meta text-err-700">{erreur}</span>}
      {pieces === null && !erreur && <span className="text-meta text-ink-3">Chargement…</span>}
      {pieces?.length === 0 && <span className="text-meta text-ink-3">Aucune à afficher ici : voir dans Outlook.</span>}
      {pieces && pieces.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {pieces.map((pj) => (
            <button
              key={pj.id}
              type="button"
              disabled={ouverture !== null}
              onClick={() => ouvrir(pj)}
              className="inline-flex items-center gap-2 rounded-lg border border-line-2 bg-surface px-2.5 py-1 text-body hover:bg-surface-2 disabled:opacity-60"
            >
              <span className="text-ink truncate max-w-[260px]">{pj.nom}</span>
              <span className="text-meta text-ink-3 tabular-nums">{ouverture === pj.id ? "ouverture…" : taille(pj.taille)}</span>
            </button>
          ))}
        </div>
      )}
      <VisionneusePj apercu={apercu} onFermer={() => setApercu(null)} />
    </div>
  );
}
