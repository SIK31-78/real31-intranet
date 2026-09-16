"use client";

// Rattacher une proposition a un immeuble du registre national : les candidats que le
// domaine propose (numero + voie, commune a verifier), sinon une recherche libre. Un clic
// = l'immatriculation devient la cle de l'immeuble (historique, copro App A).

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Search, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatJour } from "@/lib/services/facturation/format";
import type { RegistreCopro } from "@/lib/ports/proposition-repository";
import { detacherPropositionAction, rattacherPropositionAction, rechercherRegistreAction } from "@/app/propositions/actions";

export function CandidatRegistre({ r, sur = false, onChoisir, pending }: { r: RegistreCopro; sur?: boolean; onChoisir: () => void; pending: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <span className="min-w-0 flex flex-col">
        <span className="text-body text-ink truncate">
          {r.adresse}, {r.codePostal} {r.commune}
          {sur && <span className="text-ok-700"> · numéro, voie et commune coïncident</span>}
        </span>
        <span className="text-meta text-ink-3 truncate">
          {r.immatriculation} · {r.lotsPrincipaux ?? "?"} lots principaux · {r.syndicNom ?? "syndic non connu"}
          {r.finMandatISO && ` (mandat jusqu'au ${formatJour(r.finMandatISO)})`}
          {r.adressesCompl.length > 0 && ` · aussi ${r.adressesCompl.slice(0, 2).join(", ")}`}
        </span>
      </span>
      <Button type="button" variant={sur ? "primary" : "secondary"} size="sm" disabled={pending} onClick={onChoisir}>
        <Check strokeWidth={1.5} /> C&apos;est lui
      </Button>
    </li>
  );
}

export function RattacherRegistre({
  propositionId,
  sur,
  candidats,
  apres,
}: {
  propositionId: string;
  sur?: RegistreCopro;
  candidats: RegistreCopro[];
  /** Apres rattachement : rafraichir (fiche) ou retirer la ligne (ecran de rapprochement). */
  apres?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  const [texte, setTexte] = useState("");
  const [resultats, setResultats] = useState<RegistreCopro[]>([]);

  useEffect(() => {
    if (texte.trim().length < 4) return;
    const t = setTimeout(() => {
      rechercherRegistreAction(texte).then((res) => {
        if (res.ok && res.donnees) setResultats(res.donnees);
      });
    }, 300);
    return () => clearTimeout(t);
  }, [texte]);

  function rattacher(immatriculation: string) {
    demarrer(async () => {
      const res = await rattacherPropositionAction({ id: propositionId, immatriculation });
      if (!res.ok) return toast.err(res.erreur);
      toast.ok("Immeuble rattaché au registre.");
      if (apres) apres();
      else router.refresh();
    });
  }

  const dejaVus = new Set(candidats.map((c) => c.immatriculation));
  const autres = resultats.filter((r) => !dejaVus.has(r.immatriculation));

  return (
    <div className="flex flex-col gap-2">
      {candidats.length > 0 && (
        <ul className="divide-y divide-line">
          {candidats.map((c) => (
            <CandidatRegistre key={c.immatriculation} r={c} sur={sur?.immatriculation === c.immatriculation} pending={pending} onChoisir={() => rattacher(c.immatriculation)} />
          ))}
        </ul>
      )}
      <div className="relative">
        <Input
          value={texte}
          onChange={(e) => {
            setTexte(e.target.value);
            if (e.target.value.trim().length < 4) setResultats([]);
          }}
          placeholder={candidats.length > 0 ? "Aucun de ceux-là ? Cherchez une autre adresse…" : "Chercher l'immeuble au registre (numéro, voie, commune)"}
          autoComplete="off"
        />
        <Search strokeWidth={1.5} className="pointer-events-none absolute right-2.5 top-2 h-4 w-4 text-ink-3" />
      </div>
      {autres.length > 0 && (
        <ul className="divide-y divide-line">
          {autres.map((r) => (
            <CandidatRegistre key={r.immatriculation} r={r} pending={pending} onChoisir={() => rattacher(r.immatriculation)} />
          ))}
        </ul>
      )}
      {pending && <Loader2 strokeWidth={1.5} className="h-4 w-4 animate-spin text-ink-3" />}
    </div>
  );
}

export function DetacherRegistre({ propositionId }: { propositionId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        demarrer(async () => {
          const res = await detacherPropositionAction(propositionId);
          if (!res.ok) return toast.err(res.erreur);
          toast.ok("Détachée du registre.");
          router.refresh();
        })
      }
    >
      <Unlink strokeWidth={1.5} /> Mauvais immeuble
    </Button>
  );
}
