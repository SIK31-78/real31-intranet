"use client";

// Compositeur de mail sortant (façon « F1 » Crypto) : choisir une copro -> ses contacts ->
// un modèle -> l'objet est auto-taggé (code/nom/adresse pour le tri) -> aperçu -> brouillon
// dans la boîte partagée (syndicN). Aucun envoi direct ; brouillon seulement, et seulement
// si l'envoi est ouvert (sinon aperçu). Composition (objet/corps) = domaine pur, en direct.

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Callout } from "@/components/ui/callout";
import { useToast } from "@/components/ui/toast";
import {
  MODELES_MAIL,
  factureComplete,
  fusionnerModele,
  objetCompose,
  objetFactureEstale,
  type ContactCopro,
  type CoproChoisissable,
  type VariablesModele,
} from "@/lib/domain/mes-emails-composition";
import {
  creerBrouillonCompositionAction,
  listerContactsCompositionAction,
} from "@/app/mes-emails/composer/actions";

type Props = {
  copros: CoproChoisissable[];
  gestionnaireNom: string;
  agence: string;
  /** Graph branché + vraie boîte partagée : le bouton crée un brouillon (sinon aperçu). */
  brouillonPossible: boolean;
  boite: string | null;
};

const LIBELLE_QUALITE: Record<string, string> = {
  conseil_syndical: "Conseil syndical",
  coproprietaire: "Copropriétaire",
  locataire: "Locataire",
  professionnel: "Professionnel",
  autre: "Autre",
};

const emails = (brut: string): string[] =>
  brut
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => /.@./.test(s));

