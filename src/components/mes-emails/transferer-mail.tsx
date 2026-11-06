"use client";

// « Transférer » un mail de l'écran E-mails à un collègue ou à l'extérieur (REA-350,
// 16/10/2026, en pilote). Les destinataires se cherchent dans le même annuaire que
// « Envoyer un e-mail » ; les pièces jointes d'origine partent avec (createForward de
// Graph), depuis la boîte qui détient le mail. Les collègues passent en tête de la liste ;
// l'adresse personnelle d'un collègue se fait confirmer (décision 14, incident Elsa du 29/10/2026).
// Un mail ENVOYÉ se transfère aussi, depuis la vue « Envoyés » (02/11/2026, Océane) : même
// fenêtre, action dédiée (garde : l'envoyé doit être dans la liste que la personne voit).
// « + Conseil syndical » (02/11/2026, Océane) : les membres du CS de la copro du mail en « À »,
// l'autre membre du binôme en Cc (ADR-052), même source et mêmes règles que le compositeur ;
// la copie du binôme s'en va d'elle-même quand plus aucun membre du CS n'est en « À ».
// Variante du tri (`tri`, REA-500, 06/11/2026) : même fenêtre depuis la file de /tri-emails,
// pour un mail destiné à un collègue vente ou location. L'action serveur est injectée par
// l'écran du tri (qui range ensuite le mail), les destinataires sont limités aux collègues
// REAL31 (refusDestinatairesTri, contrôlé aussi côté serveur), ni « Conseil syndical » ni
// « Reformuler ». Sans `tri`, rien ne change pour l'écran E-mails.

