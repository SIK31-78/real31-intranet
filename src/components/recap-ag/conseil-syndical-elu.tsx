"use client";

// Bloc « Conseil syndical élu » du récap d'AG (Sekou, 20/10/2026). La liste du conseil ne se
// met plus à jour depuis Crypto (qui n'est plus tenu) : elle se corrige à la main, au moment
// où le CS est voté, c'est-à-dire ici.
//
// Bloc INDÉPENDANT du récap : sa propre lecture, son propre bouton (secondaire), aucun champ
// du récap n'en dépend. Deux cas, selon la source qui alimente réellement le mail au CS :
//  - ESTALE fournit les adresses : membres ESTALE en lecture, à corriger dans ESTALE. La liste
//    de diffusion n'est PAS proposée : la modifier ne changerait aucun mail, et la proposer
//    juste après l'élection ferait croire le contraire (elle reste éditable sur la fiche copro).
//  - Sinon : la liste de diffusion CS, éditable avec le composant de la fiche copro (même
//    action serveur, même cloisonnement). Les membres ESTALE sans adresse s'affichent au-dessus.

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { ListeDiffusionCS } from "@/components/fiche-copro/liste-diffusion-cs";
import { conseilSyndicalEluAction } from "@/app/recap-ag/actions";
import type { ConseilSyndicalElu as Etat, MembreCSEstale } from "@/lib/services/recap-ag/conseil-syndical-elu";

type Lecture = { coproCode: string; etat: Etat | null; erreur?: string };

export function ConseilSyndicalElu({ coproCode }: { coproCode: string }) {
  const [lecture, setLecture] = useState<Lecture | null>(null);

  useEffect(() => {
    if (!coproCode) return;
    let actif = true;
    conseilSyndicalEluAction(coproCode)
      .then((r) => {
        if (actif) setLecture(r.ok ? { coproCode, etat: r.donnees ?? null } : { coproCode, etat: null, erreur: r.erreur });
      })
      .catch(() => {
        if (actif) setLecture({ coproCode, etat: null, erreur: "Lecture du conseil syndical impossible." });
      });
    return () => {
      actif = false;
    };
  }, [coproCode]);

  if (!coproCode) return null;
  const courante = lecture?.coproCode === coproCode ? lecture : null;
  const etat = courante?.etat ?? null;

  // La liste enregistrée devient la source du mail (sauf si ESTALE fournit les adresses).
  function enregistre(emails: string[]) {
    setLecture((l) =>
      l?.etat
        ? {
            ...l,
            etat: {
              ...l.etat,
              emailsSecours: emails,
              ...(l.etat.estaleFournitEmails
                ? {}
                : {
                    sourceActive: emails.length ? "crypto" : "aucune",
                    emailsActifs: emails,
                    destinatairesActifs: emails.map((email) => ({ email })),
                  }),
            },
          }
        : l,
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Users strokeWidth={1.5} aria-hidden />
          Conseil syndical élu
        </CardTitle>
      </CardHeader>
      {!courante ? (
        <CardBody>
          <p className="text-body text-ink-2">Lecture du conseil syndical…</p>
        </CardBody>
      ) : !etat ? (
        <CardBody>
          <Callout ton="warn">{courante.erreur ?? "Lecture du conseil syndical impossible."}</Callout>
        </CardBody>
      ) : etat.estaleFournitEmails ? (
        <CardBody className="flex flex-col gap-3">
          <p className="text-body text-ink-2">
            Le conseil vient d&apos;être voté : vérifiez ses membres. Pour cette copropriété, ils sont tenus dans ESTALE
            et les mails au conseil partent vers leurs adresses ESTALE. Un membre entré, sorti ou une adresse à
            corriger se met à jour dans ESTALE.
          </p>
          <MembresEstale membres={etat.membresEstale} />
        </CardBody>
      ) : (
        <>
          <CardBody className="flex flex-col gap-3">
            <p className="text-body text-ink-2">
              Le conseil vient d&apos;être (ré)élu : vérifiez la liste de diffusion ci-dessous, c&apos;est elle qui
              reçoit les mails au conseil syndical. Ajoutez les nouveaux membres, retirez ceux qui ne siègent plus.
              Elle s&apos;enregistre à part, sans toucher au récap.
            </p>
            {etat.membresEstale.length > 0 && (
              <>
                <p className="text-meta text-ink-2">
                  Membres connus dans ESTALE, sans adresse exploitable : à compléter dans ESTALE.
                </p>
                <MembresEstale membres={etat.membresEstale} />
              </>
            )}
          </CardBody>
          <ListeDiffusionCS
            key={coproCode}
            coproCode={coproCode}
            sourceActive={etat.sourceActive}
            estaleFournitEmails={etat.estaleFournitEmails}
            destinatairesActifs={etat.destinatairesActifs}
            emailsSecours={etat.emailsSecours}
            ouvertParDefaut
            onEnregistre={enregistre}
          />
        </>
      )}
    </Card>
  );
}

function MembresEstale({ membres }: { membres: MembreCSEstale[] }) {
  if (membres.length === 0) {
    return <p className="text-body text-ink-2">Aucun membre du conseil dans ESTALE.</p>;
  }
  return (
    <ul className="flex flex-wrap items-center gap-1">
      {membres.map((m, i) => (
        <li
          key={`${m.nom}-${i}`}
          title={m.email}
          className="inline-flex items-center gap-1.5 h-6 px-2 rounded-sm bg-surface-2 border border-line text-meta"
        >
          <span className="font-medium text-ink">{m.nom}</span>
          {m.role === "president" && <span className="text-ink-2">président</span>}
          <span className="truncate max-w-60 text-ink-2">{m.email ?? "sans adresse"}</span>
        </li>
      ))}
    </ul>
  );
}
