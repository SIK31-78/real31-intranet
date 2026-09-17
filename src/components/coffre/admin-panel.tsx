"use client";

import { useState } from "react";
import { Shield } from "lucide-react";
import { definirAdminAction } from "@/app/coffre/actions";
import type { CollaborateurAnnuaire } from "@/lib/domain/coffre";
import { Button } from "@/components/ui/button";

// --- Administration : gouvernance des roles (admins globaux) ---------------

export function AdminPanel({
  annuaire,
  monUserId,
  onErreur,
}: {
  annuaire: CollaborateurAnnuaire[];
  monUserId: string;
  onErreur: (e: string | null) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [liste, setListe] = useState(annuaire);
  const [busy, setBusy] = useState(false);

  async function basculer(a: CollaborateurAnnuaire) {
    onErreur(null);
    setBusy(true);
    try {
      await definirAdminAction(a.id, !a.estAdmin);
      setListe((prev) => prev.map((x) => (x.id === a.id ? { ...x, estAdmin: !a.estAdmin } : x)));
    } catch (e) {
      onErreur((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!ouvert) {
    return (
      <Button
        onClick={() => setOuvert(true)}
        variant="secondary" size="lg"
      >
        <Shield className="w-3.5 h-3.5" strokeWidth={1.5} /> Administration
      </Button>
    );
  }
  return (
    <div className="border border-line rounded-lg bg-surface">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-line">
        <span className="text-body font-medium text-ink flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-green-700" strokeWidth={1.5} /> Administration - roles
        </span>
        <Button onClick={() => setOuvert(false)} variant="ghost">
          Fermer
        </Button>
      </div>
      <ul className="divide-y divide-line">
        {liste.map((a) => (
          <li key={a.id} className="px-4 py-2 flex items-center justify-between text-body">
            <span className="text-ink">
              {a.nomComplet || a.email}
              {a.estAdmin && (
                <span className="ml-1.5 text-meta uppercase tracking-wide text-green-700 bg-green-50 rounded-sm px-1.5 py-0.5">
                  admin
                </span>
              )}
            </span>
            <Button
              onClick={() => basculer(a)}
              disabled={busy || (a.id === monUserId && a.estAdmin)}
              variant="ghost"
            >
              {a.estAdmin ? "Retirer admin" : "Promouvoir admin"}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
