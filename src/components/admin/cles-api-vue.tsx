"use client";

// Vue client du panneau /admin/cles-api : creation (nom + scopes + gestionnaire
// optionnel + expiration optionnelle), affichage du CLAIR une seule fois (avec
// copier), liste des cles, revocation en 2 temps. Les gardes reelles sont serveur
// (actions) - ici on ne fait que guider la saisie.

import { useMemo, useState, useTransition } from "react";
import { Check, Copy, ShieldOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import type { CleApi } from "@/lib/domain/cle-api";
import { creerCle, revoquerCle } from "@/app/admin/cles-api/actions";

const SCOPES: { valeur: string; label: string; aide: string }[] = [
  { valeur: "lecture", label: "Lecture", aide: "Toute la surface GET de /api/v1 (copros, échéances, supervisions, dossiers, compta)." },
  { valeur: "ecriture:supervision", label: "Écriture — supervision", aide: "Cocher un item de supervision AG. Exige une clé liée à un gestionnaire." },
  { valeur: "ecriture:compta", label: "Écriture — note compta", aide: "Poser une note dans le fil compta d'une AG. Exige une clé liée à un gestionnaire." },
];

function jjmmaaaa(iso?: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function etatCle(c: CleApi): { label: string; ton: "ok" | "warn" | "err" } {
  if (c.revokedAt) return { label: "Révoquée", ton: "err" };
  if (c.expiresAt && c.expiresAt <= new Date().toISOString()) return { label: "Expirée", ton: "warn" };
  return { label: "Active", ton: "ok" };
}

export function ClesApiVue({
  cles,
  gestionnaires,
  apiNonConfiguree,
}: {
  cles: CleApi[];
  gestionnaires: { id: string; nom: string }[];
  apiNonConfiguree: boolean;
}) {
  const [nom, setNom] = useState("");
  const [scopes, setScopes] = useState<string[]>(["lecture"]);
  const [managerId, setManagerId] = useState("");
  const [expireLe, setExpireLe] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  // Le CLAIR, montre UNE fois apres creation (jamais re-affichable ensuite).
  const [cleneuve, setCleneuve] = useState<{ clair: string; nom: string } | null>(null);
  const [copie, setCopie] = useState(false);
  // Revocation 2 temps : 1er clic arme ("Confirmer ?"), 2e clic revoque.
  const [revocationArmee, setRevocationArmee] = useState<string | null>(null);
  const [enCours, startTransition] = useTransition();

  const nomsGestionnaires = useMemo(() => new Map(gestionnaires.map((g) => [g.id, g.nom])), [gestionnaires]);
  const ecritureSansGestionnaire = scopes.some((s) => s.startsWith("ecriture:")) && !managerId;

  function basculerScope(valeur: string) {
    setScopes((prev) => (prev.includes(valeur) ? prev.filter((s) => s !== valeur) : [...prev, valeur]));
  }

  function soumettre() {
    setErreur(null);
    startTransition(async () => {
      const r = await creerCle({
        nom,
        scopes,
        ...(managerId ? { managerId } : {}),
        ...(expireLe ? { expireLe } : {}),
      });
      if (!r.ok) {
        setErreur(r.message);
        return;
      }
      setCleneuve({ clair: r.cleEnClair, nom: r.enregistrement.nom });
      setCopie(false);
      setNom("");
      setScopes(["lecture"]);
      setManagerId("");
      setExpireLe("");
    });
  }

  async function copier(clair: string) {
    try {
      await navigator.clipboard.writeText(clair);
      setCopie(true);
    } catch {
      // Presse-papier indisponible : la cle reste affichee, copiable a la main.
    }
  }

  function revoquer(id: string) {
    if (revocationArmee !== id) {
      setRevocationArmee(id);
      return;
    }
    setRevocationArmee(null);
    startTransition(async () => {
      const r = await revoquerCle({ id });
      if (!r.ok && r.message) setErreur(r.message);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {apiNonConfiguree && (
        <div className="border border-warn-500/40 bg-warn-50 text-warn-700 text-[13px] rounded-md px-4 py-3">
          La table <code className="font-mono">intranet_api_keys</code> n&apos;existe pas encore : passe le script{" "}
          <code className="font-mono">supabase/sql/intranet_api_keys.sql</code> dans le SQL editor Supabase.
          En attendant, l&apos;API répond 503 et la création échouera.
        </div>
      )}

      {cleneuve && (
        <div className="border border-green-600/40 bg-green-50 rounded-md px-4 py-3">
          <div className="text-[13px] font-medium text-green-700 mb-1">
            Clé « {cleneuve.nom} » créée — copie-la MAINTENANT, elle ne sera plus jamais affichée.
          </div>
          <div className="flex items-center gap-2">
            <code className="font-mono text-[12.5px] bg-surface border border-line rounded px-2 py-1 break-all select-all">
              {cleneuve.clair}
            </code>
            <Button size="sm" onClick={() => copier(cleneuve.clair)}>
              {copie ? <Check /> : <Copy />}
              {copie ? "Copiée" : "Copier"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCleneuve(null)}>
              J&apos;ai fini
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Créer une clé</CardTitle>
        </CardHeader>
        <div className="px-4 py-4 flex flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-[12px] text-ink-2">
              Nom de la clé
              <input
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder="ex. MCP poste Sekou"
                maxLength={120}
                className="h-8 w-[240px] px-2 text-[13px] text-ink bg-surface border border-line rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
              />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-ink-2">
              Gestionnaire lié (optionnel)
              <select
                value={managerId}
                onChange={(e) => setManagerId(e.target.value)}
                className="h-8 w-[240px] px-2 text-[13px] text-ink bg-surface border border-line rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
              >
                <option value="">— Clé cabinet (lecture transverse) —</option>
                {gestionnaires.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nom}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-ink-2">
              Expire le (optionnel)
              <input
                type="date"
                value={expireLe}
                onChange={(e) => setExpireLe(e.target.value)}
                className="h-8 w-[160px] px-2 text-[13px] text-ink bg-surface border border-line rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
              />
            </label>
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-[12px] text-ink-2 mb-1">Scopes</legend>
            {SCOPES.map((s) => (
              <label key={s.valeur} className="flex items-start gap-2 text-[13px] text-ink cursor-pointer">
                <input
                  type="checkbox"
                  checked={scopes.includes(s.valeur)}
                  onChange={() => basculerScope(s.valeur)}
                  className="mt-0.5 accent-green-700"
                />
                <span>
                  <span className="font-medium">{s.label}</span>
                  <span className="block text-[12px] text-ink-3">{s.aide}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {ecritureSansGestionnaire && (
            <div className="text-[12.5px] text-warn-700">
              Un scope d&apos;écriture exige une clé liée à un gestionnaire : choisis le gestionnaire que la machine incarnera.
            </div>
          )}
          {erreur && <div className="text-[12.5px] text-err-700">{erreur}</div>}

          <div>
            <Button
              variant="primary"
              disabled={enCours || !nom.trim() || scopes.length === 0 || ecritureSansGestionnaire}
              onClick={soumettre}
            >
              Créer la clé
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clés existantes ({cles.length})</CardTitle>
        </CardHeader>
        {cles.length === 0 ? (
          <div className="px-4 py-6 text-[13px] text-ink-3">Aucune clé pour l&apos;instant.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11.5px] uppercase tracking-wide text-ink-3 border-b border-line">
                  <th className="px-4 py-2 font-medium">Clé</th>
                  <th className="px-4 py-2 font-medium">Scopes</th>
                  <th className="px-4 py-2 font-medium">Gestionnaire</th>
                  <th className="px-4 py-2 font-medium">Expire</th>
                  <th className="px-4 py-2 font-medium">Dernier usage</th>
                  <th className="px-4 py-2 font-medium">Usage du jour</th>
                  <th className="px-4 py-2 font-medium">État</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {cles.map((c) => {
                  const etat = etatCle(c);
                  return (
                    <tr key={c.id} className="border-b border-line last:border-0 align-top">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-ink">{c.nom}</div>
                        <div className="font-mono text-[12px] text-ink-3">{c.prefixe}…</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {c.scopes.map((s) => (
                            <Badge key={s} ton={s.startsWith("ecriture:") ? "warn" : "neutral"}>
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-ink-2">
                        {c.managerId ? (nomsGestionnaires.get(c.managerId) ?? c.managerId) : "Cabinet (lecture)"}
                      </td>
                      <td className="px-4 py-2.5 text-ink-2">{jjmmaaaa(c.expiresAt)}</td>
                      <td className="px-4 py-2.5 text-ink-2">{jjmmaaaa(c.lastUsedAt)}</td>
                      <td className="px-4 py-2.5 text-ink-2 tabular-nums">
                        {c.usageJourDate === new Date().toISOString().slice(0, 10) ? c.usageJour : 0}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge ton={etat.ton} dot>
                          {etat.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {!c.revokedAt && (
                          <Button
                            size="sm"
                            variant={revocationArmee === c.id ? "danger" : "ghost"}
                            disabled={enCours}
                            onClick={() => revoquer(c.id)}
                            onBlur={() => setRevocationArmee((a) => (a === c.id ? null : a))}
                          >
                            <ShieldOff />
                            {revocationArmee === c.id ? "Confirmer ?" : "Révoquer"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
