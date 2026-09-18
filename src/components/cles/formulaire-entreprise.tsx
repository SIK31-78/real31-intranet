"use client";

// Fiche entreprise : coordonnees, contacts, note, relances. Creation et modification.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea, Choix } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { Contact, Entreprise } from "@/lib/domain/cles/types";
import { creerEntrepriseAction, modifierEntrepriseAction } from "@/app/cles/actions";

export function FormulaireEntreprise({ entreprise, onFermer }: { entreprise?: Entreprise; onFermer?: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  const [nom, setNom] = useState(entreprise?.nom ?? "");
  const [tel, setTel] = useState(entreprise?.telephone ?? "");
  const [mail, setMail] = useState(entreprise?.email ?? "");
  const [ligne1, setLigne1] = useState(entreprise?.adresse?.ligne1 ?? "");
  const [cp, setCp] = useState(entreprise?.adresse?.codePostal ?? "");
  const [ville, setVille] = useState(entreprise?.adresse?.ville ?? "");
  const [note, setNote] = useState(entreprise?.note ?? "");
  const [relances, setRelances] = useState(entreprise?.relances ?? true);
  const [contacts, setContacts] = useState<Contact[]>(entreprise?.contacts ?? []);

  function valider() {
    demarrer(async () => {
      const d = { nom, telephone: tel || undefined, email: mail || undefined, adresse: { ligne1: ligne1 || undefined, codePostal: cp || undefined, ville: ville || undefined }, contacts, note: note || undefined, relances };
      const res = entreprise ? await modifierEntrepriseAction({ ...d, entrepriseId: entreprise.id }) : await creerEntrepriseAction(d);
      if (!res.ok) return toast.err(res.erreur);
      toast.ok(entreprise ? `${nom} mise à jour.` : `${nom} créée.`);
      if (entreprise) { onFermer?.(); router.refresh(); }
      else router.push(`/cles/entreprises/${(res.donnees as { entrepriseId: string }).entrepriseId}`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Nom" htmlFor="ent-nom" requis className="sm:col-span-3">
          <Input id="ent-nom" value={nom} onChange={(e) => setNom(e.target.value)} autoFocus={!entreprise} autoComplete="off" />
        </Field>
        <Field label="Téléphone" htmlFor="ent-tel"><Input id="ent-tel" value={tel} onChange={(e) => setTel(e.target.value)} inputMode="tel" /></Field>
        <Field label="E-mail" htmlFor="ent-mail" className="sm:col-span-2"><Input id="ent-mail" value={mail} onChange={(e) => setMail(e.target.value)} inputMode="email" /></Field>
        <Field label="Adresse" htmlFor="ent-adr"><Input id="ent-adr" value={ligne1} onChange={(e) => setLigne1(e.target.value)} /></Field>
        <Field label="Code postal" htmlFor="ent-cp"><Input id="ent-cp" value={cp} onChange={(e) => setCp(e.target.value)} /></Field>
        <Field label="Ville" htmlFor="ent-ville"><Input id="ent-ville" value={ville} onChange={(e) => setVille(e.target.value)} /></Field>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-body font-medium text-ink mb-1">Contacts</legend>
        {contacts.map((c, i) => (
          <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto_2rem] sm:items-center">
            <Input value={c.nom} onChange={(e) => setContacts(contacts.map((x, j) => (j === i ? { ...x, nom: e.target.value } : x)))} placeholder="Nom" aria-label="Nom du contact" />
            <Input value={c.telephone ?? ""} onChange={(e) => setContacts(contacts.map((x, j) => (j === i ? { ...x, telephone: e.target.value } : x)))} placeholder="Téléphone" aria-label="Téléphone du contact" inputMode="tel" />
            <Input value={c.email ?? ""} onChange={(e) => setContacts(contacts.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} placeholder="E-mail" aria-label="E-mail du contact" inputMode="email" />
            <Choix type="radio" name="principal" checked={Boolean(c.principal)} onChange={() => setContacts(contacts.map((x, j) => ({ ...x, principal: j === i })))} label="principal" />
            <Button type="button" variant="ghost" size="md" iconOnly aria-label="Retirer ce contact" onClick={() => setContacts(contacts.filter((_, j) => j !== i))}><Trash2 strokeWidth={1.5} /></Button>
          </div>
        ))}
        <div><Button type="button" variant="ghost" size="sm" onClick={() => setContacts([...contacts, { nom: "", principal: contacts.length === 0 }])}><Plus strokeWidth={1.5} /> Ajouter un contact</Button></div>
      </fieldset>
      <Field label="Note (facultatif)" htmlFor="ent-note"><Textarea id="ent-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <Choix type="checkbox" checked={relances} onChange={(e) => setRelances(e.target.checked)} label="Recevra les mails de rappel et de relance (quand ils seront en place)" />
      <div className="flex justify-end gap-2">
        {onFermer && <Button type="button" variant="ghost" onClick={onFermer}>Annuler</Button>}
        <Button type="button" variant="primary" loading={pending} disabled={nom.trim().length < 2} onClick={valider}>{entreprise ? "Enregistrer" : "Créer l'entreprise"}</Button>
      </div>
    </div>
  );
}
