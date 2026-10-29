"use client";

// « Envoyer un e-mail » (façon F1 de Crypto, en plus simple) : on tape le NOM de la personne,
// l'annuaire rend la personne avec TOUTES ses adresses (certains en veulent deux) et ses
// immeubles ; on choisit l'immeuble auquel rattacher le mail, ou aucun (c'est parfois perso).
// Le conseil syndical s'ajoute d'un clic, toute la copropriété aussi (en copie cachée, REA-305).
// Avec le conseil syndical, l'autre membre du binôme de la copro arrive en Cc, comme sur Crypto
// (28/10/2026) : retirable d'un clic, et retiré de lui-même si plus aucun membre du CS n'est en « À ».
// L'objet est taggé par la copro (code · nom) pour le tri.
// Taper le code d'une copro dans « À » (« S247 ») propose « Conseil syndical · S247 … » et
// « Toute la copropriété · S247 … » : un clic remplit copro, destinataires, objet et copie au
// binôme (décision 11, 29/10/2026 : 3 clics au lieu de 8). Avec deux destinataires ou plus en
// « À », « Envoyer séparément » fait un mail par personne (décision 10). Les collègues passent
// en tête de l'autocomplétion, et l'adresse perso d'un collègue se fait confirmer (décision 14).
// Pièces jointes et signature (Signitic) partent avec. Le bouton ENVOIE quand l'envoi depuis
// la boîte partagée est ouvert (MAIL_ENVOI=on) ; sinon il crée un BROUILLON, relu puis
// envoyé depuis Outlook (ADR-047). Fichiers et destinataires se glissent-déposent. Les
// fichiers (25 Mo) sont déposés par tranches sur le brouillon déjà créé, comme une réponse.

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { Building2, Paperclip, Users, X } from "lucide-react";
import { Button, classesBouton } from "@/components/ui/button";
import { Choix, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import {
  adresseMailValide,
  adressesTouteLaCopro,
  controleTouteLaCopro,
  enLots,
  envoisSepares,
  fusionnerModele,
  phraseEnvoisSepares,
  raccourcisCopro,
  sansPolitesseEnDouble,
  objetCompose,
  prefixeObjetCopro,
  remplacerPrefixeCopro,
  resumeDestinataires,
  sujetDeLObjet,
  type ConseilComposition,
  type ControleTouteLaCopro,
  type SourceConseilComposition,
  type CoproChoisissable,
  type DestinataireTrouve,
  type ModeleMail,
  type NatureRaccourciCopro,
  type RaccourciCopro,
  type VariablesModele,
} from "@/lib/domain/mes-emails-composition";
import { alertesAdressePersonnelle, type Collegue } from "@/lib/domain/destinataires-collegues";
import {
  abandonnerCompositionAction,
  finaliserCompositionAction,
  listerColleguesAction,
  listerContactsCompositionAction,
  listerDossiersCompositionAction,
  preparerCompositionAction,
  rechercherDestinatairesAction,
} from "@/app/mes-emails/composer/actions";
import { NB_MAX_FICHIERS, TAILLE_MAX_FICHIER, TAILLE_MAX_TOTALE } from "@/lib/domain/piece-jointe-flux";
import { deposerFichier } from "./deposer-fichier";
import { TYPE_DOSSIER_LABEL, type TypeDossier } from "@/lib/domain/dossier";
import { pastilleGlissable, useDepotDestinataire, useDepotFichiers } from "./glisser-deposer";
import { EditeurRiche } from "./editeur-riche";
import { BoutonReformuler } from "./bouton-reformuler";
import { htmlVersTexte, texteVersHtml } from "@/lib/domain/mes-emails-html";
import { conseilEncoreDestinataire, phraseCopieBinome } from "@/lib/domain/copie-binome";
import { useAlerteSortie } from "./alerte-sortie";
import { SignatureRepliee } from "./signature-repliee";

type DossierAffiche = { id: string; titre: string; type: TypeDossier };

/** Une personne en destinataire : toutes ses adresses partent ensemble. */
export type Personne = { cle: string; nom: string; emails: string[] };

/** Un fichier reste un File jusqu'à l'envoi ; `progres` (0 à 1) pendant son dépôt sur le brouillon. */
type FichierJoint = { nom: string; taille: number; fichier: File; progres?: number };

type Props = {
  copros: CoproChoisissable[];
  gestionnaireNom: string;
  agence: string;
  /** Graph branché + vraie boîte partagée : le bouton crée un brouillon (sinon aperçu). */
  brouillonPossible: boolean;
  /** Le bouton envoie pour de vrai (MAIL_ENVOI=on) au lieu de créer un brouillon. */
  envoiDirect?: boolean;
  boite: string | null;
  /** Signature du gestionnaire (Signitic), posée sous le message. */
  signatureHtml?: string | null;
  /** Brouillon créé : la fenêtre qui contient le compositeur peut se fermer. */
  onTermine?: () => void;
  /** Modèles proposés (ceux de l'agence et du cabinet, cf. services/mes-emails/modeles-mail). */
  modeles: ModeleMail[];
  /** Pilote (super-admin) : le message se met en forme (REA-345). Hors pilote, zone de texte. */
  pilote?: boolean;
  /** « Reformuler » proposé (ADR-051) : interrupteur posé et clé présente. */
  reformulation?: boolean;
  /** Prévient la fenêtre qu'une saisie est en cours (elle ne se ferme plus d'un clic à côté). */
  onSaisie?: (enCours: boolean) => void;
};

const LIBELLE_QUALITE: Record<string, string> = {
  conseil_syndical: "conseil syndical",
  coproprietaire: "copropriétaire",
  locataire: "locataire",
  professionnel: "professionnel",
  autre: "autre",
};

// D'où vient le conseil syndical proposé : dit sobrement, comme le mail de date d'AG.
const LIBELLE_SOURCE_CONSEIL: Record<SourceConseilComposition, string> = {
  estale: "ESTALE",
  crypto: "liste de diffusion",
  aucune: "aucune liste : adresses à saisir",
};
const TITRE_SOURCE_CONSEIL: Record<SourceConseilComposition, string> = {
  estale: "Ajoute en « À » les membres du conseil syndical connus dans ESTALE",
  crypto: "Ajoute en « À » la liste de diffusion du conseil syndical (fiche copro, mise à jour au récap d'AG)",
  aucune: "Aucune liste de conseil syndical pour cette copropriété : tapez les noms ci-dessus",
};

// Même affichage que les pièces d'une réponse (mes-emails-vue).
function formatTaille(octets: number): string {
  if (octets >= 1_000_000) return `${(octets / 1_000_000).toFixed(1)} Mo`;
  if (octets >= 1000) return `${Math.round(octets / 1000)} Ko`;
  return `${octets} o`;
}

/** Clé des personnes mises en Cc d'office avec le conseil syndical (binôme de la copro). */
const CLE_COPIE_BINOME = "binome:";
const estCopieBinome = (p: Personne) => p.cle.startsWith(CLE_COPIE_BINOME);

const MESSAGE_OBJET_REDUIT = "L'objet ne contient que la copropriété : ajoutez le sujet du mail.";

/**
 * Les immeubles des destinataires choisis, proposés dans « Rattacher à » mais laissés de côté :
 * on les rappelle dans la confirmation d'un envoi sans copro. Rien de deviné, rien à charger.
 */
function suggestionCopro(proposees: readonly CoproChoisissable[]): string {
  if (!proposees.length) return "";
  const noms = proposees.slice(0, 3).map((c) => prefixeObjetCopro(c, false));
  const reste = proposees.length - noms.length;
  const liste = noms.join(", ") + (reste > 0 ? ` et ${reste} autre${reste > 1 ? "s" : ""}` : "");
  return proposees.length === 1
    ? ` Les destinataires sont rattachés à ${liste} : choisissez-la dans « Rattacher à » si le mail la concerne.`
    : ` Les destinataires sont rattachés à ${liste} : choisissez la bonne dans « Rattacher à » si le mail en concerne une.`;
}

export const adresses = (l: Personne[]) => [...new Set(l.flatMap((p) => p.emails.map((e) => e.toLowerCase())))];

/**
 * Les collègues (adresses REAL31), lus une fois à l'ouverture : de quoi reconnaître à l'envoi
 * l'adresse personnelle d'un collègue (décision 14). Lecture ratée : liste vide, rien ne bloque.
 */
export function useCollegues(): Collegue[] {
  const [liste, setListe] = useState<Collegue[]>([]);
  useEffect(() => {
    let vivant = true;
    void listerColleguesAction().then((r) => {
      if (vivant && r.ok) setListe(r.donnees ?? []);
    });
    return () => {
      vivant = false;
    };
  }, []);
  return liste;
}

/** « Collègue » (salarié, adresse REAL31) ou « Client » (fiche d'annuaire au nom d'un collègue). */
export function BadgeDestinataire({ genre }: { genre: DestinataireTrouve["genre"] }) {
  if (genre === "collegue") return <Badge ton="neutral">Collègue</Badge>;
  if (genre === "client") {
    return (
      <Badge ton="warn" title="Fiche de client (copropriétaire…) au nom d'un collègue : pas son adresse REAL31">
        Client
      </Badge>
    );
  }
  return null;
}

export function Compositeur({ copros, gestionnaireNom, agence, brouillonPossible, envoiDirect = false, boite, signatureHtml, onTermine, modeles, pilote = false, reformulation = false, onSaisie }: Props) {
  const toast = useToast();
  const confirmer = useConfirm();
  const [a, setA] = useState<Personne[]>([]);
  const [cc, setCc] = useState<Personne[]>([]);
  // Les immeubles proposés : ceux des personnes choisies.
  const [proposees, setProposees] = useState<(CoproChoisissable & { qualite: string })[]>([]);
  const [refCopro, setRefCopro] = useState("");
  const [autreCopro, setAutreCopro] = useState(false);
  // Le conseil syndical : même source que le mail de date d'AG (ESTALE, sinon liste de diffusion).
  const [conseil, setConseil] = useState<ConseilComposition | null>(null);
  // L'autre membre du binôme de la copro, mis en Cc avec le conseil syndical (28/10/2026).
  const [copieBinome, setCopieBinome] = useState<{ nomComplet: string; email: string }[]>([]);
  // Les adresses du CS ajoutées d'un clic : tant que l'une reste en « À », la copie du binôme a un sens.
  const conseilAjoute = useRef<string[]>([]);
  // Toute la copropriété (REA-305) : les adresses des copropriétaires, envoyées en copie cachée.
  const [touteCopro, setTouteCopro] = useState<string[] | null>(null);
  // Garde-fou de l'envoi à toute la copropriété (REA-356) : N adresses pour M copropriétaires.
  const [controleCopro, setControleCopro] = useState<ControleTouteLaCopro | null>(null);
  const [cciCopro, setCciCopro] = useState(false);
  const [dossiers, setDossiers] = useState<DossierAffiche[] | null>(null);
  const [dossierId, setDossierId] = useState("");
  const [modeleId, setModeleId] = useState("");
  // L'objet complet, éditable : la copro choisie y pose son préfixe (code · nom) pour le tri.
  const [objet, setObjet] = useState("");
  const [corps, setCorps] = useState("");
  // Mise en forme (REA-345, pilote) : le HTML de l'éditeur ; `corps` en reste le texte, pour
  // les contrôles et pour reconnaître un modèle non retouché.
  const [corpsHtml, setCorpsHtml] = useState("");
  function majCorpsTexte(texte: string) {
    setCorps(texte);
    setCorpsHtml(texteVersHtml(texte));
  }
  const [fichiers, setFichiers] = useState<FichierJoint[]>([]);
  const [chargement, demarrer] = useTransition();
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  // Garde anti-course : seule la DERNIÈRE copro choisie peut remplir CS et dossiers.
  const derniereCopro = useRef("");
  const collegues = useCollegues();
  // Envoi séparé (décision 10) : un mail par personne en « À », chacun ne voit que lui.
  const [separe, setSepare] = useState(false);
  const champObjet = useRef<HTMLInputElement>(null);
  // Les destinataires au moment présent, pour ce qui arrive après un chargement (raccourci copro).
  const etat = useRef({ a, cc });
  useEffect(() => {
    etat.current = { a, cc };
  }, [a, cc]);

  const copro = useMemo(() => copros.find((c) => c.reference.toUpperCase() === refCopro.trim().toUpperCase()) ?? proposees.find((c) => c.reference === refCopro) ?? null, [copros, proposees, refCopro]);

  // `ensuite` : le raccourci tapé dans « À » (« Conseil syndical · S247 ») à appliquer dès que
  // les contacts de la copro sont chargés.
  function choisirCopro(ref: string, ensuite?: NatureRaccourciCopro) {
    const nouvelle = copros.find((x) => x.reference.toUpperCase() === ref.trim().toUpperCase()) ?? proposees.find((x) => x.reference === ref) ?? null;
    setObjet((o) => remplacerPrefixeCopro(o, copro, nouvelle));
    const modele = modeles.find((x) => x.id === modeleId);
    if (modele && corps === corpsDuModele.current) remplirModele(modele, nouvelle);
    setRefCopro(ref);
    setConseil(null);
    setCopieBinome([]);
    setTouteCopro(null);
    setControleCopro(null);
    setCciCopro(false);
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
      if (rc.ok) {
        const contacts = rc.donnees?.contacts ?? [];
        const cs: ConseilComposition = rc.donnees?.conseil ?? { source: "aucune", membres: [] };
        const binome = rc.donnees?.copieBinome ?? [];
        const toute = adressesTouteLaCopro(contacts);
        setConseil(cs);
        setCopieBinome(binome);
        setTouteCopro(toute);
        setControleCopro(controleTouteLaCopro(contacts, rc.donnees?.lotsPrincipaux));
        if (ensuite === "conseil") {
          if (cs.membres.length) ajouterConseil(cs, binome);
          else toast.warn(`Aucune liste de conseil syndical pour ${c.reference} : tapez les noms dans « À ».`);
        }
        if (ensuite === "toute") {
          if (toute.length) setCciCopro(true);
          else toast.warn(`Aucune adresse de copropriétaire connue pour ${c.reference} (copro ESTALE : passer par le mailing ESTALE).`);
        }
      } else if (ensuite) toast.err(rc.erreur);
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

  // Le « À » change : plus aucun membre du CS ajouté d'un clic -> la copie du binôme s'en va.
  function majA(l: Personne[]) {
    setA(l);
    if (!conseilEncoreDestinataire(adresses(l), conseilAjoute.current)) {
      conseilAjoute.current = [];
      setCc((c) => (c.some(estCopieBinome) ? c.filter((p) => !estCopieBinome(p)) : c));
    }
  }

  // Une personne glissée de « À » vers « Cc » (ou l'inverse).
  function deplacer(depuis: string, cle: string) {
    const source = depuis === "a" ? a : cc;
    const p = source.find((x) => x.cle === cle);
    if (!p) return;
    if (depuis === "a") {
      majA(a.filter((x) => x.cle !== cle));
      setCc((l) => (l.some((x) => x.cle === cle) ? l : [...l, p]));
    } else {
      setCc((l) => l.filter((x) => x.cle !== cle));
      setA((l) => (l.some((x) => x.cle === cle) ? l : [...l, p]));
    }
  }

  // Le CS et le binôme passés en paramètres quand ils arrivent d'un raccourci (pas encore dans l'état).
  function ajouterConseil(cs: ConseilComposition | null = conseil, binome: typeof copieBinome = copieBinome) {
    if (!cs?.membres.length) return;
    const { a: dejaA, cc: dejaCc } = etat.current;
    const deja = new Set(adresses(dejaA));
    const ajout = cs.membres.filter((c) => !deja.has(c.email)).map((c) => ({ cle: c.email, nom: c.nom, emails: [c.email] }));
    setA((l) => [...l, ...ajout.filter((p) => !l.some((x) => x.cle === p.cle))]);
    conseilAjoute.current = cs.membres.map((c) => c.email);
    // Le binôme en Cc (28/10/2026), sauf adresse déjà en « À » ou en « Cc ».
    const presents = new Set([...deja, ...ajout.flatMap((p) => p.emails), ...adresses(dejaCc)]);
    const copie = binome.filter((m) => !presents.has(m.email.toLowerCase())).map((m) => ({ cle: `${CLE_COPIE_BINOME}${m.email}`, nom: m.nomComplet, emails: [m.email] }));
    if (copie.length) setCc((l) => [...l, ...copie.filter((p) => !l.some((x) => x.cle === p.cle))]);
  }

  // « Conseil syndical · S247 » ou « Toute la copropriété · S247 » choisi dans « À » : la copro
  // est rattachée (préfixe d'objet compris), les destinataires suivent au chargement, et le
  // curseur part dans l'objet, après le préfixe.
  function choisirRaccourci(r: RaccourciCopro<CoproChoisissable>) {
    if (!proposees.some((p) => p.reference === r.copro.reference)) setAutreCopro(true);
    choisirCopro(r.copro.reference, r.nature);
    requestAnimationFrame(() => {
      const champ = champObjet.current;
      if (!champ) return;
      champ.focus();
      champ.setSelectionRange(champ.value.length, champ.value.length);
    });
  }
  const raccourcisPour = (saisie: string): RaccourciChamp[] =>
    raccourcisCopro(saisie, copros).map((r) => ({
      cle: `${r.nature}:${r.copro.reference}`,
      libelle: r.libelle,
      detail: r.nature === "conseil" ? "en « À », le binôme en copie" : "en copie cachée, aucun ne voit les autres",
      icone: r.nature === "conseil" ? "conseil" : "copro",
      onChoisir: () => choisirRaccourci(r),
    }));
  const phraseBinome = phraseCopieBinome(cc.filter(estCopieBinome).map((p) => p.nom));

  // Mêmes limites que la réponse (REA-421) : 25 Mo par fichier, 25 Mo au total, 10 fichiers.
  function ajouterFichiers(liste: FileList | null) {
    if (!liste?.length) return;
    const ajout: FichierJoint[] = [];
    let total = fichiers.reduce((t, f) => t + f.taille, 0);
    for (const f of Array.from(liste)) {
      if (f.size > TAILLE_MAX_FICHIER) {
        toast.warn(`« ${f.name} » dépasse 25 Mo : à déposer sur SharePoint et à envoyer en lien.`);
        continue;
      }
      if (total + f.size > TAILLE_MAX_TOTALE) {
        toast.warn(`« ${f.name} » ferait dépasser 25 Mo de pièces jointes : à déposer sur SharePoint et à envoyer en lien.`);
        continue;
      }
      total += f.size;
      ajout.push({ nom: f.name, taille: f.size, fichier: f });
    }
    setFichiers((l) => [...l, ...ajout].slice(0, NB_MAX_FICHIERS));
  }
  /** La progression du dépôt d'un fichier (0 à 1) ; index null : on efface toutes les barres. */
  const majProgres = (i: number | null, fraction: number) =>
    setFichiers((l) => l.map((f, k) => (i === null ? { nom: f.nom, taille: f.taille, fichier: f.fichier } : k === i ? { ...f, progres: fraction } : f)));

  const depot = useDepotFichiers((l) => ajouterFichiers(l));

  const variablesPour = (c: CoproChoisissable | null): VariablesModele => ({
    copro_code: c?.reference ?? "",
    copro_nom: c?.nom ?? "",
    copro_adresse: c?.adresse ?? "",
    destinataire_nom: a[0]?.nom ?? "",
    gestionnaire_nom: gestionnaireNom,
    agence,
    date: new Date().toLocaleDateString("fr-FR"),
  });
  // Le texte tel que le modèle l'a rempli : tant que la personne n'y a pas touché, choisir la
  // copro APRÈS le modèle le remplit à nouveau (« Immeuble concerné » restait vide).
  const corpsDuModele = useRef("");

  function remplirModele(m: ModeleMail, c: CoproChoisissable | null) {
    const texte = sansPolitesseEnDouble(fusionnerModele(m.corps, variablesPour(c)), signatureHtml);
    corpsDuModele.current = texte;
    majCorpsTexte(texte);
  }

  async function appliquerModele(id: string) {
    const m = modeles.find((x) => x.id === id);
    // Un texte déjà écrit (autre que celui d'un modèle) ne s'écrase pas sans le demander.
    if (m && corps.trim() && corps !== corpsDuModele.current) {
      const ok = await confirmer({
        titre: "Remplacer le message par le modèle ?",
        message: "Le texte déjà écrit sera remplacé par celui du modèle.",
        confirmer: "Remplacer",
      });
      if (!ok) return;
    }
    setModeleId(id);
    if (!m) return;
    setObjet(copro ? objetCompose(copro, m.sujet) : m.sujet);
    remplirModele(m, copro);
  }

  // Quelque chose est écrit : destinataire, objet au-delà du préfixe copro, message ou fichier.
  const [parti, setParti] = useState(false);
  const saisieEnCours =
    !parti && Boolean(a.length || cc.length || fichiers.length || corps.trim() || sujetDeLObjet(objet, copro));
  useAlerteSortie(saisieEnCours);
  useEffect(() => {
    onSaisie?.(saisieEnCours);
  }, [onSaisie, saisieEnCours]);

  async function annuler() {
    if (saisieEnCours) {
      const ok = await confirmer({
        titre: "Abandonner ce mail ?",
        message: "Les destinataires, l'objet, le message et les pièces jointes saisis seront perdus.",
        confirmer: "Abandonner",
        annuler: "Continuer l'écriture",
        danger: true,
      });
      if (!ok) return;
    }
    onTermine?.();
  }

  const cci = cciCopro ? (touteCopro ?? []) : [];
  // Envoi séparé : proposé dès deux personnes en « À » ; la découpe (et ses refus) vient du domaine.
  const separePossible = a.filter((p) => p.emails.length).length >= 2;
  const decoupe = separe && separePossible ? envoisSepares(a.map((p) => p.emails), adresses(cc), cci) : null;
  const envoisPrets = decoupe?.ok ? decoupe.envois : null;
  // L'objet doit dire de quoi parle le mail : le préfixe copro seul ne suffit pas (incident du 28/10/2026).
  const aUnSujet = Boolean(sujetDeLObjet(objet, copro));
  const pretAEnvoyer = Boolean(aUnSujet && (adresses(a).length || cci.length) && corps.trim() && (!decoupe || decoupe.ok));
  // Tout est prêt sauf l'objet, réduit à la copro : on dit pourquoi le bouton reste grisé.
  const objetReduitACopro = Boolean(copro && !aUnSujet && (adresses(a).length || cci.length) && corps.trim());
  const adressesInvalides = [...adresses(a), ...adresses(cc)].filter((e) => !adresseMailValide(e));

  async function creerBrouillon() {
    if (adressesInvalides.length) {
      toast.err(`Adresse invalide : ${adressesInvalides.map((e) => `« ${e} »`).join(", ")}. À retirer ou corriger avant l'envoi.`);
      return;
    }
    if (objetReduitACopro) {
      toast.err(MESSAGE_OBJET_REDUIT);
      return;
    }
    if (!pretAEnvoyer) {
      toast.err("Il manque un destinataire, l'objet ou le message.");
      return;
    }
    if (decoupe && !decoupe.ok) {
      toast.err(decoupe.motif);
      return;
    }
    // L'adresse personnelle d'un collègue (incident Elsa, décision 14) : dite dans la
    // confirmation, jamais bloquante. Une seule confirmation à la fois : elle s'y ajoute.
    const avertissementCollegue = alertesAdressePersonnelle([...a, ...cc], collegues).join(" ");
    let confirme = false;
    // Envoi séparé : UNE confirmation qui dit combien de mails partiront (et l'absence de copro).
    if (envoisPrets && brouillonPossible) {
      const n = envoisPrets.length;
      const ok = await confirmer({
        titre: envoiDirect ? `Envoyer ${n} mails séparés ?` : `Créer ${n} brouillons séparés ?`,
        message:
          phraseEnvoisSepares(n, envoiDirect) +
          (copro ? "" : " Aucune copropriété n'est choisie : ces mails ne seront rattachés à aucune copro." + suggestionCopro(proposees)),
        confirmer: envoiDirect ? `Envoyer les ${n} mails` : `Créer les ${n} brouillons`,
        ...(avertissementCollegue ? { avertissement: avertissementCollegue } : {}),
      });
      if (!ok) return;
      confirme = true;
    }
    // Sans copro, le mail n'est rattaché à rien et le tri ne le classera pas : on le fait
    // confirmer, sans l'interdire (identifiants extranet, pré-état daté… sont légitimes).
    // Toute la copropriété suppose une copro : les deux confirmations ne s'empilent jamais.
    if (!copro && brouillonPossible && !confirme) {
      const ok = await confirmer({
        titre: envoiDirect ? "Envoyer sans copropriété ?" : "Créer le brouillon sans copropriété ?",
        message:
          "Aucune copropriété n'est choisie : ce mail ne sera rattaché à aucune copro et le tri ne pourra pas le classer." +
          suggestionCopro(proposees),
        confirmer: envoiDirect ? "Envoyer quand même" : "Créer le brouillon quand même",
        ...(avertissementCollegue ? { avertissement: avertissementCollegue } : {}),
      });
      if (!ok) return;
      confirme = true;
    }
    // Un envoi à toute la copropriété part à des dizaines de personnes : on le fait confirmer.
    if (cci.length && brouillonPossible) {
      const lots = enLots(cci).length;
      const ok = await confirmer({
        titre: envoiDirect ? "Envoyer à toute la copropriété ?" : "Préparer le mail à toute la copropriété ?",
        message:
          (controleCopro
            ? `${controleCopro.resume}, en copie cachée : aucun ne verra les autres.`
            : `${cci.length} adresses en copie cachée : aucun copropriétaire ne verra les autres.`) +
          (lots > 1 ? ` Le mail partira en ${lots} envois, pour rester sous la limite de la messagerie.` : "") +
          (envoiDirect ? " Il part tout de suite." : " Le brouillon se relit dans Outlook."),
        confirmer: envoiDirect ? "Envoyer" : "Créer le brouillon",
        ...(controleCopro?.alerte || avertissementCollegue
          ? { avertissement: [controleCopro?.alerte, avertissementCollegue].filter(Boolean).join(" ") }
          : {}),
      });
      if (!ok) return;
      confirme = true;
    }
    if (avertissementCollegue && !confirme) {
      const ok = await confirmer({
        titre: "Écrire à l'adresse personnelle d'un collègue ?",
        message: "Un destinataire porte le nom d'un collègue, mais l'adresse choisie n'est pas son adresse REAL31.",
        avertissement: avertissementCollegue,
        confirmer: envoiDirect ? "Envoyer quand même" : brouillonPossible ? "Créer le brouillon quand même" : "Continuer",
        annuler: "Corriger",
      });
      if (!ok) return;
    }
    setEnvoiEnCours(true);
    demarrer(async () => {
      // Envoi en trois temps (27/10/2026, comme la réponse) : le brouillon d'abord, puis chaque
      // fichier déposé par tranches (la pastille se remplit), puis l'envoi ou le brouillon laissé.
      const prep = await preparerCompositionAction({
        objet: objet.trim().replace(/\s*-$/, ""),
        corps,
        ...(pilote && corpsHtml ? { corpsHtml } : {}),
        a: adresses(a),
        cc: adresses(cc),
        ...(cci.length ? { cci } : {}),
        ...(dossierId ? { dossierId } : {}),
        ...(envoisPrets ? { envois: envoisPrets } : {}),
        fichiers: fichiers.map(({ nom, taille }) => ({ nom, taille })),
      });
      if (!prep.ok) {
        setEnvoiEnCours(false);
        toast.err(prep.erreur);
        return;
      }
      const p = prep.donnees;
      if (!p || p.simulation || !p.jetons?.length) {
        setEnvoiEnCours(false);
        toast.ok("Aperçu vérifié : aucune boîte branchée ici, rien n'est parti.");
        return;
      }
      const jetons = p.jetons;
      // Toute la copropriété ou envoi séparé, en plusieurs mails : chaque brouillon reçoit les fichiers.
      for (const [lot, jeton] of jetons.entries()) {
        for (const [i, f] of fichiers.entries()) {
          const d = await deposerFichier(jeton, f.fichier, (x) => majProgres(i, (lot + x) / jetons.length));
          if (!d.ok) {
            void abandonnerCompositionAction({ jetons });
            majProgres(null, 0);
            setEnvoiEnCours(false);
            toast.err(`${d.erreur} Rien n'est parti, le mail est toujours là.`);
            return;
          }
        }
      }
      const r = await finaliserCompositionAction({ jetons });
      setEnvoiEnCours(false);
      majProgres(null, 0);
      if (!r.ok) {
        toast.err(r.erreur);
        return;
      }
      const res = { ...r.donnees, ...(p.webLink ? { webLink: p.webLink } : {}) };
      const plusieurs = (res.mails ?? 1) > 1 ? ` (${res.mails} mails)` : "";
      // À qui et depuis quelle boîte (REA-349, 16/10/2026) : la fenêtre se ferme aussitôt,
      // ce toast est la seule trace visible de l'envoi.
      const pour = a.length
        ? resumeDestinataires(a.map((p) => p.nom || p.emails[0] || "")) + (envoisPrets ? ", chacun séparément" : "")
        : `toute la copropriété (${cci.length} adresses)`;
      toast.ok(
        res.envoye
          ? `Mail envoyé à ${pour} depuis ${res.boite ?? "la boîte"}${plusieurs}.`
          : `Brouillon pour ${pour} créé dans ${res.boite ?? "la boîte"}${plusieurs}, à relire puis envoyer dans Outlook.`,
        !res.envoye && res.webLink ? { href: res.webLink, libelle: "Ouvrir le brouillon dans Outlook" } : undefined,
      );
      if (res.rattache === true) toast.ok("Le mail est inscrit au journal du dossier.");
      if (res.rattache === false) toast.warn(`${res.envoye ? "Mail envoyé" : "Brouillon créé"}, mais le rattachement au dossier a échoué.`);
      setParti(true);
      onTermine?.();
    });
  }

  return (
    <div
      {...depot.zone}
      className={"flex flex-col gap-4 rounded-lg transition-shadow " + (depot.survol ? "ring-2 ring-green-600 ring-offset-4" : "")}
    >
      {boite && brouillonPossible ? <LigneExpediteur boite={boite} /> : null}
      <ChampPersonnes
        champ="a"
        label="À"
        personnes={a}
        onChange={majA}
        onDeplacer={deplacer}
        onChoisie={personneChoisie}
        raccourcis={raccourcisPour}
        placeholder="Nom, adresse, ou code copro (S247) pour le conseil syndical…"
      />
      <ChampPersonnes champ="cc" label="Cc" personnes={cc} onChange={setCc} onDeplacer={deplacer} placeholder="Nom ou adresse…" />
      {phraseBinome ? <p className="-mt-2 text-meta text-ink-3">{phraseBinome}</p> : null}
      {cci.length > 0 && copro ? (
        <div className="flex items-center gap-2">
          <span className="w-6 shrink-0 text-body text-ink-3">Cci</span>
          <span className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-md bg-green-50 text-green-700 border border-green-500/30 text-body">
            Tous les copropriétaires de {copro.reference} ({cci.length} adresses, aucune visible des autres)
            <button type="button" onClick={() => setCciCopro(false)} aria-label="Retirer la copie cachée à toute la copropriété" className="hover:text-err-700">
              <X strokeWidth={1.5} className="w-3.5 h-3.5" />
            </button>
          </span>
        </div>
      ) : null}
      {separePossible ? (
        <div className="-mt-1 flex flex-col gap-1 pl-8">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Choix type="checkbox" checked={separe} onChange={(e) => setSepare(e.target.checked)} label="Envoyer séparément à chaque destinataire" />
            <span className="text-meta text-ink-3">
              {envoisPrets ? `${envoisPrets.length} ${brouillonPossible && !envoiDirect ? "brouillons" : "mails"}, chacun ne voit que lui` : "chacun ne verra que lui"}
            </span>
          </div>
          {decoupe && !decoupe.ok ? (
            <p className="text-meta text-err-700" role="status">
              {decoupe.motif}
            </p>
          ) : null}
        </div>
      ) : null}

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
            <Button type="button" size="sm" onClick={() => ajouterConseil()} disabled={!conseil?.membres.length} title={conseil ? TITRE_SOURCE_CONSEIL[conseil.source] : "Ajoute tous les membres du conseil syndical en « À »"}>
              <Users strokeWidth={1.5} />
              {conseil === null ? "Conseil syndical…" : `Conseil syndical (${conseil.membres.length})`}
            </Button>
            {conseil && <span className="text-meta text-ink-3">{LIBELLE_SOURCE_CONSEIL[conseil.source]}</span>}
            <Button
              type="button"
              size="sm"
              variant={cciCopro ? "doux" : "secondary"}
              aria-pressed={cciCopro}
              onClick={() => setCciCopro((v) => !v)}
              disabled={!touteCopro?.length}
              title={
                touteCopro && !touteCopro.length
                  ? "Aucune adresse de copropriétaire connue (copro ESTALE : passer par le mailing ESTALE)"
                  : "Tous les copropriétaires, en copie cachée"
              }
            >
              <Building2 strokeWidth={1.5} />
              {touteCopro === null ? "Toute la copropriété…" : `Toute la copropriété (${touteCopro.length})`}
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
          <Select id="comp-modele" value={modeleId} onChange={(e) => void appliquerModele(e.target.value)}>
            <option value="">Aucun</option>
            {modeles.map((m) => (
              <option key={m.id} value={m.id}>
                {m.titre}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Objet" htmlFor="comp-objet">
          <Input id="comp-objet" ref={champObjet} value={objet} onChange={(e) => setObjet(e.target.value)} placeholder="Objet du message" />
        </Field>
      </div>
      {pilote ? (
        <EditeurRiche
          html={corpsHtml}
          onChange={(h) => {
            setCorpsHtml(h);
            setCorps(htmlVersTexte(h));
          }}
          placeholder="Votre message…"
          label="Message"
          hauteur="min-h-56"
        />
      ) : (
        <Textarea value={corps} onChange={(e) => setCorps(e.target.value)} rows={10} placeholder="Votre message…" aria-label="Message" />
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <label className={classesBouton({ size: "sm" })}>
          <Paperclip strokeWidth={1.5} />
          Ajouter une pièce jointe
          <input
            type="file"
            multiple
            className="sr-only"
            onChange={(e) => {
              ajouterFichiers(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        {fichiers.length === 0 ? <span className="text-meta text-ink-3">ou glissez les fichiers ici</span> : null}
        {fichiers.map((f, i) => (
          <span key={`${f.nom}-${i}`} className="relative inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-full border border-line text-meta text-ink-2 overflow-hidden">
            {f.progres !== undefined ? (
              // Dépôt en cours sur le brouillon : la pastille se remplit, tranche par tranche.
              <span aria-hidden="true" className="absolute inset-y-0 left-0 bg-green-50 transition-[width]" style={{ width: `${Math.round(f.progres * 100)}%` }} />
            ) : null}
            <span className="relative truncate max-w-[200px]">{f.nom}</span>
            <span className="relative text-ink-3">{f.progres !== undefined ? `${Math.round(f.progres * 100)} %` : formatTaille(f.taille)}</span>
            <button
              type="button"
              onClick={() => setFichiers((l) => l.filter((_, k) => k !== i))}
              disabled={envoiEnCours}
              aria-label={`Retirer ${f.nom}`}
              className="relative text-ink-3 hover:text-err-700"
            >
              <X strokeWidth={1.5} className="w-3 h-3" />
            </button>
          </span>
        ))}
        {reformulation ? (
          <span className="ml-auto">
            <BoutonReformuler
              texte={corps}
              nature="nouveau"
              objet={objet}
              desactive={envoiEnCours}
              capturer={() => ({ corps, corpsHtml })}
              appliquer={majCorpsTexte}
              restaurer={(avant) => {
                setCorps(avant.corps);
                setCorpsHtml(avant.corpsHtml);
              }}
            />
          </span>
        ) : null}
      </div>

      {signatureHtml ? <SignatureRepliee html={signatureHtml} hauteur={170} libelle="Signature ajoutée au mail" /> : null}

      {!brouillonPossible && (
        <Callout ton="warn">Aperçu seulement : la boîte partagée n&apos;est pas branchée ici, rien ne partira.</Callout>
      )}
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-3">
        {objetReduitACopro ? (
          <span className="text-meta text-err-700 mr-auto" role="status">
            {MESSAGE_OBJET_REDUIT}
          </span>
        ) : (
          <span className="text-meta text-ink-3 mr-auto">
            {brouillonPossible && !envoiDirect ? `Brouillon dans ${boite} : à relire puis envoyer dans Outlook.` : null}
          </span>
        )}
        {onTermine ? (
          <Button type="button" variant="ghost" onClick={() => void annuler()} disabled={envoiEnCours}>
            Annuler
          </Button>
        ) : null}
        {/* type="button" : le compositeur a vécu dans le <form> « Actualiser » (27/10/2026) ; aucun de ses boutons ne soumet. */}
        <Button type="button" variant="primary" disabled={!pretAEnvoyer || envoiEnCours || chargement} loading={envoiEnCours} onClick={() => void creerBrouillon()}>
          {!brouillonPossible
            ? "Vérifier l'aperçu"
            : envoiDirect
              ? envoiEnCours
                ? "Envoi…"
                : envoisPrets
                  ? `Envoyer ${envoisPrets.length} mails`
                  : "Envoyer"
              : envoisPrets
                ? `Créer ${envoisPrets.length} brouillons`
                : "Créer le brouillon"}
        </Button>
      </div>
    </div>
  );
}

/** La boîte d'où part le mail, bien visible : une boîte partagée engage tout le cabinet. */
export function LigneExpediteur({ boite }: { boite: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-6 shrink-0 text-body text-ink-3">De</span>
      <span className="inline-flex items-center h-7 px-2.5 rounded-md bg-info-50 text-info-700 border border-info-500/30 text-body font-medium">
        {boite}
      </span>
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

/** Une proposition en tête de liste qui n'est pas une personne (« Conseil syndical · S247 … »). */
export type RaccourciChamp = { cle: string; libelle: string; detail?: string; icone: "conseil" | "copro"; onChoisir: () => void };

/** Un champ À ou Cc : on tape un nom, l'annuaire propose les personnes ; une adresse tapée passe aussi.
 *  Partagé avec le transfert d'un mail (REA-350) : même annuaire, même saisie. Les collègues
 *  arrivent en tête (badge « Collègue »), une fiche cliente à leur nom est marquée « Client ». */
export function ChampPersonnes({
  champ,
  label,
  personnes,
  onChange,
  onDeplacer,
  onChoisie,
  raccourcis,
  placeholder,
}: {
  champ: string;
  label: string;
  personnes: Personne[];
  onChange: (l: Personne[]) => void;
  onDeplacer: (depuis: string, cle: string) => void;
  onChoisie?: (d: DestinataireTrouve) => void;
  /** Propositions tirées de la saisie elle-même (code copro), affichées avant les personnes. */
  raccourcis?: (saisie: string) => RaccourciChamp[];
  placeholder: string;
}) {
  const [saisie, setSaisie] = useState("");
  const depot = useDepotDestinataire(champ, onDeplacer);
  // Résultats rangés par la saisie qui les a demandés : on n'affiche que ceux de la saisie en cours.
  const [trouves, setTrouves] = useState<{ q: string; liste: DestinataireTrouve[] } | null>(null);
  const q = saisie.trim();
  // Une saisie avec un @ est une ou des adresses tapées (ou rouvertes) : pas de recherche.
  const chercher = q.length >= 3 && !q.includes("@");
  const [refusee, setRefusee] = useState("");
  const resultats = chercher && trouves?.q === q ? trouves.liste : null;
  // Échap ferme aussi les raccourcis, pour CETTE saisie.
  const [masque, setMasque] = useState<string | null>(null);
  const propositions = q && masque !== q ? (raccourcis?.(q) ?? []) : [];
  const listeOuverte = Boolean(resultats || propositions.length);
  function choisirRaccourci(r: RaccourciChamp) {
    setSaisie("");
    setTrouves(null);
    r.onChoisir();
  }

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
    // Une ou plusieurs adresses (« a@x.fr ; b@y.fr », ou une pastille rouverte pour correction).
    const morceaux = saisie.split(/[\s,;]+/).filter(Boolean);
    const valides = morceaux.filter(adresseMailValide).map((e) => e.toLowerCase());
    const autres = morceaux.filter((e) => !adresseMailValide(e));
    const nouvelles = valides.filter((e) => !personnes.some((x) => x.cle === e));
    if (nouvelles.length) onChange([...personnes, ...nouvelles.map((e) => ({ cle: e, nom: "", emails: [e] }))]);
    // Une adresse fausse reste dans le champ, à corriger : l'envoi la refuserait.
    const fausse = autres.find((e) => e.includes("@"));
    setRefusee(fausse ?? "");
    if (valides.length || !autres.length) setSaisie(autres.join(" ; "));
  }

  // Clic sur une pastille : son adresse revient dans le champ pour être corrigée, sans
  // avoir à la retirer puis la retaper (le « bloc » d'Outlook, qu'on ne reprend pas).
  const champSaisie = useRef<HTMLInputElement>(null);
  function modifier(p: Personne) {
    onChange(personnes.filter((x) => x.cle !== p.cle));
    setSaisie((s) => [s.trim(), ...p.emails].filter(Boolean).join(" ; "));
    setRefusee("");
    champSaisie.current?.focus();
  }
  // Une adresse de l'annuaire peut aussi être fausse : elle est montrée en rouge.
  const invalide = (p: Personne) => p.emails.some((e) => !adresseMailValide(e));

  return (
    <div className="relative flex items-start gap-2">
      <span className="w-6 shrink-0 pt-1.5 text-body text-ink-3">{label}</span>
      <div
        {...depot.zone}
        className={"flex-1 flex flex-wrap items-center gap-1 min-h-8 rounded-md border px-1.5 py-1 " + (depot.survol ? "border-green-600 bg-green-50/40" : "border-line")}
      >
        {personnes.map((p) => (
          <span
            key={p.cle}
            {...pastilleGlissable(champ, p.cle)}
            title={invalide(p) ? "Adresse invalide : cliquer pour la corriger" : "Cliquer pour modifier, glisser vers un autre champ"}
            className={
              "inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-full text-meta max-w-full cursor-grab active:cursor-grabbing " +
              (invalide(p) ? "bg-err-50 text-err-700 ring-1 ring-err-700" : "bg-surface-3 text-ink-2")
            }
          >
            <button type="button" onClick={() => modifier(p)} aria-label={`Modifier ${p.emails.join(" ; ")}`} className="truncate text-left cursor-text">
              {p.nom ? <span className="text-ink">{p.nom} </span> : null}
              {p.emails.join(" ; ")}
            </button>
            <button type="button" onClick={() => onChange(personnes.filter((x) => x.cle !== p.cle))} aria-label={`Retirer ${p.nom || p.emails[0]}`} className="text-ink-3 hover:text-err-700">
              <X strokeWidth={2} className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          ref={champSaisie}
          value={saisie}
          onChange={(e) => {
            setSaisie(e.target.value);
            setMasque(null);
            setRefusee("");
          }}
          // Liste de suggestions ou message d'erreur ouvert : Échap le ferme, pas la fenêtre.
          data-echap-local={listeOuverte || refusee ? "" : undefined}
          onKeyDown={(e) => {
            if (e.key === "Escape" && (listeOuverte || refusee)) {
              e.preventDefault();
              e.stopPropagation();
              setTrouves(null);
              setMasque(q);
              setRefusee("");
              return;
            }
            if (e.key === "Enter" || e.key === "," || e.key === ";") {
              e.preventDefault();
              // Un code copro tapé puis Entrée : le premier raccourci (le conseil syndical).
              if (e.key === "Enter" && propositions[0]) choisirRaccourci(propositions[0]);
              else if (resultats?.length === 1) {
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
      {refusee && !listeOuverte && (
        <p role="alert" className="absolute left-8 top-full mt-1 z-20 rounded-md bg-err-50 px-2 py-1 text-meta text-err-700">
          « {refusee} » n&apos;est pas une adresse valide : ni accent ni espace dans une adresse.
        </p>
      )}
      {listeOuverte && (
        <ul className="absolute left-8 right-0 top-full mt-1 z-20 max-h-72 overflow-y-auto rounded-lg border border-line bg-surface shadow-2 py-1">
          {propositions.map((r) => (
            <li key={r.cle}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choisirRaccourci(r)}
                className="w-full text-left px-3 py-1.5 hover:bg-surface-2 flex items-start gap-2"
              >
                {r.icone === "conseil" ? (
                  <Users strokeWidth={1.5} className="w-4 h-4 mt-0.5 shrink-0 text-ink-3" />
                ) : (
                  <Building2 strokeWidth={1.5} className="w-4 h-4 mt-0.5 shrink-0 text-ink-3" />
                )}
                <span className="min-w-0">
                  <span className="block text-body text-ink font-medium">{r.libelle}</span>
                  {r.detail ? <span className="block text-meta text-ink-3">{r.detail}</span> : null}
                </span>
              </button>
            </li>
          ))}
          {resultats?.length === 0 && !propositions.length && <li className="px-3 py-2 text-meta text-ink-3">Personne de ce nom dans l&apos;annuaire Crypto.</li>}
          {(resultats ?? []).map((d) => (
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
                {d.genre ? (
                  <>
                    {" "}
                    <BadgeDestinataire genre={d.genre} />
                  </>
                ) : null}
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
