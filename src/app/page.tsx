// Page d'accueil placeholder.
// L'écran réel (dashboard) arrivera quand les modules métier seront branchés.
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 p-8 font-sans dark:bg-zinc-950">
      <div className="max-w-xl text-center">
        <h1 className="mb-4 text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          REAL31 Intranet
        </h1>
        <p className="text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          Surcouche de coordination par-dessus eStale (et Crypto pendant la
          transition). Les écrans sont en cours de construction.
        </p>
      </div>
    </main>
  );
}
