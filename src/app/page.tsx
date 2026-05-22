// Page d'accueil J1a — placeholder branché.
// L'écran réel (dashboard) arrive en Increment 5 + J2.
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 p-8 font-sans dark:bg-zinc-950">
      <div className="max-w-xl text-center">
        <p className="mb-3 text-xs uppercase tracking-widest text-zinc-500">
          MVP — Increment 1 (fondations)
        </p>
        <h1 className="mb-4 text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          REAL31 Intranet
        </h1>
        <p className="text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          Surcouche de coordination par-dessus eStale (et Crypto pendant la
          transition). Les écrans utilisateur sont en cours de construction —
          voir <code className="rounded bg-zinc-200 px-1 py-0.5 text-sm dark:bg-zinc-800">ROADMAP.md</code>.
        </p>
      </div>
    </main>
  );
}
