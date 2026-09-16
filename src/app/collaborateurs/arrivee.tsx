"use client";

// Nouvelle arrivee : la personne entre dans le referentiel (public."User") avec son role,
// son agence et son directeur referent ; l'intranet note la date. Le portefeuille se
// compose ensuite depuis sa fiche.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { DETAIL_FONCTION, FONCTIONS, type Fonction } from "@/lib/domain/collaborateur";
import { arriveeAction } from "./actions";

export function Arrivee({ agences, directeurs }: { agences: { id: string; code: string }[]; directeurs: { id: string; nom: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  const [ouvert, setOuvert] = useState(false);
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [fonction, setFonction] = useState<Fonction>("assistant_copropriete");
  const [agenceId, setAgenceId] = useState("");
  const [directeurId, setDirecteurId] = useState("");
  const [arrivee, setArrivee] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  if (!ouvert) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOuvert(true)}><UserPlus strokeWidth={1.5} /> Déclarer une arrivée</Button>
    );
  }

  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Prénom et nom" htmlFor="ar-nom" requis><Input id="ar-nom" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Victoria DORLEAC" autoFocus /></Field>
          <Field label="E-mail" htmlFor="ar-email" requis hint="@real31.fr, celui du compte Microsoft"><Input id="ar-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Fonction" htmlFor="ar-fonction" requis hint="le rôle au référentiel en découle">
            <Select id="ar-fonction" value={fonction} onChange={(e) => setFonction(e.target.value as Fonction)}>
              {FONCTIONS.map((f) => <option key={f} value={f}>{DETAIL_FONCTION[f].libelle}</option>)}
            </Select>
          </Field>
          <Field label="Agence" htmlFor="ar-agence">
            <Select id="ar-agence" value={agenceId} onChange={(e) => setAgenceId(e.target.value)}>
              <option value="">—</option>
              {agences.map((a) => <option key={a.id} value={a.id}>{a.code}</option>)}
            </Select>
          </Field>
          <Field label="Directeur référent" htmlFor="ar-dir">
            <Select id="ar-dir" value={directeurId} onChange={(e) => setDirecteurId(e.target.value)}>
              <option value="">—</option>
              {directeurs.map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}
            </Select>
          </Field>
          <Field label="Arrivée le" htmlFor="ar-date"><Input id="ar-date" type="date" value={arrivee} onChange={(e) => setArrivee(e.target.value)} /></Field>
          <Field label="Note" htmlFor="ar-note" className="sm:col-span-3"><Input id="ar-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="remplace X, assistante de Y…" /></Field>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setOuvert(false)}>Annuler</Button>
          <Button
            type="button"
            variant="primary"
            disabled={pending || !nom.trim() || !email.trim()}
            onClick={() =>
              demarrer(async () => {
                const res = await arriveeAction({ nomComplet: nom, email, roleTable: DETAIL_FONCTION[fonction].roleTable, fonction, agenceId: agenceId || undefined, referentDirectorId: directeurId || undefined, arriveeISO: arrivee || undefined, note: note || undefined });
                if (!res.ok) return toast.err(res.erreur);
                toast.ok(`${nom.trim()} est dans l'annuaire.`);
                router.push(`/collaborateurs/${res.donnees!.id}`);
              })
            }
          >
            {pending ? <Loader2 strokeWidth={1.5} className="animate-spin" /> : <UserPlus strokeWidth={1.5} />} Créer
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
