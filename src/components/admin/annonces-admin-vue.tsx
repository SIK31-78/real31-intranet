"use client";

// Vue client du panneau /admin/annonces. Creation (modale), edition inline (titre/corps/
// niveau au blur), (dés)activation et suppression (2 temps). Les gardes reelles sont
// serveur (actions super-admin). Une annonce active s'affiche sur l'accueil de tous.

import { useState, useTransition } from "react";
import { Plus, Megaphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { NIVEAUX_ANNONCE, type Annonce, type NiveauAnnonce } from "@/lib/domain/annonce";
import {
  creerAnnonceAction,
  patchAnnonceAction,
  supprimerAnnonceAction,
} from "@/app/admin/annonces/actions";

const LABEL_NIVEAU: Record<NiveauAnnonce, string> = { info: "Info", important: "Important" };

function jjmmaaaa(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

const champCls =
  "h-8 rounded-md border border-line bg-surface px-2 text-[13px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600";

function LigneAnnonce({ a }: { a: Annonce }) {
  const { ok, err } = useToast();
  const [enCours, start] = useTransition();
  const [titre, setTitre] = useState(a.titre);
  const [corps, setCorps] = useState(a.corps ?? "");
  const [confirmSuppr, setConfirmSuppr] = useState(false);

  function patch(p: Record<string, unknown>, libelle: string) {
    start(async () => {
      const r = await patchAnnonceAction({ id: a.id, ...p });
      if (r.ok) ok(libelle);
      else err(r.message ?? "Modification impossible.");
    });
  }

  function supprimer() {
    if (!confirmSuppr) {
      setConfirmSuppr(true);
      return;
    }
    start(async () => {
      const r = await supprimerAnnonceAction({ id: a.id });
      if (!r.ok) err(r.message ?? "Suppression impossible.");
    });
  }

  return (
    <Card>
      <div className={`flex flex-col gap-2 px-4 py-3 ${a.actif ? "" : "opacity-60"}`}>
        <div className="flex items-center gap-2">
          <input
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            onBlur={() => {
              const t = titre.trim();
              if (t && t !== a.titre) patch({ titre: t }, "Titre mis à jour");
            }}
            maxLength={160}
            className="flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-[13.5px] font-medium text-ink hover:border-line focus:border-line focus:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
          />
          <select
            value={a.niveau}
            onChange={(e) => patch({ niveau: e.target.value as NiveauAnnonce }, "Niveau mis à jour")}
            disabled={enCours}
            className={champCls}
          >
            {NIVEAUX_ANNONCE.map((n) => (
              <option key={n} value={n}>
                {LABEL_NIVEAU[n]}
              </option>
            ))}
          </select>
          {a.actif ? <Badge ton="ok" dot>Active</Badge> : <Badge ton="neutral">Masquée</Badge>}
        </div>
        <textarea
          value={corps}
          onChange={(e) => setCorps(e.target.value)}
          onBlur={() => {
            if (corps !== (a.corps ?? "")) patch({ corps }, "Texte mis à jour");
          }}
          rows={2}
          maxLength={2000}
          placeholder="Corps (optionnel)…"
          className="w-full resize-y rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] text-ink placeholder:text-ink-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-ink-4">
            {a.auteurInitiales ?? "—"} · {jjmmaaaa(a.createdAt)}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              disabled={enCours}
              onClick={() => patch({ actif: !a.actif }, a.actif ? "Annonce masquée" : "Annonce affichée")}
            >
              {a.actif ? "Masquer" : "Afficher"}
            </Button>
            <Button size="sm" variant="danger" disabled={enCours} onClick={supprimer}>
              {confirmSuppr ? "Confirmer ?" : "Supprimer"}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function FormulaireAnnonce({ onFermer }: { onFermer: () => void }) {
  const { ok, err } = useToast();
  const [enCours, start] = useTransition();
  const [titre, setTitre] = useState("");
  const [corps, setCorps] = useState("");
  const [niveau, setNiveau] = useState<NiveauAnnonce>("info");
  const [actif, setActif] = useState(true);

  function soumettre() {
    const t = titre.trim();
    if (!t) {
      err("Le titre est obligatoire.");
      return;
    }
    start(async () => {
      const r = await creerAnnonceAction({
        titre: t,
        niveau,
        actif,
        ...(corps.trim() ? { corps: corps.trim() } : {}),
      });
      if (r.ok) {
        ok("Annonce publiée");
        onFermer();
      } else {
        err(r.message ?? "Création impossible.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3.5 px-4 py-4">
      <label className="flex flex-col gap-1 text-[12px] text-ink-2">
        Titre (obligatoire)
        <input
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          maxLength={160}
          autoFocus
          placeholder="Ex. Fermeture des bureaux le 15/08"
          className="h-8 w-full rounded-md border border-line bg-surface px-2 text-[13px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
        />
      </label>
      <label className="flex flex-col gap-1 text-[12px] text-ink-2">
        Corps (facultatif)
        <textarea
          value={corps}
          onChange={(e) => setCorps(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Le détail de l'annonce…"
          className="w-full resize-y rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] text-ink placeholder:text-ink-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
        />
      </label>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex flex-col gap-1 text-[12px] text-ink-2">
          Niveau
          <select
            value={niveau}
            onChange={(e) => setNiveau(e.target.value as NiveauAnnonce)}
            className={champCls}
          >
            {NIVEAUX_ANNONCE.map((n) => (
              <option key={n} value={n}>
                {LABEL_NIVEAU[n]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[13px] text-ink-2 mt-4">
          <input type="checkbox" checked={actif} onChange={(e) => setActif(e.target.checked)} className="h-4 w-4" />
          Afficher tout de suite sur l&apos;accueil
        </label>
      </div>
      <div className="mt-1 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onFermer} disabled={enCours}>
          Annuler
        </Button>
        <Button size="sm" variant="primary" onClick={soumettre} disabled={enCours || !titre.trim()}>
          Publier l&apos;annonce
        </Button>
      </div>
    </div>
  );
}

export function AnnoncesAdminVue({
  annonces,
  nonConfigure,
}: {
  annonces: Annonce[];
  nonConfigure: boolean;
}) {
  const [ajoutOuvert, setAjoutOuvert] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      {nonConfigure && (
        <div className="rounded-md border border-warn-500/40 bg-warn-50 px-4 py-3 text-[13px] text-warn-700">
          La table <code className="font-mono">intranet_annonces</code> n&apos;existe pas encore : passe le
          script <code className="font-mono">supabase/sql/intranet_annonces.sql</code> dans le SQL editor
          Supabase. En attendant, les annonces ne sont pas enregistrées.
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-[13px] text-ink-3">
          {annonces.length} annonce{annonces.length > 1 ? "s" : ""}
          {annonces.length > 0 ? ` · ${annonces.filter((a) => a.actif).length} active(s)` : ""}
        </p>
        <Button size="sm" variant="primary" onClick={() => setAjoutOuvert(true)} disabled={nonConfigure}>
          <Plus strokeWidth={1.5} className="h-3.5 w-3.5" />
          Ajouter une annonce
        </Button>
      </div>

      {ajoutOuvert && (
        <Modal titre="Nouvelle annonce" onFermer={() => setAjoutOuvert(false)}>
          <FormulaireAnnonce onFermer={() => setAjoutOuvert(false)} />
        </Modal>
      )}

      {annonces.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-1.5 px-4 py-10 text-center">
            <Megaphone strokeWidth={1.5} className="h-5 w-5 text-ink-4" />
            <p className="text-[13px] text-ink-3">Aucune annonce.</p>
            <p className="text-[12px] text-ink-4">« Ajouter une annonce » pour en publier une sur l&apos;accueil.</p>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-2.5">
          {annonces.map((a) => (
            <LigneAnnonce key={a.id} a={a} />
          ))}
        </div>
      )}
    </div>
  );
}
