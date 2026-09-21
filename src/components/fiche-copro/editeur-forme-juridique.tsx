"use client";

// La forme juridique dans le bloc Identite : un selecteur qui ecrit dans App A a la
// selection. Copropriete, ASL ou AFUL : c'est ce qui choisit le contrat de syndic ou le
// contrat de mandat du gestionnaire (Sekou, 21/09/2026).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { FORMES_JURIDIQUES, libelleFormeJuridique, type FormeJuridique } from "@/lib/domain/copropriete";
import { changerFormeJuridiqueAction } from "@/app/copropriete/actions";

export function EditeurFormeJuridique({ coproCode, forme }: { coproCode: string; forme: FormeJuridique }) {
  const router = useRouter();
  const toast = useToast();
  const [valeur, setValeur] = useState<FormeJuridique>(forme);
  const [pending, demarrer] = useTransition();

  function changer(nouvelle: FormeJuridique) {
    const avant = valeur;
    setValeur(nouvelle);
    demarrer(async () => {
      const res = await changerFormeJuridiqueAction({ coproCode, forme: nouvelle });
      if (!res.ok) {
        setValeur(avant);
        return toast.err(res.erreur);
      }
      toast.ok(`Forme juridique : ${libelleFormeJuridique(nouvelle)}.`);
      router.refresh();
    });
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <Select
        aria-label="Forme juridique"
        largeur="auto"
        value={valeur}
        disabled={pending}
        onChange={(e) => changer(e.target.value as FormeJuridique)}
        className="h-7 py-0 text-body"
      >
        {FORMES_JURIDIQUES.map((f) => (
          <option key={f} value={f}>{libelleFormeJuridique(f)}</option>
        ))}
      </Select>
      {pending && <Loader2 strokeWidth={1.5} className="w-3.5 h-3.5 animate-spin text-ink-3" />}
    </span>
  );
}
