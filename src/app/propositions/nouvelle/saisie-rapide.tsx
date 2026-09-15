"use client";

// Nouveau contact : ce que celui qui decroche doit noter (l'adresse, et de quoi rappeler),
// le reste est replie. L'adresse cherche dans le registre national ; la fiche dira ce
// qu'il manque pour faire l'offre.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Search } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatJour } from "@/lib/services/facturation/format";
import { informationsManquantes, LIBELLE_ORIGINE, libellePeriodeConstruction, ORIGINES, type Origine } from "@/lib/domain/proposition/proposition";
import type { RegistreCopro } from "@/lib/ports/proposition-repository";
import { creerPropositionAction, rechercherRegistreAction } from "../actions";

export function SaisieRapide({ agences, agenceParDefaut }: { agences: string[]; agenceParDefaut?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  const [adresse, setAdresse] = useState("");
  const [resultats, setResultats] = useState<RegistreCopro[]>([]);
  const [choisi, setChoisi] = useState<RegistreCopro | null>(null);
  const [lots, setLots] = useState("");
  const [commune, setCommune] = useState("");
  const [codePostal, setCodePostal] = useState("");
  const [nom, setNom] = useState("");
  const [role, setRole] = useState("");
  const [telephone, setTelephone] = useState("");
  const [email, setEmail] = useState("");
  const [origine, setOrigine] = useState<Origine | "">("");
  const [agence, setAgence] = useState(agenceParDefaut ?? "");
  const [syndic, setSyndic] = useState("");
  const [prochaineAg, setProchaineAg] = useState("");
  const [cloture, setCloture] = useState("");
  const [commentaires, setCommentaires] = useState("");
  const [tente, setTente] = useState(false);

  // Recherche au registre a chaque frappe (debounce 300 ms), tant qu'aucun choix n'est fait.
  // Les resultats se vident dans les gestionnaires d'evenement, jamais dans l'effet
  // (regle react-hooks/set-state-in-effect).
  useEffect(() => {
    if (choisi || adresse.trim().length < 4) return;
    const t = setTimeout(() => {
      rechercherRegistreAction(adresse).then((res) => {
        if (res.ok && res.donnees) setResultats(res.donnees);
      });
    }, 300);
    return () => clearTimeout(t);
  }, [adresse, choisi]);

  function choisir(r: RegistreCopro) {
    setChoisi(r);
    setAdresse(r.adresse);
    setCommune(r.commune);
    setCodePostal(r.codePostal);
    if (r.lotsPrincipaux !== null) setLots(String(r.lotsPrincipaux));
    if (r.syndicNom) setSyndic(r.syndicNom);
    setResultats([]);
  }

  const joignable = Boolean(telephone.trim() || email.trim());
  const pret = Boolean(adresse.trim()) && joignable;
  const apercu = {
    immeuble: { adresse, ...(lots ? { lotsPrincipaux: Number(lots) } : {}), ...(syndic ? { syndicActuel: syndic } : {}), ...(prochaineAg ? { prochaineAgISO: prochaineAg } : {}), ...(cloture ? { clotureComptable: cloture } : {}) },
    contact: { nom, telephone, email },
  };
  const manquant = informationsManquantes(apercu).filter((m) => m !== "un téléphone ou un e-mail" && m !== "l'adresse de l'immeuble");

  function creer() {
    setTente(true);
    if (!pret) return;
    demarrer(async () => {
      const res = await creerPropositionAction({
        immeuble: { adresse: adresse.trim(), codePostal, commune, lotsPrincipaux: lots ? Number(lots) : undefined, syndicActuel: syndic, prochaineAgISO: prochaineAg || undefined, clotureComptable: cloture },
        contact: { nom, role, telephone, email },
        origine: origine || undefined,
        agence: agence || undefined,
        immatriculation: choisi?.immatriculation,
        commentaires,
      });
      if (!res.ok) return toast.err(res.erreur);
      toast.ok("Contact enregistré, la proposition est dans le pipeline.");
      router.push(`/propositions/${res.donnees!.id}`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardBody className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Field label="Adresse de l'immeuble" htmlFor="np-adresse" requis erreur={tente && !adresse.trim() ? "L'adresse est obligatoire." : undefined}>
              <div className="relative">
                <Input
                  id="np-adresse"
                  value={adresse}
                  onChange={(e) => {
                    setAdresse(e.target.value);
                    setChoisi(null);
                    if (e.target.value.trim().length < 4) setResultats([]);
                  }}
                  placeholder="7 rue Thomas d'Orléans, Colombes"
                  autoFocus
                  autoComplete="off"
                />
                {resultats.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full rounded-lg border border-line bg-surface shadow-1 divide-y divide-line">
                    {resultats.map((r) => (
                      <li key={r.immatriculation}>
                        <button type="button" className="w-full text-left px-3 py-2 hover:bg-surface-2 flex flex-col gap-0.5" onClick={() => choisir(r)}>
                          <span className="text-body">{r.adresse} <span className="text-ink-3">{r.codePostal} {r.commune}</span></span>
                          <span className="text-caption text-ink-2">
                            {r.lotsPrincipaux ?? "?"} lots principaux · {r.syndicNom ?? "syndic non connu"}
                            {r.finMandatISO && ` · mandat jusqu'au ${formatJour(r.finMandatISO)}`}
                            {r.mandat && !r.mandat.startsWith("Mandat en cours") && <span className="text-warn-700"> · {r.mandat}</span>}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Field>
            {choisi ? (
              <p className="text-caption text-ink-2 flex items-center gap-2">
                <Search strokeWidth={1.5} className="h-3.5 w-3.5" />
                Registre national : {choisi.immatriculation} · {choisi.lotsTotal ?? "?"} lots dont {choisi.lotsStationnement ?? 0} stationnements
                {choisi.periodeConstruction && ` · construit ${libellePeriodeConstruction(choisi.periodeConstruction)}`}
                {choisi.syndicNom && ` · syndic ${choisi.syndicNom}`}
                {choisi.finMandatISO && ` (${choisi.mandat?.toLowerCase() ?? "mandat"}, fin ${formatJour(choisi.finMandatISO)})`}
              </p>
            ) : (
              <p className="text-caption text-ink-3">Tapez le numéro, la voie et la commune : si l&apos;immeuble est au registre, ses lots et son syndic se remplissent.</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Field label="Contact" htmlFor="np-nom"><Input id="np-nom" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Mme Dupont" /></Field>
            <Field label="Son rôle" htmlFor="np-role"><Input id="np-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="présidente du CS" /></Field>
            <Field label="Téléphone" htmlFor="np-tel" requis erreur={tente && !joignable ? "Un téléphone ou un e-mail, au choix." : undefined}>
              <Input id="np-tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} inputMode="tel" />
            </Field>
            <Field label="E-mail" htmlFor="np-email" requis hint="l'un ou l'autre suffit">
              <Input id="np-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Field label="Agence" htmlFor="np-agence">
              <Select id="np-agence" value={agence} onChange={(e) => setAgence(e.target.value)}>
                <option value="">—</option>
                {agences.map((a) => <option key={a} value={a}>{a}</option>)}
              </Select>
            </Field>
            <Field label="Comment nous a-t-il connus ?" htmlFor="np-origine">
              <Select id="np-origine" value={origine} onChange={(e) => setOrigine(e.target.value as Origine | "")}>
                <option value="">—</option>
                {ORIGINES.map((o) => <option key={o} value={o}>{LIBELLE_ORIGINE[o]}</option>)}
              </Select>
            </Field>
            <Field label="Ce qui a été dit" htmlFor="np-notes" className="sm:col-span-2">
              <Textarea id="np-notes" rows={1} value={commentaires} onChange={(e) => setCommentaires(e.target.value)} placeholder="Ce que la personne attend, quand la rappeler…" />
            </Field>
          </div>

          <details className="group">
            <summary className="cursor-pointer text-body text-ink-2 hover:text-ink select-none">
              Si la personne le sait : lots, syndic actuel, prochaine AG, clôture comptable
            </summary>
            <div className="grid grid-cols-2 gap-3 pt-3 sm:grid-cols-6">
              <Field label="Code postal" htmlFor="np-cp"><Input id="np-cp" value={codePostal} onChange={(e) => setCodePostal(e.target.value)} /></Field>
              <Field label="Commune" htmlFor="np-commune"><Input id="np-commune" value={commune} onChange={(e) => setCommune(e.target.value)} /></Field>
              <Field label="Lots principaux" htmlFor="np-lots"><Input id="np-lots" inputMode="numeric" value={lots} onChange={(e) => setLots(e.target.value)} className="tabular-nums" /></Field>
              <Field label="Syndic actuel" htmlFor="np-syndic"><Input id="np-syndic" value={syndic} onChange={(e) => setSyndic(e.target.value)} /></Field>
              <Field label="Prochaine AG" htmlFor="np-ag"><Input id="np-ag" type="date" value={prochaineAg} onChange={(e) => setProchaineAg(e.target.value)} /></Field>
              <Field label="Clôture comptable" htmlFor="np-cloture"><Input id="np-cloture" value={cloture} onChange={(e) => setCloture(e.target.value)} placeholder="31/12" /></Field>
            </div>
          </details>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="text-caption text-ink-2">
              {manquant.length === 0 ? "Tout ce qu'il faut pour faire l'offre." : <>À demander si possible : {manquant.join(", ")}.</>}
            </p>
            <Button type="button" variant="primary" disabled={pending} onClick={creer}>
              {pending ? <Loader2 strokeWidth={1.5} className="animate-spin" /> : <Plus strokeWidth={1.5} />}
              Enregistrer le contact
            </Button>
          </div>
        </CardBody>
      </Card>
      <Callout ton="neutral">
        <strong>Au téléphone, demandez</strong> : l&apos;adresse exacte, un téléphone ou un e-mail pour rappeler, et si possible le nombre de lots, le
        syndic en place et la date de la prochaine AG. Le reste (visite, prix) revient au gestionnaire.
      </Callout>
    </div>
  );
}