import { useEffect, useRef, useState } from "react";
import { Forward, Paperclip, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { adresseMailValide, resumeDestinataires } from "@/lib/domain/mes-emails-composition";
import type { PieceJointeRef } from "@/lib/domain/mes-emails";
import { transfererEnvoyeAction, transfererMailAction } from "@/app/mes-emails/actions";
import { listerContactsCompositionAction } from "@/app/mes-emails/composer/actions";
import { ajoutConseilEtBinome, conseilEncoreDestinataire, phraseCopieBinome } from "@/lib/domain/copie-binome";
import { alertesAdressePersonnelle } from "@/lib/domain/destinataires-collegues";
import { adressesHorsReal31, refusDestinatairesTri } from "@/lib/domain/transfert-tri";
import { ChampPersonnes, LigneExpediteur, adresses, useCollegues, type Personne } from "./compositeur";
import { useAlerteSortie } from "./alerte-sortie";
import { BoutonReformuler } from "./bouton-reformuler";
import { LigneSousChamp } from "./editeur-riche";
import { LiensCopie, useLignesCopie } from "./lignes-copie";

/** Clé des personnes mises en Cc d'office avec le conseil syndical (binôme de la copro). */
const CLE_COPIE_BINOME = "binome:";
const estCopieBinome = (p: Personne) => p.cle.startsWith(CLE_COPIE_BINOME);

/** Variante du tri (REA-500) : ce que l'écran du tri donne à la fenêtre. */
export interface TransfertDepuisTri {
  /**
   * Le transfert, côté serveur (action du tri) : rend le message d'erreur à afficher (la
   * fenêtre reste ouverte, saisie gardée) ou null (c'est fait : l'écran du tri dit la suite).
   */
  transferer: (p: { a: string[]; cc: string[]; corps: string }) => Promise<string | null>;
  /** Le mail a des pièces jointes (elles partent d'office avec le transfert). */
  aPiecesJointes: boolean;
  /** Le transfert part tout de suite (MAIL_TRI_TRANSFERT, ou envoi ouvert) ; sinon brouillon Outlook. */
  direct: boolean;
  /** Bouton grisé (une action du tri est en cours). */
  desactive?: boolean;
}

export function TransfererMail({
  emailId,
  boite,
  boitePerso,
  objet,
  piecesJointes,
  onTransfere,
  reformulation = false,
  compact = false,
  envoye,
  coproCode,
  tri,
}: {
  /** Depuis la file du tri (REA-500) : action injectée, collègues REAL31 seulement. */
  tri?: TransfertDepuisTri;
  /** Copro du mail : « + Conseil syndical » proposé (vide ou absent : pas de bouton). */
  coproCode?: string;
  /**
   * Mail ENVOYÉ (vue « Envoyés ») : son id Graph dans la liste et s'il a des pièces jointes.
   * `emailId` est alors ignoré : le serveur relit l'internetMessageId dans la liste.
   */
  envoye?: { id: string; aPiecesJointes: boolean };
  /** Barre d'actions du volet : petit, en texte, sans icône (une seule ligne à 1280 px). */
  compact?: boolean;
  /** « Reformuler » proposé sur le mot du transfert (ADR-051). */
  reformulation?: boolean;
  emailId: string;
  /** Boîte qui détient le mail : c'est d'elle que part le transfert. */
  boite: string;
  boitePerso: boolean;
  objet: string;
  /** PJ réelles du mail (null = en cours de chargement). */
  piecesJointes: PieceJointeRef[] | null;
  /** Le transfert est PARTI (pas un brouillon) : l'écran affiche « Transféré » (REA-422). */
  onTransfere?: () => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <Button
        variant="doux"
        size={compact ? "sm" : "md"}
        onClick={() => setOuvert(true)}
        disabled={tri?.desactive ?? false}
        {...(tri ? { title: "Transférer ce mail à un collègue REAL31 (vente, location…) ; une fois parti, il est rangé dans « Transférés »." } : {})}
      >
        {compact ? null : <Forward strokeWidth={1.75} />}
        Transférer
      </Button>
      {ouvert ? (
        <FenetreTransfert
          emailId={emailId}
          boite={boite}
          boitePerso={boitePerso}
          objet={objet}
          piecesJointes={piecesJointes}
          {...(envoye ? { envoye } : {})}
          {...(coproCode && !tri ? { coproCode } : {})}
          {...(onTransfere ? { onTransfere } : {})}
          {...(tri ? { tri } : {})}
          reformulation={reformulation && !tri}
          onFermer={() => setOuvert(false)}
        />
      ) : null}
    </>
  );
}

function FenetreTransfert({
  emailId,
  boite,
  boitePerso,
  objet,
  piecesJointes,
  onTransfere,
  reformulation,
  onFermer,
  envoye,
  coproCode,
  tri,
}: {
  envoye?: { id: string; aPiecesJointes: boolean };
  coproCode?: string;
  tri?: TransfertDepuisTri;
  reformulation: boolean;
  emailId: string;
  boite: string;
  boitePerso: boolean;
  objet: string;
  piecesJointes: PieceJointeRef[] | null;
  onTransfere?: () => void;
  onFermer: () => void;
}) {
  const toast = useToast();
  const [a, setA] = useState<Personne[]>([]);
  const [cc, setCc] = useState<Personne[]>([]);
  const [corps, setCorps] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [csEnCours, setCsEnCours] = useState(false);
  // Les adresses du CS ajoutées d'un clic : tant que l'une est en « À », la copie du binôme tient.
  const conseilAjoute = useRef<string[]>([]);
  const confirmer = useConfirm();
  const collegues = useCollegues();
  // « Cc » replié tant qu'il est vide (29/10/2026) : un lien au bout de « À » l'ouvre.
  const lignesCopie = useLignesCopie({ cc: cc.length });
  // Un clic sur « Transférer » = on tape le destinataire (comme Outlook) : le curseur va
  // dans « À », pas sur la croix de la fenêtre. Cet effet passe après celui de la fenêtre
  // (enfant), qui pose le focus sur le premier élément focusable.
  const champA = useRef<HTMLDivElement>(null);
  useEffect(() => {
    champA.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, []);
  // Une saisie en cours ne se perd ni d'un clic à côté, ni d'Échap, ni en fermant l'onglet.
  const saisieEnCours = Boolean(a.length || cc.length || corps.trim());
  useAlerteSortie(saisieEnCours);
  async function fermerSiConfirme() {
    if (saisieEnCours) {
      const ok = await confirmer({
        titre: "Abandonner le transfert ?",
        message: "Les destinataires et le message saisis seront perdus.",
        confirmer: "Abandonner",
        annuler: "Continuer l'écriture",
        danger: true,
      });
      if (!ok) return;
    }
    onFermer();
  }

  // Le « À » change : plus aucun membre du CS ajouté d'un clic -> la copie du binôme s'en va.
  function majA(l: Personne[]) {
    setA(l);
    if (conseilAjoute.current.length && !conseilEncoreDestinataire(adresses(l), conseilAjoute.current)) {
      conseilAjoute.current = [];
      setCc((c) => (c.some(estCopieBinome) ? c.filter((p) => !estCopieBinome(p)) : c));
    }
  }

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

  // « + Conseil syndical » : la même lecture que le compositeur (CS d'ESTALE, sinon liste de
  // diffusion ; binôme calculé côté serveur d'après la session).
  async function ajouterConseil() {
    if (!coproCode || csEnCours) return;
    setCsEnCours(true);
    try {
      const r = await listerContactsCompositionAction({ reference: coproCode });
      if (!r.ok) {
        toast.err(r.erreur);
        return;
      }
      const membres = r.donnees?.conseil.membres ?? [];
      if (!membres.length) {
        toast.warn(`Aucune liste de conseil syndical pour ${coproCode} : tapez les noms dans « À ».`);
        return;
      }
      const { versA, versCc } = ajoutConseilEtBinome({ a: adresses(a), cc: adresses(cc), membres, binome: r.donnees?.copieBinome ?? [] });
      setA((l) => [...l, ...versA.map((m) => ({ cle: m.email, nom: m.nom, emails: [m.email] })).filter((p) => !l.some((x) => x.cle === p.cle))]);
      if (versCc.length) {
        setCc((l) => [...l, ...versCc.map((m) => ({ cle: `${CLE_COPIE_BINOME}${m.email}`, nom: m.nomComplet, emails: [m.email] })).filter((p) => !l.some((x) => x.cle === p.cle))]);
      }
      conseilAjoute.current = membres.map((m) => m.email);
    } finally {
      setCsEnCours(false);
    }
  }
  const phraseBinome = phraseCopieBinome(cc.filter(estCopieBinome).map((p) => p.nom));

  const invalides = [...adresses(a), ...adresses(cc)].filter((e) => !adresseMailValide(e));
  // Depuis le tri : les adresses hors REAL31 se voient avant le clic (pastilles en rouge, phrase).
  const horsReal31 = tri ? adressesHorsReal31(adresses(a), adresses(cc)) : [];

  async function transferer() {
    if (enCours) return;
    if (invalides.length) {
      toast.err(`Adresse invalide : ${invalides.map((e) => `« ${e} »`).join(", ")}. À retirer ou corriger.`);
      return;
    }
    if (adresses(a).length === 0) {
      toast.err("Ajoute au moins un destinataire en « À ».");
      return;
    }
    // Depuis le tri : collègues REAL31 seulement, la même règle que le serveur. Le reste
    // (avertissement Elsa, action d'E-mails, messages de retour) ne concerne pas le tri.
    if (tri) {
      const refus = refusDestinatairesTri(adresses(a), adresses(cc));
      if (refus) {
        toast.err(refus);
        return;
      }
      setEnCours(true);
      try {
        const erreur = await tri.transferer({ a: adresses(a), cc: adresses(cc), corps });
        if (erreur) {
          toast.err(erreur);
          return;
        }
        onFermer();
      } finally {
        setEnCours(false);
      }
      return;
    }
    // Elsa transférée à sa fiche de copropriétaire au lieu de sa fiche salariée : on le dit.
    const avertissement = alertesAdressePersonnelle([...a, ...cc], collegues).join(" ");
    if (avertissement) {
      const ok = await confirmer({
        titre: "Transférer à l'adresse personnelle d'un collègue ?",
        message: "Un destinataire porte le nom d'un collègue, mais l'adresse choisie n'est pas son adresse REAL31.",
        avertissement,
        confirmer: "Transférer quand même",
        annuler: "Corriger",
      });
      if (!ok) return;
    }
    setEnCours(true);
    try {
      const commun = { boite, a: adresses(a), cc: adresses(cc), corps };
      const r = envoye ? await transfererEnvoyeAction({ ...commun, id: envoye.id }) : await transfererMailAction({ ...commun, emailId });
      if (!r.ok) {
        toast.err(r.erreur);
        return;
      }
      if (r.donnees?.envoye) onTransfere?.();
      const pour = resumeDestinataires(a.map((p) => p.nom || p.emails[0] || ""));
      toast.ok(
        r.donnees?.envoye
          ? `Mail transféré à ${pour} depuis ${r.donnees.boite}.`
          : `Transfert pour ${pour} créé en brouillon dans ${r.donnees?.boite ?? boite} : à relire puis envoyer dans Outlook.`,
      );
      onFermer();
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Modal titre={tri ? "Transférer à un collègue" : "Transférer le mail"} size="lg" onFermer={() => void fermerSiConfirme()} saisieEnCours={saisieEnCours}>
      <ModalBody>
        <div className="flex flex-col gap-3">
          <LigneExpediteur boite={boite} />
          {tri ? (
            <p className="text-meta text-ink-3">
              Collègues REAL31 seulement (adresses @real31.fr). En tête du mail, une mention dit qu&apos;il vient de {boite} et qui le transfère.{" "}
              {tri.direct
                ? "Le transfert part tout de suite, puis le mail est rangé dans « Transférés »."
                : "Le transfert sera créé en brouillon dans Outlook, à relire puis envoyer : le mail reste dans la file."}
            </p>
          ) : !boitePerso ? (
            <p className="text-meta text-ink-3">
              Boîte partagée : tant que l&apos;envoi n&apos;y est pas ouvert, le transfert reste en brouillon dans Outlook, à relire puis envoyer.
            </p>
          ) : null}
          <div ref={champA}>
            <ChampPersonnes
              champ="a"
              label="À"
              personnes={a}
              onChange={majA}
              onDeplacer={deplacer}
              placeholder={tri ? "Nom du collègue (ou son adresse @real31.fr)…" : "Nom du collègue ou de la personne (ou une adresse)…"}
              {...(tri ? { seulementReal31: true } : {})}
              suffixe={lignesCopie.visible("cc") ? null : <LiensCopie lignes={["cc"]} onOuvrir={lignesCopie.ouvrir} />}
            />
          </div>
          {lignesCopie.visible("cc") ? (
            <ChampPersonnes
              champ="cc"
              label="Cc"
              personnes={cc}
              onChange={setCc}
              onDeplacer={deplacer}
              placeholder={tri ? "Nom du collègue…" : "Nom ou adresse…"}
              {...(tri ? { seulementReal31: true } : {})}
              autoFocus={lignesCopie.focus === "cc"}
            />
          ) : null}
          {phraseBinome ? <p className="-mt-2 text-meta text-ink-3">{phraseBinome}</p> : null}
          {horsReal31.length ? (
            <p role="alert" className="-mt-1 text-meta text-err-700">
              Hors REAL31, à retirer : {horsReal31.join(", ")}. Depuis le tri, on ne transfère qu&apos;aux collègues.
            </p>
          ) : null}
          {coproCode ? (
            <div>
              <Button size="sm" onClick={() => void ajouterConseil()} loading={csEnCours} disabled={enCours} title={`Ajoute en « À » les membres du conseil syndical de ${coproCode}, le binôme en copie`}>
                <Users strokeWidth={1.5} />
                Conseil syndical
              </Button>
            </div>
          ) : null}
          <p className="text-body text-ink-2">
            <span className="text-ink-3">Objet : </span>TR: {objet}
          </p>
          {/* Pas de trombone : le transfert part avec les pièces d'origine (createForward), sans ajout. */}
          <div>
            <Textarea value={corps} onChange={(e) => setCorps(e.target.value)} rows={6} placeholder="Un mot pour accompagner le transfert (facultatif)…" aria-label="Message du transfert" />
            <LigneSousChamp
              aDroite={
                reformulation ? (
                  <BoutonReformuler
                    texte={corps}
                    nature="transfert"
                    objet={`TR: ${objet}`}
                    desactive={enCours}
                    capturer={() => corps}
                    appliquer={setCorps}
                    restaurer={setCorps}
                  />
                ) : null
              }
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-meta text-ink-3">
            <Paperclip strokeWidth={1.5} className="w-3.5 h-3.5" />
            {envoye || tri
              ? (envoye ?? tri)?.aPiecesJointes
                ? "Pièces jointes d'origine jointes d'office."
                : "Aucune pièce jointe."
              : piecesJointes === null
                ? "Pièces jointes en cours de chargement…"
                : piecesJointes.length === 0
                  ? "Aucune pièce jointe."
                  : `Jointes d'office : ${piecesJointes.map((pj) => pj.nom).join(", ")}`}
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={() => void fermerSiConfirme()} disabled={enCours}>
          Annuler
        </Button>
        <Button variant="primary" onClick={() => void transferer()} loading={enCours} disabled={adresses(a).length === 0 || horsReal31.length > 0}>
          <Forward strokeWidth={1.75} />
          {enCours ? "Transfert…" : "Transférer"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
