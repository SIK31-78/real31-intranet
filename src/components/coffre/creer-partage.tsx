"use client";

import { useState } from "react";
import { Plus, Network } from "lucide-react";
import type { ServiceOrg } from "@/lib/domain/coffre";
import { Button } from "@/components/ui/button";
import { Bouton } from "./coffre-ui";
import { champClasse } from "./coffre.utils";

// --- Creation d'un coffre partage (reseau / service) -----------------------

export function CreerPartage({
  services,
  busy,
  onCreer,
}: {
  services: ServiceOrg[];
  busy: boolean;
  onCreer: (scope: "network" | "service", nom: string, serviceId?: string) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [nom, setNom] = useState("");
  const [cible, setCible] = useState("network");

  function creer() {
    const nomFinal = nom.trim() || (cible === "network" ? "Reseau" : services.find((s) => `service:${s.id}` === cible)?.nom || "Service");
    if (cible === "network") onCreer("network", nomFinal);
    else onCreer("service", nomFinal, cible.slice("service:".length));
    setNom("");
    setOuvert(false);
  }

  if (!ouvert) {
    return (
      <Button
        onClick={() => setOuvert(true)}
        variant="secondary" size="lg"
      >
        <Network className="w-3.5 h-3.5" strokeWidth={1.5} /> Creer un coffre partage
      </Button>
    );
  }
  return (
    <div className="border border-line rounded-lg bg-surface px-4 py-3 flex flex-col gap-2">
      <div className="text-body font-medium text-ink">Nouveau coffre partage</div>
      <div className="flex gap-2">
        <select className={champClasse} value={cible} onChange={(e) => setCible(e.target.value)}>
          <option value="network">Reseau (tous les collaborateurs)</option>
          {services.map((s) => (
            <option key={s.id} value={`service:${s.id}`}>
              Service - {s.nom}
            </option>
          ))}
        </select>
        <input className={champClasse} placeholder="Nom (optionnel)" value={nom} onChange={(e) => setNom(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Bouton onClick={creer} busy={busy} label="Creer" icone={Plus} />
        <Button onClick={() => setOuvert(false)} variant="ghost">
          Annuler
        </Button>
      </div>
    </div>
  );
}
