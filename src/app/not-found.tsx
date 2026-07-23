import Link from "next/link";

// Page 404 personnalisee : l'app fait notFound() quand une copro est hors du
// portefeuille du gestionnaire -> message rassurant plutot que le 404 brut de Next.
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-surface-2">
      <div className="text-center max-w-md">
        <h1 className="text-[18px] font-medium text-ink">Page introuvable</h1>
        <p className="text-[13px] text-ink-3 mt-2">
          Cette page n&apos;existe pas ou n&apos;est pas dans ton portefeuille.
        </p>
        <Link
          href="/accueil"
          className="inline-block mt-4 h-9 px-4 leading-9 rounded-md bg-green-700 text-surface text-[13px] font-medium hover:bg-green-600"
        >
          Retour à l&apos;accueil
        </Link>
      </div>
    </div>
  );
}
