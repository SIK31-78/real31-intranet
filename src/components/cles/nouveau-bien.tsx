"use client";

// « Nouveau bien » : le petit formulaire en ligne du champ « Copropriété ou bien » (REA-53).
// Un conseiller qui ouvre un mandat crée le bien sans quitter la fiche du trousseau. Le serveur
// relit l'agence, l'auteur et le droit ; la verification metier est celle du domaine.

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { ACTIVITES_BIEN, LIBELLE_ACTIVITE_BIEN, LIBELLE_TYPE_BIEN, TYPES_BIEN, referenceBienCanonique, type ActiviteBien, type TypeBien } from "@/lib/domain/bien";
import { creerBienAction } from "@/app/cles/actions";
import type { BienChoix } from "./formulaire-trousseau";

export function NouveauBien({ agenceCode, referenceInitiale, onCree, onAnnuler }: { agenceCode: string; referenceInitiale: string; onCree: (b: BienChoix) => void; onAnnuler: () => void }) {
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  const [activite, setActivite] = useState<ActiviteBien>("location");
  const [reference, setReference] = useState(referenceBienCanonique(referenceInitiale));
  const [type, setType] = useState<TypeBien>("appartement");
  const [adresse, setAdresse] = useState({ numeroVoie: "", typeVoie: "", nomVoie: "", complement: "", codePostal: "", ville: "" });
  const [proprietaire, setProprietaire] = useState({ nom: "", prenom: "", telephone: "", email: "" });
  const [note, setNote] = useState("");
  const [tente, setTente] = useState(false);
  const [erreur, setErreur] = useState<string | undefined>();

  const pret = reference.trim().length > 0 && proprietaire.nom.trim().length > 0;
  const champAdresse = (k: keyof typeof adresse) => ({ value: adresse[k], onChange: (e: { target: { value: string } }) => setAdresse({ ...adresse, [k]: e.target.value }) });
  const champProprio = (k: keyof typeof proprietaire) => ({ value: proprietaire[k], onChange: (e: { target: { value: string } }) => setProprietaire({ ...proprietaire, [k]: e.target.value }) });

  function enregistrer() {
    setTente(true);
    setErreur(undefined);
    if (!pret) return;
    demarrer(async () => {
      const res = await creerBienAction({ agenceCode, activite, reference, type, adresse, proprietaire, note: note || undefined });
      if (!res.ok) return setErreur(res.erreur);
      const bien = res.donnees as BienChoix;
      toast.ok(`Bien ${bien.reference} créé.`);
      onCree(bien);
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-2/40 p-3" role="group" aria-label="Nouveau bien">
      <p className="text-body font-medium text-ink">Nouveau bien à l&apos;agence {agenceCode}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Activité" htmlFor="nb-activite" requis>
          <Select id="nb-activite" value={activite} onChange={(e) => setActivite(e.target.value as ActiviteBien)}>
            {ACTIVITES_BIEN.map((a) => <option key={a} value={a}>{LIBELLE_ACTIVITE_BIEN[a]}</option>)}
          </Select>
        </Field>
        <Field label="Référence" htmlFor="nb-reference" requis hint="Mise en forme automatique (TRILLOT-18)" erreur={tente && !reference.trim() ? "Obligatoire" : undefined}>
          <Input id="nb-reference" value={reference} onChange={(e) => setReference(e.target.value)} onBlur={() => setReference(referenceBienCanonique(reference))} className="font-mono" autoComplete="off" autoFocus />
        </Field>
        <Field label="Type de bien" htmlFor="nb-type" requis>
          <Select id="nb-type" value={type} onChange={(e) => setType(e.target.value as TypeBien)}>
            {TYPES_BIEN.map((t) => <option key={t} value={t}>{LIBELLE_TYPE_BIEN[t]}</option>)}
          </Select>
        </Field>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-body text-ink-2 mb-1">Adresse</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[5rem_8rem_1fr]">
          <Input {...champAdresse("numeroVoie")} placeholder="N°" aria-label="Numéro" />
          <Input {...champAdresse("typeVoie")} placeholder="rue, avenue…" aria-label="Type de voie" />
          <Input {...champAdresse("nomVoie")} placeholder="Nom de la voie" aria-label="Nom de la voie" />
        </div>
        <Input {...champAdresse("complement")} placeholder="Complément (bâtiment, étage, porte…)" aria-label="Complément d'adresse" />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[8rem_1fr]">
          <Input {...champAdresse("codePostal")} inputMode="numeric" placeholder="Code postal" aria-label="Code postal" />
          <Input {...champAdresse("ville")} placeholder="Ville" aria-label="Ville" />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-body text-ink-2 mb-1">Propriétaire</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field label="Nom" htmlFor="nb-nom" requis erreur={tente && !proprietaire.nom.trim() ? "Obligatoire" : undefined}>
            <Input id="nb-nom" {...champProprio("nom")} autoComplete="off" />
          </Field>
          <Field label="Prénom (facultatif)" htmlFor="nb-prenom">
            <Input id="nb-prenom" {...champProprio("prenom")} autoComplete="off" />
          </Field>
          <Field label="Téléphone (facultatif)" htmlFor="nb-tel">
            <Input id="nb-tel" {...champProprio("telephone")} inputMode="tel" autoComplete="off" />
          </Field>
          <Field label="E-mail (facultatif)" htmlFor="nb-email">
            <Input id="nb-email" {...champProprio("email")} inputMode="email" autoComplete="off" />
          </Field>
        </div>
      </fieldset>

      <Field label="Note (facultatif)" htmlFor="nb-note">
        <Textarea id="nb-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      {erreur && <p className="text-meta text-err-700" role="alert">{erreur}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onAnnuler}>Annuler</Button>
        <Button type="button" variant="primary" loading={pending} onClick={enregistrer}>Créer le bien</Button>
      </div>
    </div>
  );
}