export function Compositeur({ copros, gestionnaireNom, agence, brouillonPossible, boite }: Props) {
  const toast = useToast();
  const [refCopro, setRefCopro] = useState("");
  const [contacts, setContacts] = useState<ContactCopro[] | null>(null);
  const [coches, setCoches] = useState<Set<string>>(new Set());
  const [aLibre, setALibre] = useState("");
  const [cc, setCc] = useState("");
  const [modeleId, setModeleId] = useState("");
  const [sujet, setSujet] = useState("");
  const [corps, setCorps] = useState("");
  const [facture, setFacture] = useState<{ actif: boolean; compte: string; fournisseur: string; libelle: string }>({
    actif: false,
    compte: "",
    fournisseur: "",
    libelle: "",
  });
  const [chargement, demarrer] = useTransition();
  const [envoiEnCours, setEnvoiEnCours] = useState(false);

  const copro = useMemo(() => copros.find((c) => c.reference.toUpperCase() === refCopro.trim().toUpperCase()) ?? null, [copros, refCopro]);

  function choisirCopro(ref: string) {
    setRefCopro(ref);
    setContacts(null);
    setCoches(new Set());
    const c = copros.find((x) => x.reference.toUpperCase() === ref.trim().toUpperCase());
    if (!c) return;
    demarrer(async () => {
      const r = await listerContactsCompositionAction({ reference: c.reference });
      if (r.ok) setContacts(r.donnees ?? []);
      else toast.err(r.erreur);
    });
  }

  const destinataires = useMemo(() => {
    const d = new Set<string>(coches);
    for (const e of emails(aLibre)) d.add(e.toLowerCase());
    return [...d];
  }, [coches, aLibre]);

  const premierNom = useMemo(() => {
    const premier = [...coches][0];
    return contacts?.find((c) => c.email === premier)?.nom ?? "";
  }, [coches, contacts]);

  const variables: VariablesModele = {
    copro_code: copro?.reference ?? "",
    copro_nom: copro?.nom ?? "",
    copro_adresse: copro?.adresse ?? "",
    destinataire_nom: premierNom,
    gestionnaire_nom: gestionnaireNom,
    agence,
    date: new Date().toLocaleDateString("fr-FR"),
  };

  function appliquerModele(id: string) {
    setModeleId(id);
    const m = MODELES_MAIL.find((x) => x.id === id);
    if (!m) return;
    setSujet(m.sujet);
    setCorps(fusionnerModele(m.corps, variables));
  }

  const objet = facture.actif && factureComplete(facture)
    ? objetFactureEstale(facture)
    : copro
      ? objetCompose(copro, sujet)
      : sujet;

  const pretAEnvoyer = Boolean(objet.trim() && destinataires.length && corps.trim());

  function creerBrouillon() {
    if (!pretAEnvoyer) {
      toast.err("Il manque l'objet, un destinataire ou le corps.");
      return;
    }
    setEnvoiEnCours(true);
    demarrer(async () => {
      const r = await creerBrouillonCompositionAction({ objet, corps, a: destinataires, cc: emails(cc) });
      setEnvoiEnCours(false);
      if (!r.ok) {
        toast.err(r.erreur);
        return;
      }
      if (r.donnees?.simulation) {
        toast.ok("Aperçu vérifié : aucune boîte branchée ici, aucun brouillon créé.");
      } else {
        toast.ok(`Brouillon créé dans ${r.donnees?.boite ?? "la boîte"} — à relire puis envoyer dans Outlook.`);
      }
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1fr] items-start">
      {/* Colonne gauche : composition */}
      <div className="flex flex-col gap-4">
        <section className="rounded-xl border border-line bg-surface p-4 flex flex-col gap-3">
          <h2 className="text-meta uppercase tracking-wider text-ink-3 font-medium">Destinataire</h2>
          <Field label="Copropriété" htmlFor="comp-copro" hint="Code, nom ou adresse — la copro taggue l'objet pour le tri.">
            <Input
              id="comp-copro"
              list="comp-copros"
              value={refCopro}
              onChange={(e) => choisirCopro(e.target.value)}
              placeholder="S247"
              autoComplete="off"
            />
          </Field>
          <datalist id="comp-copros">
            {copros.map((c) => (
              <option key={c.reference} value={c.reference}>
                {c.nom}
              </option>
            ))}
          </datalist>

          {copro && (
            <p className="text-meta text-ink-2">
              <span className="font-mono text-green-700">{copro.reference}</span> · {copro.nom}
              {copro.adresse ? ` · ${copro.adresse}` : ""}
              {copro.gestionnaire ? ` · ${copro.gestionnaire}` : ""}
            </p>
          )}

          {chargement && contacts === null && <p className="text-meta text-ink-3">Chargement des contacts…</p>}
          {contacts && contacts.length > 0 && (
            <div className="flex flex-col gap-1 max-h-56 overflow-y-auto rounded-lg border border-line p-2">
              {contacts.map((c) => (
                <label key={c.email} className="flex items-start gap-2 text-body hover:bg-surface-2 rounded px-1 py-0.5">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={coches.has(c.email)}
                    onChange={(e) =>
                      setCoches((s) => {
                        const n = new Set(s);
                        if (e.target.checked) n.add(c.email);
                        else n.delete(c.email);
                        return n;
                      })
                    }
                  />
                  <span className="min-w-0">
                    <span className="text-ink">{c.nom || c.email}</span>{" "}
                    <span className="text-meta text-ink-3">· {LIBELLE_QUALITE[c.qualite] ?? c.qualite}</span>
                    {c.nom ? <span className="block font-mono text-meta text-ink-3 truncate">{c.email}</span> : null}
                  </span>
                </label>
              ))}
            </div>
          )}
          {contacts && contacts.length === 0 && (
            <p className="text-meta text-ink-3">Aucun contact connu pour cette copropriété — saisissez l&apos;adresse ci-dessous.</p>
          )}

          <Field label="Autres destinataires (À)" htmlFor="comp-a">
            <Input id="comp-a" value={aLibre} onChange={(e) => setALibre(e.target.value)} placeholder="adresse@exemple.fr, …" />
          </Field>
          <Field label="Copie (Cc)" htmlFor="comp-cc">
            <Input id="comp-cc" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="adresse@exemple.fr, …" />
          </Field>
        </section>

        <section className="rounded-xl border border-line bg-surface p-4 flex flex-col gap-3">
          <h2 className="text-meta uppercase tracking-wider text-ink-3 font-medium">Contenu</h2>
          <Field label="Modèle d'événement" htmlFor="comp-modele">
            <Select id="comp-modele" value={modeleId} onChange={(e) => appliquerModele(e.target.value)}>
              <option value="">— Aucun (texte libre) —</option>
              {MODELES_MAIL.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.titre}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Sujet" htmlFor="comp-sujet">
            <Input id="comp-sujet" value={sujet} onChange={(e) => setSujet(e.target.value)} placeholder="Objet du message" disabled={facture.actif} />
          </Field>
          <Field label="Message" htmlFor="comp-corps">
            <Textarea id="comp-corps" value={corps} onChange={(e) => setCorps(e.target.value)} rows={12} placeholder="Votre message…" />
          </Field>
        </section>

        <section className="rounded-xl border border-line bg-surface p-4 flex flex-col gap-3">
          <label className="flex items-center gap-2 text-body">
            <input type="checkbox" checked={facture.actif} onChange={(e) => setFacture((f) => ({ ...f, actif: e.target.checked }))} />
            <span className="font-medium text-ink">Transmettre une facture à ESTALE</span>
          </label>
          {facture.actif && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Compte" htmlFor="f-compte">
                  <Input id="f-compte" value={facture.compte} onChange={(e) => setFacture((f) => ({ ...f, compte: e.target.value }))} placeholder="601000" />
                </Field>
                <Field label="Fournisseur" htmlFor="f-four">
                  <Input id="f-four" value={facture.fournisseur} onChange={(e) => setFacture((f) => ({ ...f, fournisseur: e.target.value }))} placeholder="DGP NETTOYAGE" />
                </Field>
                <Field label="Libellé" htmlFor="f-lib">
                  <Input id="f-lib" value={facture.libelle} onChange={(e) => setFacture((f) => ({ ...f, libelle: e.target.value }))} placeholder="Entretien EV" />
                </Field>
              </div>
              <Callout ton="neutral">
                L&apos;objet reprend la codification « COMPTE - FOURNISSEUR - LIBELLÉ ». Destinataire = robot facture ESTALE (adresse
                à configurer) ; joindre la facture avant d&apos;envoyer. La liste des comptes par copro n&apos;est pas encore branchée.
              </Callout>
            </>
          )}
        </section>
      </div>

      {/* Colonne droite : aperçu */}
      <div className="flex flex-col gap-4 lg:sticky lg:top-4">
        {brouillonPossible ? (
          <Callout ton="neutral">
            Rien ne part d&apos;ici : le bouton crée un <strong>brouillon</strong> dans {boite}, à relire puis envoyer depuis Outlook.
          </Callout>
        ) : (
          <Callout ton="warn">
            Aperçu seulement : la boîte partagée n&apos;est pas branchée sur cet environnement, aucun brouillon ne sera créé.
          </Callout>
        )}
        <section className="rounded-xl border border-line bg-surface p-4 flex flex-col gap-3">
          <h2 className="text-meta uppercase tracking-wider text-ink-3 font-medium">Aperçu</h2>
          <p className="text-meta text-ink-2">
            De : <span className="font-mono">{boite ?? "—"}</span>
          </p>
          <p className="text-meta text-ink-2 break-words">
            À : <span className="font-mono">{destinataires.join(", ") || "—"}</span>
            {emails(cc).length > 0 && (
              <>
                {" "}· Cc : <span className="font-mono">{emails(cc).join(", ")}</span>
              </>
            )}
          </p>
          <p className="text-body font-medium text-ink break-words border-t border-line pt-2">{objet || "—"}</p>
          <pre className="whitespace-pre-wrap text-body text-ink-2 font-sans max-h-[40vh] overflow-y-auto">{corps || "—"}</pre>
        </section>
        <div className="flex items-center gap-3">
          <Button variant="primary" disabled={!pretAEnvoyer || envoiEnCours || chargement} onClick={creerBrouillon}>
            {brouillonPossible ? "Créer le brouillon" : "Vérifier l'aperçu"}
          </Button>
          {!pretAEnvoyer && <span className="text-meta text-ink-3">Objet, destinataire et message requis.</span>}
        </div>
      </div>
    </div>
  );
}
