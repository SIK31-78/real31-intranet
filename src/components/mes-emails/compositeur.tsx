"use client";

// « Envoyer un e-mail » (façon F1 de Crypto, en plus simple) : on tape le NOM de la personne,
// l'annuaire rend la personne avec TOUTES ses adresses (certains en veulent deux) et ses
// immeubles ; on choisit l'immeuble auquel rattacher le mail, ou aucun (c'est parfois perso).
// Le conseil syndical s'ajoute d'un clic. L'objet est taggé par la copro pour le tri.
// Pièces jointes et signature (Signitic) partent avec. Rien n'est envoyé d'ici : le bouton
// crée un BROUILLON dans la boîte partagée, relu puis envoyé depuis Outlook (ADR-047).

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { Paperclip, Users, X } from "lucide-react";
import { Button, classesBouton } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Callout } from "@/components/ui/callout";
import { useToast } from "@/components/ui/toast";
import {
  MODELES_MAIL,
  fusionnerModele,
  objetCompose,
  prefixeObjetCopro,
  type ContactCopro,
  type CoproChoisissable,
  type DestinataireTrouve,
  type VariablesModele,
} from "@/lib/domain/mes-emails-composition";
import {
  creerBrouillonCompositionAction,
  listerContactsCompositionAction,
  listerDossiersCompositionAction,
  rechercherDestinatairesAction,
} from "@/app/mes-emails/composer/actions";
import { TYPE_DOSSIER_LABEL, type TypeDossier } from "@/lib/domain/dossier";

type DossierAffiche = { id: string; titre: string; type: TypeDossier };

/** Une personne en destinataire : toutes ses adresses partent ensemble. */
type Personne = { cle: string; nom: string; emails: string[] };

type FichierJoint = { nom: string; contentType: string; taille: number; base64: string };

type Props = {
  copros: CoproChoisissable[];
  gestionnaireNom: string;
  agence: string;
  /** Graph branché + vraie boîte partagée : le bouton crée un brouillon (sinon aperçu). */
  brouillonPossible: boolean;
  boite: string | null;
  /** Signature du gestionnaire (Signitic), posée sous le message. */
  signatureHtml?: string | null;
  /** Brouillon créé : la fenêtre qui contient le compositeur peut se fermer. */
  onTermine?: () => void;
};

const LIBELLE_QUALITE: Record<string, string> = {
  conseil_syndical: "conseil syndical",
  coproprietaire: "copropriétaire",
  locataire: "locataire",
  professionnel: "professionnel",
  autre: "autre",
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TAILLE_MAX_FICHIER = 3 * 1024 * 1024;

function enBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}

/** Remplace le préfixe copro de l'objet (celui de l'ancienne copro) par celui de la nouvelle. */
function avecPrefixe(objet: string, ancienne: CoproChoisissable | null, nouvelle: CoproChoisissable | null): string {
  let reste = objet.trim();
  if (ancienne) {
    const p = prefixeObjetCopro(ancienne);
    if (reste.startsWith(p)) reste = reste.slice(p.length).replace(/^\s*-\s*/, "");
  }
  // Préfixe seul : on laisse « - » pour taper l'objet à la suite.
  return nouvelle ? (reste ? objetCompose(nouvelle, reste) : `${prefixeObjetCopro(nouvelle)} - `) : reste;
}

const adresses = (l: Personne[]) => [...new Set(l.flatMap((p) => p.emails.map((e) => e.toLowerCase())))];

