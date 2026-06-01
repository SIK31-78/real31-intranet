import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDbHealth } from "@/lib/services/db/get-db-health";

export const metadata: Metadata = { title: "DB health — REAL31 Intranet" };

// Force le rendu dynamique : on lit la BDD a chaque requete, jamais de cache statique.
export const dynamic = "force-dynamic";

export default async function DbHealthPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const result = await getDbHealth();

  return (
    <div className="min-h-screen bg-canvas p-8">
      <div className="mx-auto max-w-[720px] bg-surface border border-line rounded-md p-6">
        <h1 className="text-[18px] font-medium text-ink mb-1">DB health check</h1>
        <p className="text-[12px] text-ink-3 mb-4">
          Lecture de{" "}
          <code className="font-mono bg-surface-2 px-1 py-0.5 rounded-sm">
            real31_intranet.cabinet_settings
          </code>{" "}
          via service_role.
        </p>

        {result.ok ? (
          <>
            <div className="inline-flex items-center gap-2 px-2.5 h-6 rounded-sm bg-ok-50 text-ok-700 text-[12px] font-medium border border-ok-500/30 mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-ok-500" />
              OK · {result.rows.length} ligne{result.rows.length > 1 ? "s" : ""}
            </div>
            <div className="border border-line rounded-sm overflow-hidden">
              <table className="w-full text-[13px]">
                <thead className="bg-surface-2/40">
                  <tr className="text-left text-ink-3">
                    <th className="px-3 py-2 font-medium text-[11px] uppercase tracking-[0.08em]">
                      Key
                    </th>
                    <th className="px-3 py-2 font-medium text-[11px] uppercase tracking-[0.08em]">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row) => (
                    <tr
                      key={row.key}
                      className="border-t border-line"
                    >
                      <td className="px-3 py-2 font-mono text-[12px] text-ink-2">
                        {row.key}
                      </td>
                      <td className="px-3 py-2 text-ink-2">{row.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="bg-err-50 border border-err-500/30 rounded-sm p-3">
            <div className="text-[12px] font-medium text-err-700 mb-1">Erreur</div>
            <div className="font-mono text-[12px] text-err-700 whitespace-pre-wrap break-all">
              {result.error}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
