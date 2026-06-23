import type { ReactNode } from "react";
import { Sidebar, type NavKey } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { impersonationAutorisee } from "@/lib/auth/session";

type AppShellProps = {
  user: { initiales: string; nomComplet: string };
  active: NavKey;
  breadcrumb?: string;
  children: ReactNode;
};

export async function AppShell({ user, active, breadcrumb, children }: AppShellProps) {
  const peutImpersonner = await impersonationAutorisee();
  return (
    <div className="flex flex-col min-h-screen">
      <Topbar user={user} breadcrumb={breadcrumb} peutImpersonner={peutImpersonner} />
      <div className="flex flex-1 min-h-0">
        <Sidebar active={active} />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