export function Compositeur({ copros, gestionnaireNom, agence, brouillonPossible, boite, signatureHtml, onTermine }: Props) {
  const toast = useToast();
  const [a, setA] = useState<Personne[]>([]);
  const [cc, setCc] = useState<Personne[]>([]);
  // Les immeubles proposés : ceux des personnes choisies.
  const [proposees, setProposees] = useState<(CoproChoisissable & { qualite: string })[]>([]);
  const [refCopro, setRefCopro] = useState("");
  const [autreCopro, setAutreCopro] = useState(false);
  const [conseil, setConseil] = useState<ContactCopro[] | null>(null);
  const [dossiers, setDossiers] = useState<DossierAffiche[] | null>(null);
  const [dossierId, setDossierId] = useState("");
  const [modeleId, setModeleId] = useState("");
  // L'objet complet, éditable : la copro choisie y pose son préfixe (code · adresse) pour le tri.
  const [objet, setObjet] = useState("");
  const [corps, setCorps] = useState("");
  const [fichiers, setFichiers] = useState<FichierJoint[]>([]);
  const [chargement, demarrer] = useTransition();
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  // Garde anti-course : seule la DERNIÈRE copro choisie peut remplir CS et dossiers.
  const derniereCopro = useRef("");

  const copro = useMemo(() => copros.find((c) => c.reference.toUpperCase() === refCopro.trim().toUpperCase()) ?? proposees.find((c) => c.reference === refCopro) ?? null, [copros, proposees, refCopro]);

  function choisirCopro(ref: string) {
    const nouvelle = copros.find((x) => x.reference.toUpperCase() === ref.trim().toUpperCase()) ?? proposees.find((x) => x.reference === ref) ?? null;
    setObjet((o) => avecPrefixe(o, copro, nouvelle));
    setRefCopro(ref);
    setConseil(null);
    setDossiers(null);
    setDossierId("");
    const c = copros.find((x) => x.reference.toUpperCase() === ref.trim().toUpperCase()) ?? proposees.find((x) => x.reference === ref);
    derniereCopro.current = c?.reference ?? "";
    if (!c) return;
    demarrer(async () => {
      const [rc, rd] = await Promise.all([
        listerContactsCompositionAction({ reference: c.reference }),
        listerDossiersCompositionAction({ reference: c.reference }),
      ]);
      if (derniereCopro.current !== c.reference) return;
      if (rc.ok) setConseil((rc.donnees ?? []).filter((x) => x.qualite === "conseil_syndical"));
      if (rd.ok) setDossiers(rd.donnees ?? []);
    });
  }

  // Une personne choisie en « À » : ses immeubles deviennent les choix de rattachement.
  function personneChoisie(d: DestinataireTrouve) {
    const nouvelles = [...proposees, ...d.copros.filter((c) => !proposees.some((p) => p.reference === c.reference))];
    setProposees(nouvelles);
    // Une seule copro connue pour cette personne : elle est choisie d'office.
    if (!copro && d.copros.length === 1) choisirCopro(d.copros[0]!.reference);
  }

  function ajouterConseil() {
    if (!conseil?.length) return;
    const deja = new Set(adresses(a));
    const ajout = conseil.filter((c) => !deja.has(c.email)).map((c) => ({ cle: c.email, nom: c.nom, emails: [c.email] }));
    setA((l) => [...l, ...ajout]);
  }

  async function ajouterFichiers(liste: FileList | null) {
    if (!liste?.length) return;
    const ajout: FichierJoint[] = [];
    for (const f of Array.from(liste)) {
      if (f.size > TAILLE_MAX_FICHIER) {
        toast.warn(`« ${f.name} » dépasse 3 Mo : à envoyer depuis Outlook.`);
        continue;
      }
      ajout.push({ nom: f.name, contentType: f.type, taille: f.size, base64: await enBase64(f) });
    }
    setFichiers((l) => [...l, ...ajout].slice(0, 10));
  }

  const variables: VariablesModele = {
    copro_code: copro?.reference ?? "",
    copro_nom: copro?.nom ?? "",
    copro_adresse: copro?.adresse ?? "",
    destinataire_nom: a[0]?.nom ?? "",
    gestionnaire_nom: gestionnaireNom,
    agence,
    date: new Date().toLocaleDateString("fr-FR"),
  };

  function appliquerModele(id: string) {
    setModeleId(id);
    const m = MODELES_MAIL.find((x) => x.id === id);
    if (!m) return;
    setObjet(copro ? objetCompose(copro, m.sujet) : m.sujet);
    setCorps(fusionnerModele(m.corps, variables));
  }

  const pretAEnvoyer = Boolean(objet.trim().replace(/\s*-$/, "") && adresses(a).length && corps.trim());

  function creerBrouillon() {
    if (!pretAEnvoyer) {
      toast.err("Il manque un destinataire, l'objet ou le message.");
      return;
    }
    setEnvoiEnCours(true);
    demarrer(async () => {
      const r = await creerBrouillonCompositionAction({
        objet: objet.trim().replace(/\s*-$/, ""),
        corps,
        a: adresses(a),
        cc: adresses(cc),
        ...(dossierId ? { dossierId } : {}),
        fichiers: fichiers.map(({ nom, contentType, base64 }) => ({ nom, contentType, base64 })),
      });
      setEnvoiEnCours(false);
      if (!r.ok) {
        toast.err(r.erreur);
        return;
      }
      const res = r.donnees;
      if (!res || res.simulation) {
        toast.ok("Aperçu vérifié : aucune boîte branchée ici, aucun brouillon créé.");
        return;
      }
      toast.ok(`Brouillon créé dans ${res.boite ?? "la boîte"}, à relire puis envoyer dans Outlook.`);
      if (res.rattache === true) toast.ok("Le mail est inscrit au journal du dossier.");
      if (res.rattache === false) toast.warn("Brouillon créé, mais le rattachement au dossier a échoué.");
      onTermine?.();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <ChampPersonnes
        label="À"
        personnes={a}
        onChange={setA}
        onChoisie={personneChoisie}
        placeholder="Nom du copropriétaire (ou une adresse)…"
      />
      <ChampPersonnes label="Cc" personnes={cc} onChange={setCc} placeholder="Nom ou adresse…" />

      {/* Rattachement : l'immeuble de la personne, ou aucun (perso). */}
      <div className="flex flex-col gap-2">
        <span className="text-body text-ink-2">Rattacher à</span>
        <div className="flex flex-wrap gap-1.5">
          <ChoixCopro actif={!refCopro} onClick={() => choisirCopro("")}>
            Aucune copropriété
          </ChoixCopro>
          {proposees.map((c) => (
            <ChoixCopro key={c.reference} actif={refCopro === c.reference} onClick={() => choisirCopro(c.reference)}>
              <span className="font-mono">{prefixeObjetCopro(c)}</span>
              <span className="text-ink-3"> · {LIBELLE_QUALITE[c.qualite] ?? c.qualite}</span>
            </ChoixCopro>
          ))}
          {!autreCopro ? (
            <button type="button" onClick={() => setAutreCopro(true)} className="text-meta text-ink-3 underline hover:text-ink">
              autre copropriété…
            </button>
          ) : null}
        </div>
        {autreCopro && (
          <>
            <Input list="comp-copros" value={proposees.some((p) => p.reference === refCopro) ? "" : refCopro} onChange={(e) => choisirCopro(e.target.value)} placeholder="Code (S247)" autoComplete="off" largeur="auto" />
            <datalist id="comp-copros">
              {copros.map((c) => (
                <option key={c.reference} value={c.reference}>
                  {prefixeObjetCopro(c)}
                </option>
              ))}
            </datalist>
          </>
        )}
        {copro && (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={ajouterConseil} disabled={!conseil?.length} title="Ajoute tous les membres du conseil syndical en « À »">
              <Users strokeWidth={1.5} />
              {conseil === null ? "Conseil syndical…" : `Conseil syndical (${conseil.length})`}
            </Button>
            <Select largeur="auto" value={dossierId} onChange={(e) => setDossierId(e.target.value)} disabled={!dossiers?.length} aria-label="Dossier où ranger ce mail" className="max-w-[320px]">
              <option value="">{dossiers?.length ? "Ranger dans un dossier…" : "Aucun dossier ouvert"}</option>
              {(dossiers ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {TYPE_DOSSIER_LABEL[d.type]} · {d.titre}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
        <Field label="Modèle" htmlFor="comp-modele">
          <Select id="comp-modele" value={modeleId} onChange={(e) => appliquerModele(e.target.value)}>
            <option value="">Aucun</option>
            {MODELES_MAIL.map((m) => (
              <option key={m.id} value={m.id}>
                {m.titre}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Objet" htmlFor="comp-objet">
          <Input id="comp-objet" value={objet} onChange={(e) => setObjet(e.target.value)} placeholder="Objet du message" />
        </Field>
      </div>
      <Textarea value={corps} onChange={(e) => setCorps(e.target.value)} rows={10} placeholder="Votre message…" aria-label="Message" />

      <div className="flex flex-wrap items-center gap-1.5">
        <label className={classesBouton({ size: "sm" })}>
          <Paperclip strokeWidth={1.5} />
          Ajouter une pièce jointe
          <input
            type="file"
            multiple
            className="sr-only"
            onChange={(e) => {
              void ajouterFichiers(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        {fichiers.map((f, i) => (
          <span key={`${f.nom}-${i}`} className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-full border border-line text-meta text-ink-2">
            <span className="truncate max-w-[200px]">{f.nom}</span>
            <button type="button" onClick={() => setFichiers((l) => l.filter((_, k) => k !== i))} aria-label={`Retirer ${f.nom}`} className="text-ink-3 hover:text-err-700">
              <X strokeWidth={1.5} className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>

      {signatureHtml ? (
        <div>
          <span className="text-meta text-ink-3">Signature (ajoutée au brouillon)</span>
          <iframe title="Signature" sandbox="" srcDoc={signatureHtml} className="mt-1 w-full h-[170px] rounded-md border border-line bg-white" />
        </div>
      ) : null}

      {!brouillonPossible && (
        <Callout ton="warn">Aperçu seulement : la boîte partagée n&apos;est pas branchée ici, aucun brouillon ne sera créé.</Callout>
      )}
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-3">
        <span className="text-meta text-ink-3 mr-auto">
          {brouillonPossible ? `Brouillon dans ${boite} : à relire puis envoyer dans Outlook.` : null}
        </span>
        <Button variant="primary" disabled={!pretAEnvoyer || envoiEnCours || chargement} loading={envoiEnCours} onClick={creerBrouillon}>
          {brouillonPossible ? "Créer le brouillon" : "Vérifier l'aperçu"}
        </Button>
      </div>
    </div>
  );
}

function ChoixCopro({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={actif}
      onClick={onClick}
      className={
        "h-7 px-2.5 rounded-full text-meta border transition-colors " +
        (actif ? "bg-green-50 text-green-700 border-green-500/30 font-medium" : "bg-surface text-ink-2 border-line hover:bg-surface-2")
      }
    >
      {children}
    </button>
  );
}

/** Un champ À ou Cc : on tape un nom, l'annuaire propose les personnes ; une adresse tapée passe aussi. */
function ChampPersonnes({
  label,
  personnes,
  onChange,
  onChoisie,
  placeholder,
}: {
  label: string;
  personnes: Personne[];
  onChange: (l: Personne[]) => void;
  onChoisie?: (d: DestinataireTrouve) => void;
  placeholder: string;
}) {
  const [saisie, setSaisie] = useState("");
  // Résultats rangés par la saisie qui les a demandés : on n'affiche que ceux de la saisie en cours.
  const [trouves, setTrouves] = useState<{ q: string; liste: DestinataireTrouve[] } | null>(null);
  const q = saisie.trim();
  const chercher = q.length >= 3 && !EMAIL.test(q);
  const resultats = chercher && trouves?.q === q ? trouves.liste : null;

  useEffect(() => {
    if (!chercher) return;
    const t = setTimeout(() => {
      void rechercherDestinatairesAction({ texte: q }).then((r) => setTrouves({ q, liste: r.ok ? (r.donnees ?? []) : [] }));
    }, 300);
    return () => clearTimeout(t);
  }, [q, chercher]);

  function ajouter(p: Personne) {
    if (!personnes.some((x) => x.cle === p.cle)) onChange([...personnes, p]);
    setSaisie("");
  }
  function ajouterSaisie() {
    const e = saisie.trim().replace(/[,;]$/, "");
    if (EMAIL.test(e)) ajouter({ cle: e.toLowerCase(), nom: "", emails: [e.toLowerCase()] });
  }

  return (
    <div className="relative flex items-start gap-2">
      <span className="w-6 shrink-0 pt-1.5 text-body text-ink-3">{label}</span>
      <div className="flex-1 flex flex-wrap items-center gap-1 min-h-8 rounded-md border border-line px-1.5 py-1">
        {personnes.map((p) => (
          <span key={p.cle} className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-full bg-surface-3 text-meta text-ink-2 max-w-full">
            <span className="truncate">
              {p.nom ? <span className="text-ink">{p.nom} </span> : null}
              {p.emails.join(" ; ")}
            </span>
            <button type="button" onClick={() => onChange(personnes.filter((x) => x.cle !== p.cle))} aria-label={`Retirer ${p.nom || p.emails[0]}`} className="text-ink-3 hover:text-err-700">
              <X strokeWidth={2} className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "," || e.key === ";") {
              e.preventDefault();
              if (resultats?.length === 1) {
                const d = resultats[0]!;
                ajouter({ cle: d.cle, nom: d.nom, emails: d.emails });
                onChoisie?.(d);
              } else ajouterSaisie();
            }
          }}
          onBlur={ajouterSaisie}
          placeholder={personnes.length ? "" : placeholder}
          aria-label={`Destinataires ${label}`}
          className="flex-1 min-w-[160px] h-6 bg-transparent text-body text-ink outline-none placeholder:text-ink-3"
        />
      </div>
      {resultats && (
        <ul className="absolute left-8 right-0 top-full mt-1 z-20 max-h-72 overflow-y-auto rounded-lg border border-line bg-surface shadow-2 py-1">
          {resultats.length === 0 && <li className="px-3 py-2 text-meta text-ink-3">Personne de ce nom dans l&apos;annuaire Crypto.</li>}
          {resultats.map((d) => (
            <li key={d.cle}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  ajouter({ cle: d.cle, nom: d.nom, emails: d.emails });
                  onChoisie?.(d);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-surface-2"
              >
                <span className="text-body text-ink">{d.nom || d.emails[0]}</span>
                {d.casquette ? <span className="text-meta text-ink-3"> · {d.casquette}</span> : null}
                <span className="block text-meta text-ink-3 truncate">{d.emails.join(" ; ")}</span>
                {d.copros.length > 0 && (
                  <span className="block text-meta text-ink-2 truncate">{d.copros.map((c) => prefixeObjetCopro(c)).join("  |  ")}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
