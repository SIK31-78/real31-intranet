"use client";

// La fiche d'un trousseau, en creation comme en modification : numero, libelle,
// emplacement, composition (type × quantite), acces (copro + immeuble + types). Les
// copropriétés viennent du referentiel (jamais ressaisies).

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea, Choix } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useCombobox } from "@/components/ui/combobox";
import { LIBELLE_TYPE_ACCES, LIBELLE_TYPE_ELEMENT, TYPES_ACCES, TYPES_ELEMENT, type Trousseau, type TypeAcces, type TypeElement } from "@/lib/domain/cles/types";
import { normaliserTexte } from "@/lib/domain/cles/normaliser";
import { cn } from "@/lib/cn";
import { creerTrousseauAction, modifierTrousseauAction } from "@/app/cles/actions";

export interface CoproChoix {
  code: string;
  nom: string;
  adresse: string;
}

interface AccesSaisi {
  coproCode: string;
  immeuble: string;
  types: TypeAcces[];
  libelle: string;
}

interface ElementSaisi {
  type: TypeElement;
  libelle: string;
  quantite: number;
}

export function FormulaireTrousseau({
  copros,
  trousseau,
  agenceCode,
  agences,
  onFermer,
}: {
  copros: CoproChoix[];
  /** Absent = creation. */
  trousseau?: Trousseau;
  /** Agence par defaut (session). */
  agenceCode?: string;
  /** Si la direction peut choisir l'agence. */
  agences?: string[];
  onFermer?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  const [agence, setAgence] = useState(trousseau?.agenceCode ?? agenceCode ?? "");
  const [numero, setNumero] = useState(trousseau?.numero ?? "");
  const [libelle, setLibelle] = useState(trousseau?.libelle ?? "");
  const [emplacement, setEmplacement] = useState(trousseau?.emplacement ?? "");
  const [note, setNote] = useState(trousseau?.note ?? "");
  const [sensible, setSensible] = useState(trousseau?.sensible ?? false);
  const [consigne, setConsigne] = useState(trousseau?.consigne ?? "");
  const [composition, setComposition] = useState<ElementSaisi[]>(trousseau?.composition.map((e) => ({ ...e })) ?? [{ type: "cle", libelle: "", quantite: 1 }]);
  const [acces, setAcces] = useState<AccesSaisi[]>(
    trousseau?.acces.map((a) => ({ coproCode: a.bien.type === "copro" ? a.bien.code : "", immeuble: a.immeuble ?? "", types: a.types, libelle: a.libelle })) ?? [{ coproCode: "", immeuble: "", types: ["total"], libelle: "Accès total" }],
  );
  const [tente, setTente] = useState(false);

  const pret = numero.trim().length > 0 && acces.some((a) => a.coproCode) && (Boolean(agence) || Boolean(trousseau));

  function valider() {
    setTente(true);
    if (!pret) return;
    demarrer(async () => {
      const donnees = {
        agenceCode: agence || undefined,
        numero,
        libelle,
        emplacement: emplacement || undefined,
        composition: composition.filter((e) => e.quantite > 0),
        acces: acces.filter((a) => a.coproCode).map((a) => ({ coproCode: a.coproCode, immeuble: a.immeuble || undefined, types: a.types, libelle: a.libelle })),
        note: note || undefined,
        sensible,
        consigne: sensible && consigne ? consigne : undefined,
      };
      const res = trousseau ? await modifierTrousseauAction({ ...donnees, trousseauId: trousseau.id }) : await creerTrousseauAction(donnees);
      if (!res.ok) return toast.err(res.erreur);
      if (trousseau) {
        toast.ok(`${numero.toUpperCase()} mis à jour.`);
        onFermer?.();
        router.refresh();
      } else {
        toast.ok(`Trousseau ${numero.toUpperCase()} créé.`);
        router.push(`/cles/trousseaux/${(res.donnees as { trousseauId: string }).trousseauId}`);
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        {agences && agences.length > 1 && !trousseau && (
          <Field label="Agence" htmlFor="tr-agence" requis>
            <Select id="tr-agence" value={agence} onChange={(e) => setAgence(e.target.value)}>
              <option value="">Choisir…</option>
              {agences.map((a) => <option key={a} value={a}>{a}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Numéro" htmlFor="tr-numero" requis hint="R004, J045… mis en forme automatiquement" erreur={tente && !numero.trim() ? "Obligatoire" : undefined}>
          <Input id="tr-numero" value={numero} onChange={(e) => setNumero(e.target.value)} className="font-mono" autoComplete="off" autoFocus={!trousseau} />
        </Field>
        <Field label="Libellé" htmlFor="tr-libelle" className="sm:col-span-2">
          <Input id="tr-libelle" value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="Accès total, Local fibre, Pass général…" />
        </Field>
        <Field label="Emplacement" htmlFor="tr-emplacement" hint="Tiroir, armoire">
          <Input id="tr-emplacement" value={emplacement} onChange={(e) => setEmplacement(e.target.value)} placeholder="T041" className="font-mono" />
        </Field>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-body font-medium text-ink mb-1">Ce que le trousseau ouvre</legend>
        {acces.map((a, i) => (
          <LigneAcces key={i} acces={a} copros={copros} erreur={tente && !a.coproCode} onChange={(n) => setAcces(acces.map((x, j) => (j === i ? n : x)))} onSupprimer={acces.length > 1 ? () => setAcces(acces.filter((_, j) => j !== i)) : undefined} />
        ))}
        <div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setAcces([...acces, { coproCode: "", immeuble: "", types: [], libelle: "" }])}>
            <Plus strokeWidth={1.5} /> Autre copropriété ou accès
          </Button>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-body font-medium text-ink mb-1">Composition <span className="font-normal text-ink-2">(contrôlée au retour)</span></legend>
        {composition.map((e, i) => (
          <div key={i} className="grid grid-cols-[6rem_1fr_5rem_2rem] items-end gap-2">
            <Select value={e.type} onChange={(ev) => setComposition(composition.map((x, j) => (j === i ? { ...x, type: ev.target.value as TypeElement } : x)))} aria-label="Type d'élément">
              {TYPES_ELEMENT.map((t) => <option key={t} value={t}>{LIBELLE_TYPE_ELEMENT[t]}</option>)}
            </Select>
            <Input value={e.libelle} onChange={(ev) => setComposition(composition.map((x, j) => (j === i ? { ...x, libelle: ev.target.value } : x)))} placeholder="porte hall, Vigik, parking…" aria-label="Libellé de l'élément" />
            <Input type="number" min={1} max={99} value={e.quantite} onChange={(ev) => setComposition(composition.map((x, j) => (j === i ? { ...x, quantite: Number(ev.target.value) } : x)))} aria-label="Quantité" />
            <Button type="button" variant="ghost" size="md" iconOnly aria-label="Retirer" onClick={() => setComposition(composition.filter((_, j) => j !== i))}><Trash2 strokeWidth={1.5} /></Button>
          </div>
        ))}
        <div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setComposition([...composition, { type: "badge", libelle: "", quantite: 1 }])}>
            <Plus strokeWidth={1.5} /> Ajouter un élément
          </Button>
        </div>
      </fieldset>

      <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
        <Choix type="checkbox" checked={sensible} onChange={(e) => setSensible(e.target.checked)} label={<span className="font-medium">Trousseau sensible : le conseil syndical ne souhaite pas qu&apos;il soit remis sans accord</span>} />
        {sensible && (
          <Field label="Consigne affichée avant la sortie" htmlFor="tr-consigne" hint="Ce qu'il faut savoir ou demander avant de remettre les clés.">
            <Input id="tr-consigne" value={consigne} onChange={(e) => setConsigne(e.target.value)} placeholder="Appeler M. Dupont (président du CS) avant toute remise" />
          </Field>
        )}
      </div>

      <Field label="Note (facultatif)" htmlFor="tr-note">
        <Textarea id="tr-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Particularités, double chez le gardien…" />
      </Field>

      <div className="flex justify-end gap-2">
        {onFermer && <Button type="button" variant="ghost" onClick={onFermer}>Annuler</Button>}
        <Button type="button" variant="primary" loading={pending} disabled={!pret && tente} onClick={valider}>
          {trousseau ? "Enregistrer" : "Créer le trousseau"}
        </Button>
      </div>
    </div>
  );
}

function LigneAcces({ acces, copros, erreur, onChange, onSupprimer }: { acces: AccesSaisi; copros: CoproChoix[]; erreur: boolean; onChange: (a: AccesSaisi) => void; onSupprimer?: () => void }) {
  const [texte, setTexte] = useState("");
  const copro = copros.find((c) => c.code === acces.coproCode);
  const resultats = useMemo(() => {
    const termes = normaliserTexte(texte).split(" ").filter(Boolean);
    if (termes.length === 0) return [];
    return copros.filter((c) => { const f = normaliserTexte(`${c.code} ${c.nom} ${c.adresse}`); return termes.every((t) => f.includes(t)); }).slice(0, 8);
  }, [copros, texte]);
  const combobox = useCombobox(resultats, (c) => { onChange({ ...acces, coproCode: c.code }); setTexte(""); }, () => setTexte(""));
  const toggle = (t: TypeAcces) => onChange({ ...acces, types: acces.types.includes(t) ? acces.types.filter((x) => x !== t) : [...acces.types, t] });

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Copropriété" requis erreur={erreur ? "Choisis une copropriété" : undefined}>
          {copro ? (
            <div className="flex items-center gap-2 min-h-8">
              <span className="font-mono text-ink-2">{copro.code}</span>
              <span className="font-medium text-ink truncate">{copro.nom}</span>
              <span className="text-ink-2 truncate">{copro.adresse}</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ ...acces, coproCode: "" })}>Changer</Button>
            </div>
          ) : (
            <div className="relative">
              <Input value={texte} onChange={(e) => setTexte(e.target.value)} onKeyDown={combobox.onKeyDown} {...combobox.input} placeholder="Code, nom ou adresse…" autoComplete="off" />
              {resultats.length > 0 && (
                <ul {...combobox.liste} className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-line bg-surface shadow-2 py-1">
                  {resultats.map((c, i) => (
                    <li key={c.code} {...combobox.option(i)} onMouseDown={(ev) => { ev.preventDefault(); onChange({ ...acces, coproCode: c.code }); setTexte(""); }} className={cn("flex items-center gap-2 px-3 min-h-8 text-body cursor-pointer", i === combobox.actif ? "bg-surface-2" : "hover:bg-surface-2/60")}>
                      <span className="font-mono text-ink-2">{c.code}</span><span className="font-medium truncate">{c.nom}</span><span className="text-ink-2 truncate">{c.adresse}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Field>
        <Field label="Immeuble / cage (facultatif)">
          <Input value={acces.immeuble} onChange={(e) => onChange({ ...acces, immeuble: e.target.value })} placeholder="Bât. A, cage 2, 9 rue Médéric…" />
        </Field>
        {onSupprimer && <Button type="button" variant="ghost" size="md" iconOnly aria-label="Retirer cet accès" onClick={onSupprimer}><Trash2 strokeWidth={1.5} /></Button>}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {TYPES_ACCES.map((t) => <Choix key={t} type="checkbox" checked={acces.types.includes(t)} onChange={() => toggle(t)} label={LIBELLE_TYPE_ACCES[t]} />)}
      </div>
      <Field label="Précision (facultatif)">
        <Input value={acces.libelle} onChange={(e) => onChange({ ...acces, libelle: e.target.value })} placeholder="Accès total hors locaux techniques…" />
      </Field>
    </div>
  );
}
