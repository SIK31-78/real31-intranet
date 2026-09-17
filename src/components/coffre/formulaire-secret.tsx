"use client";

import { Plus } from "lucide-react";
import type { SecretClair } from "@/lib/domain/coffre";
import { Button } from "@/components/ui/button";
import { Bouton } from "./coffre-ui";
import { champClasse } from "./coffre.utils";

// Formulaire d'ajout / modification d'un secret. Le chiffrement et l'enregistrement
// restent dans le panneau du coffre (qui detient la cle).
export function FormulaireSecret({
  edition,
  form,
  onForm,
  busy,
  onEnregistrer,
  onAnnuler,
}: {
  edition: boolean;
  form: SecretClair;
  onForm: (f: SecretClair) => void;
  busy: boolean;
  onEnregistrer: () => void;
  onAnnuler: () => void;
}) {
  return (
    <div className="px-4 py-3 border-t border-line flex flex-col gap-2">
      <div className="text-body font-medium text-ink-2">{edition ? "Modifier le mot de passe" : "Nouveau mot de passe"}</div>
      <input className={champClasse} placeholder="Titre (ex: EDF)" value={form.titre} onChange={(e) => onForm({ ...form, titre: e.target.value })} autoFocus />
      <div className="flex gap-2">
        <input className={champClasse} placeholder="Copropriete" value={form.copropriete ?? ""} onChange={(e) => onForm({ ...form, copropriete: e.target.value })} />
        <input className={champClasse} placeholder="Immeuble" value={form.immeuble ?? ""} onChange={(e) => onForm({ ...form, immeuble: e.target.value })} />
      </div>
      <div className="flex gap-2">
        <input className={champClasse} placeholder="URL" value={form.url} onChange={(e) => onForm({ ...form, url: e.target.value })} />
        <input className={champClasse} placeholder="Identifiant" value={form.login} onChange={(e) => onForm({ ...form, login: e.target.value })} />
      </div>
      <input className={champClasse} placeholder="Mot de passe" value={form.motDePasse} onChange={(e) => onForm({ ...form, motDePasse: e.target.value })} />
      <div className="flex gap-2">
        <Bouton onClick={onEnregistrer} busy={busy} label="Enregistrer" icone={Plus} />
        <Button
          onClick={onAnnuler}
          variant="ghost"
        >
          Annuler
        </Button>
      </div>
    </div>
  );
}
