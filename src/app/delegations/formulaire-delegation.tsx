"use client";

// Poser une delegation : « qui, a qui, sur quoi, de quand a quand, pourquoi ». Le
// titulaire par defaut est l'utilisateur (il delegue son propre portefeuille avant de
// partir) ; la direction choisit parmi les gens de son agence.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Choix, Field, GroupeChoix, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { creerDelegationAction } from "./actions";

type Collab = { id: string; nomComplet: string; agenceCode?: string; roleTable?: string };

export function FormulaireDelegation({
  moi,
  collaborateurs,
  titulairesPossibles,
  agences,
  peutDeleguerAgence,
}: {
  moi: string;
  collaborateurs: Collab[];
  titulairesPossibles: string[];
  agences: string[];
  /** Peut poser une delegation sur toute une agence (direction). */
  peutDeleguerAgence: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  const aujourdHui = new Date().toISOString().slice(0, 10);
  const [de, setDe] = useState(titulairesPossibles.includes(moi) ? moi : (titulairesPossibles[0] ?? ""));
  const [a, setA] = useState<string[]>([]);
  const [portee, setPortee] = useState<"portefeuille" | "agence" | "copro">("portefeuille");
  const [agence, setAgence] = useState(agences[0] ?? "");
  const [copro, setCopro] = useState("");
  const [depuis, setDepuis] = useState(aujourdHui);
  const [jusqua, setJusqua] = useState("");
  const [motif, setMotif] = useState("");

  const titulaires = collaborateurs.filter((c) => titulairesPossibles.includes(c.id));
  const beneficiaires = collaborateurs.filter((c) => c.id !== de);
  const nom = (id: string) => collaborateurs.find((c) => c.id === id)?.nomComplet ?? id;

  function envoyer() {
    demarrer(async () => {
      const res = await creerDelegationAction({
        deUserId: de,
        aUserIds: a,
        portee,
        ...(portee === "agence" ? { agenceCode: agence } : {}),
        ...(portee === "copro" ? { coproCode: copro } : {}),
        depuisISO: depuis,
        ...(jusqua ? { jusquaISO: jusqua } : {}),
        ...(motif.trim() ? { motif: motif.trim() } : {}),
      });
      if (!res.ok) return toast.err(res.erreur);
      toast.ok(`${res.donnees?.nombre ?? a.length} délégation${(res.donnees?.nombre ?? 1) > 1 ? "s" : ""} posée${(res.donnees?.nombre ?? 1) > 1 ? "s" : ""} : ${a.map(nom).join(", ")} sur le périmètre de ${nom(de)}.`);
      setA([]);
      setMotif("");
      router.refresh();
    });
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!pending && a.length > 0) envoyer();
      }}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Qui délègue" htmlFor="del-de">
          <Select id="del-de" value={de} onChange={(e) => { setDe(e.target.value); setA((prev) => prev.filter((x) => x !== e.target.value)); }}>
            {titulaires.map((c) => (
              <option key={c.id} value={c.id}>{c.nomComplet}{c.agenceCode ? ` · ${c.agenceCode}` : ""}</option>
            ))}
          </Select>
        </Field>
        <Field label="À qui" htmlFor="del-a" hint="Plusieurs possibles : le remplaçant et son assistant, par exemple.">
          <Select id="del-a" multiple value={a} onChange={(e) => setA(Array.from(e.target.selectedOptions, (o) => o.value))} className="h-32">
            {beneficiaires.map((c) => (
              <option key={c.id} value={c.id}>{c.nomComplet}{c.agenceCode ? ` · ${c.agenceCode}` : ""}</option>
            ))}
          </Select>
        </Field>
      </div>
      <GroupeChoix label="Sur quoi">
        <Choix type="radio" name="portee" value="portefeuille" label={`Le portefeuille de ${nom(de)}`} checked={portee === "portefeuille"} onChange={() => setPortee("portefeuille")} />
        {peutDeleguerAgence && <Choix type="radio" name="portee" value="agence" label="Toute une agence" checked={portee === "agence"} onChange={() => setPortee("agence")} />}
        <Choix type="radio" name="portee" value="copro" label="Une seule copropriété" checked={portee === "copro"} onChange={() => setPortee("copro")} />
      </GroupeChoix>
      {portee === "agence" && (
        <Field label="Agence" htmlFor="del-agence">
          <Select id="del-agence" largeur="auto" value={agence} onChange={(e) => setAgence(e.target.value)}>
            {agences.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
      )}
      {portee === "copro" && (
        <Field label="Code de la copropriété" htmlFor="del-copro">
          <Input id="del-copro" largeur="auto" value={copro} onChange={(e) => setCopro(e.target.value.toUpperCase())} placeholder="S215" className="font-mono" />
        </Field>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Du" htmlFor="del-depuis"><Input id="del-depuis" type="date" largeur="auto" value={depuis} onChange={(e) => setDepuis(e.target.value)} /></Field>
        <Field label="Au" htmlFor="del-jusqua" hint="vide = sans fin"><Input id="del-jusqua" type="date" largeur="auto" value={jusqua} onChange={(e) => setJusqua(e.target.value)} /></Field>
        <Field label="Motif" htmlFor="del-motif" className="flex-1 min-w-48"><Input id="del-motif" value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="congé maternité, binôme, remplacement…" /></Field>
        <Button type="submit" variant="primary" disabled={pending || a.length === 0 || !de}>
          {pending ? <Loader2 strokeWidth={1.5} className="animate-spin" /> : <UserPlus strokeWidth={1.5} />} Déléguer
        </Button>
      </div>
    </form>
  );
}
