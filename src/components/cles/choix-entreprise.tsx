"use client";

// Choisir une entreprise au comptoir : un champ, la liste filtree (sans accents), et
// « + Nouvelle entreprise » quand elle n'est pas dans la base (nom + tel + mail, dix secondes).

import { useMemo, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { useCombobox } from "@/components/ui/combobox";
import { useToast } from "@/components/ui/toast";
import { normaliserTexte } from "@/lib/domain/cles/normaliser";
import { cn } from "@/lib/cn";
import { creerEntrepriseAction, type EntrepriseChoix } from "@/app/cles/actions";

export function ChoixEntreprise({
  entreprises,
  valeur,
  onChoisir,
  onCreee,
  id = "entreprise",
}: {
  entreprises: EntrepriseChoix[];
  valeur: EntrepriseChoix | null;
  onChoisir: (e: EntrepriseChoix | null) => void;
  onCreee?: (e: EntrepriseChoix) => void;
  id?: string;
}) {
  const toast = useToast();
  const [texte, setTexte] = useState("");
  const [creation, setCreation] = useState(false);
  const [nom, setNom] = useState("");
  const [tel, setTel] = useState("");
  const [mail, setMail] = useState("");
  const [pending, demarrer] = useTransition();

  const resultats = useMemo(() => {
    const q = normaliserTexte(texte);
    if (!q) return [];
    const termes = q.split(" ").filter(Boolean);
    return entreprises.filter((e) => { const f = normaliserTexte(e.nom); return termes.every((t) => f.includes(t)); }).slice(0, 8);
  }, [entreprises, texte]);
  const combobox = useCombobox(resultats, (e) => { onChoisir(e); setTexte(""); }, () => setTexte(""));

  function creer() {
    demarrer(async () => {
      const res = await creerEntrepriseAction({ nom, telephone: tel || undefined, email: mail || undefined });
      if (!res.ok) return toast.err(res.erreur);
      const e: EntrepriseChoix = { id: res.donnees!.entrepriseId, nom: res.donnees!.nom, detenus: 0, enRetard: 0, bloquee: false, contacts: [] };
      onCreee?.(e);
      onChoisir(e);
      setCreation(false);
      setNom(""); setTel(""); setMail("");
      toast.ok(`${e.nom} créée.`);
    });
  }

  if (valeur) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-medium text-ink">{valeur.nom}</span>
        {valeur.bloquee && <Badge ton="err">bloquée</Badge>}
        {valeur.enRetard > 0 ? <Badge ton="err" dot>{valeur.enRetard} en retard</Badge> : valeur.detenus > 0 ? <Badge ton="warn" dot>détient déjà {valeur.detenus}</Badge> : null}
        <Button type="button" variant="ghost" size="sm" onClick={() => onChoisir(null)}>Changer</Button>
      </div>
    );
  }

  if (creation) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-2/40 p-3">
        <Field label="Nom de l'entreprise" htmlFor={`${id}-nom`} requis>
          <Input id={`${id}-nom`} value={nom} onChange={(e) => setNom(e.target.value)} autoFocus autoComplete="off" />
        </Field>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field label="Téléphone" htmlFor={`${id}-tel`}>
            <Input id={`${id}-tel`} value={tel} onChange={(e) => setTel(e.target.value)} inputMode="tel" />
          </Field>
          <Field label="E-mail" htmlFor={`${id}-mail`} hint="Pour la confirmation et les rappels, plus tard.">
            <Input id={`${id}-mail`} value={mail} onChange={(e) => setMail(e.target.value)} inputMode="email" />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setCreation(false)}>Annuler</Button>
          <Button type="button" variant="secondary" size="sm" loading={pending} disabled={nom.trim().length < 2} onClick={creer}>Créer l&apos;entreprise</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input
        id={id}
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        onKeyDown={combobox.onKeyDown}
        {...combobox.input}
        placeholder="Nom de l'entreprise…"
        autoComplete="off"
      />
      {(resultats.length > 0 || texte.trim().length >= 2) && (
        <ul {...combobox.liste} className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-line bg-surface shadow-2 py-1">
          {resultats.map((e, i) => (
            <li
              key={e.id}
              {...combobox.option(i)}
              onMouseDown={(ev) => { ev.preventDefault(); onChoisir(e); setTexte(""); }}
              className={cn("flex items-center gap-2 px-3 min-h-8 py-1 text-body cursor-pointer", i === combobox.actif ? "bg-surface-2" : "hover:bg-surface-2/60")}
            >
              <span className="min-w-0 flex-1 truncate">{e.nom}</span>
              {e.bloquee && <Badge ton="err">bloquée</Badge>}
              {e.enRetard > 0 ? <Badge ton="err" dot>{e.enRetard} en retard</Badge> : e.detenus > 0 ? <Badge ton="warn" dot>détient {e.detenus}</Badge> : null}
            </li>
          ))}
          <li className="px-2 pt-1">
            <button
              type="button"
              onMouseDown={(ev) => { ev.preventDefault(); setNom(texte.trim()); setCreation(true); }}
              className="flex w-full items-center gap-2 rounded-md px-1 min-h-8 text-body text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              <Plus strokeWidth={1.5} className="w-4 h-4" aria-hidden /> Nouvelle entreprise{texte.trim() ? ` « ${texte.trim()} »` : ""}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
