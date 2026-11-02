"use client";

// « Pour BPO » (02/11/2026, Emmanuel) : choisir une ou plusieurs pièces jointes du mail et les
// déposer dans le dossier SharePoint de dépôt des factures Crypto pour BPO
// (Compta/<LGC|ML>/<année>/<mois>/<JJ-MM>/<initiales>). Le dossier daté est calculé par le
// serveur (le jour même s'il existe, sinon le prochain ; jamais un passé ni un « BPO OK ») ; on
// choisit seulement le sous-dossier d'initiales parmi ceux qui existent. Copro ESTALE : on le
// dit, et il faut cocher « déposer quand même ». Repliable : fermé par défaut.

import { useState } from "react";
import { FolderInput } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { PieceJointeRef } from "@/lib/domain/mes-emails";
import type { CibleBpo } from "@/lib/domain/depot-bpo";
import { cibleBpoAction, deposerBpoAction } from "@/app/mes-emails/actions-bpo";

export function PourBpo({ boite, emailId, coproCode, piecesJointes }: { boite: string; emailId: string; coproCode: string; piecesJointes: PieceJointeRef[] }) {
  const toast = useToast();
  const [ouvert, setOuvert] = useState(false);
  const [cible, setCible] = useState<CibleBpo | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [choisies, setChoisies] = useState<Set<string>>(() => new Set(piecesJointes.map((p) => p.id)));
  const [sousDossier, setSousDossier] = useState("");
  const [malgreEstale, setMalgreEstale] = useState(false);
  const [enCours, setEnCours] = useState(false);

  async function ouvrir() {
    setOuvert(true);
    setErreur(null);
    const r = await cibleBpoAction({ boite, emailId, coproCode });
    if (!r.ok) return void setErreur(r.erreur);
    setCible(r.donnees!);
    setSousDossier(r.donnees!.parDefaut ?? "");
  }

  async function deposer() {
    if (!cible || enCours) return;
    setEnCours(true);
    const r = await deposerBpoAction({ boite, emailId, coproCode, pjIds: [...choisies], sousDossier, confirmeEstale: malgreEstale });
    setEnCours(false);
    if (!r.ok) return void toast.err(r.erreur);
    const { pieces, dossier } = r.donnees!;
    const ratees = pieces.filter((p) => !p.depose);
    if (ratees.length) toast.err(`${ratees.length} pièce${ratees.length > 1 ? "s" : ""} non déposée${ratees.length > 1 ? "s" : ""} : ${ratees.map((p) => `${p.nom} (${p.detail ?? "échec"})`).join(", ")}`);
    const ok = pieces.length - ratees.length;
    if (ok) toast.ok(`${ok} pièce${ok > 1 ? "s" : ""} déposée${ok > 1 ? "s" : ""} dans ${dossier}.`);
    if (!ratees.length) setOuvert(false);
  }

  if (!ouvert) {
    return (
      <button type="button" onClick={() => void ouvrir()} className="mt-2 ml-3 inline-flex items-center gap-1 text-meta text-ink-3 hover:text-ink underline">
        <FolderInput strokeWidth={1.5} className="w-3.5 h-3.5" />
        Pour BPO
      </button>
    );
  }

  const basculer = (id: string) =>
    setChoisies((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const pret = Boolean(cible && choisies.size > 0 && sousDossier && cible.ecritureActive && (!cible.estale || malgreEstale));

  return (
    <div className="mt-2 rounded-md border border-line bg-surface-2 p-2.5 flex flex-col gap-2 text-meta">
      {erreur ? <Callout ton="warn">{erreur}</Callout> : null}
      {!cible && !erreur ? <span className="text-ink-3">Recherche du dossier de dépôt…</span> : null}
      {cible ? (
        <>
          <div className="text-ink-3">
            Dossier : <span className="font-mono text-ink-2">{cible.dossier}</span>
            {cible.duJour ? " (celui du jour)" : " (pas de dossier aujourd'hui : le prochain)"}
          </div>
          {cible.estale ? (
            <Callout ton="warn">
              Cette copropriété est dans ESTALE : ses factures vont dans ESTALE, pas chez BPO.
              <label className="mt-1 flex items-center gap-1.5">
                <input type="checkbox" checked={malgreEstale} onChange={(e) => setMalgreEstale(e.target.checked)} className="accent-green-700" />
                Déposer quand même
              </label>
            </Callout>
          ) : null}
          {!cible.ecritureActive ? <Callout ton="warn">Le dépôt dans SharePoint n&apos;est pas encore activé : le dossier est lu, rien ne peut y être déposé.</Callout> : null}
          <fieldset className="flex flex-col gap-1">
            <legend className="sr-only">Pièces jointes à déposer</legend>
            {piecesJointes.map((p) => (
              <label key={p.id} className="flex items-center gap-1.5 text-ink-2">
                <input type="checkbox" checked={choisies.has(p.id)} onChange={() => basculer(p.id)} className="accent-green-700" />
                <span className="truncate">{p.nom}</span>
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap items-center gap-2">
            <Select largeur="auto" taille="sm" value={sousDossier} onChange={(e) => setSousDossier(e.target.value)} aria-label="Sous-dossier (initiales)">
              <option value="">{cible.sousDossiers.length ? "Initiales…" : "Aucun sous-dossier"}</option>
              {cible.sousDossiers.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
            {!cible.parDefaut ? <span className="text-ink-3">Pas de dossier à vos initiales : choisissez-en un (il n&apos;est jamais créé).</span> : null}
          </div>
        </>
      ) : null}
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={!pret} loading={enCours} onClick={() => void deposer()}>
          {enCours ? "Dépôt…" : choisies.size > 1 ? `Déposer ${choisies.size} pièces` : "Déposer"}
        </Button>
        <button type="button" onClick={() => setOuvert(false)} className="text-ink-3 hover:text-ink underline">
          Fermer
        </button>
      </div>
    </div>
  );
}
