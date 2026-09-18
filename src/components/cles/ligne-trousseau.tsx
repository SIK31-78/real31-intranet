import { Row } from "@/components/ui/list-rows";
import { PastilleEtat } from "./pastille-etat";
import type { TrousseauResume } from "@/lib/services/cles/lecture";
import { formatDateLongue } from "@/lib/format-date";

// Une ligne de trousseau, la meme partout : numero · ce qu'il ouvre · ou il est · etat.
// La pastille reste courte (« En retard · 12 j ») ; qui l'a et depuis quand se lit dans le texte.
/** Ce qu'une ligne de trousseau dit, ou qu'elle s'affiche : principal, secondaire, detail de pastille. */
export function decrireTrousseau(resume: TrousseauResume, sansDetenteur = false): { principal: string; secondaire: React.ReactNode | undefined; detail: string | undefined } {
  const t = resume.trousseau;
  const pret = resume.pret;
  const biens = resume.biens.map((b) => `${b.coproCode ? `${b.coproCode} · ` : ""}${b.libelle}`).join(" · ");
  const prochaine = resume.reservations[0];
  const dehors = resume.etat === "sorti" || resume.etat === "en_retard";
  const qui = pret && sansDetenteur ? "sorti" : pret ? (pret.type === "interne" ? `en interne${pret.contact?.nom ? ` (${pret.contact.nom})` : ""}` : pret.type === "coproprietaire" ? `chez ${pret.contact?.nom ?? "un copropriétaire"} (copropriétaire)` : `chez ${pret.entrepriseNom ?? "une entreprise"}`) : null;
  const depuis = pret ? (resume.joursDehors <= 0 ? "depuis ce matin" : `depuis ${formatDateLongue(pret.sortiLeISO.slice(0, 10))}`) : null;
  const detail =
    resume.etat === "en_retard" ? `${resume.joursRetard} j` :
    resume.etat === "reserve" && prochaine ? formatDateLongue(prochaine.debutISO).replace(/ \d{4}$/, "") :
    undefined;
  const parts: React.ReactNode[] = [];
  if (t.libelle && biens) parts.push(biens);
  if (t.sensible) parts.unshift(<span key="sens" className="font-medium text-err-700">sensible</span>);
  if (dehors && qui) parts.push(<span key="qui" className="text-ink">{qui} {depuis}</span>);
  if (!dehors && t.emplacement) parts.push(<span key="empl" className="text-ink-3">{t.emplacement}</span>);
  if (!dehors && prochaine && resume.etat !== "reserve") parts.push(<span key="resa" className="text-ink-2">réservé le {formatDateLongue(prochaine.debutISO)}{prochaine.entrepriseNom ? ` par ${prochaine.entrepriseNom}` : ""}</span>);
  if (resume.etat === "reserve" && prochaine?.entrepriseNom) parts.push(<span key="par" className="text-ink-2">par {prochaine.entrepriseNom}</span>);
  return {
    principal: t.libelle || biens || "Sans accès renseigné",
    secondaire: parts.length > 0 ? parts.flatMap((x, i) => (i === 0 ? [x] : [" · ", x])) : undefined,
    detail,
  };
}

export function LigneTrousseau({ resume, secondaire, sansDetenteur = false }: { resume: TrousseauResume; secondaire?: React.ReactNode; /** Sur la fiche de l'entreprise qui le detient : inutile de le redire. */ sansDetenteur?: boolean }) {
  const d = decrireTrousseau(resume, sansDetenteur);
  return (
    <Row
      href={`/cles/trousseaux/${resume.trousseau.id}`}
      ton={resume.etat === "en_retard" ? "err" : undefined}
      avant={resume.trousseau.numero}
      principal={d.principal}
      secondaire={secondaire ?? d.secondaire}
      droite={<PastilleEtat etat={resume.etat} detail={d.detail} />}
    />
  );
}
