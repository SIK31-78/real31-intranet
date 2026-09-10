import { ButtonLink } from "@/components/ui/button";

// Page 404 personnalisee : l'app fait notFound() quand une copro est hors du
// portefeuille du gestionnaire -> message rassurant plutot que le 404 brut de Next.
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-surface-2">
      <div className="text-center max-w-md">
        <h1 className="text-title font-medium text-ink">Page introuvable</h1>
        <p className="text-body text-ink-3 mt-2">
          Cette page n&apos;existe pas ou n&apos;est pas dans ton portefeuille.
        </p>
        <ButtonLink href="/accueil" variant="primary" size="lg" className="mt-4">
          Retour à l&apos;accueil
        </ButtonLink>
      </div>
    </div>
  );
}
