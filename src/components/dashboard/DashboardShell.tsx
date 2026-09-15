import { useEffect, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { DashboardHeader } from "./DashboardHeader";

type Props = {
  /** Page name — shown in the header crumb and used as the browser tab title. */
  title: string;
  children: ReactNode;
  /** Where the back button goes. Defaults to the dashboard (or home, on the dashboard itself). */
  backTo?: string;
  backLabel?: string;
};

// One shared frame for the dashboard and every service page. The old version
// pinned a 64–256px service rail down the left of every page, which ate most
// of a phone screen before any content was drawn; navigation now lives in the
// dashboard's own service grid, so the frame is just a slim sticky header and
// the page scrolls normally underneath it.
export function DashboardShell({ title, children, backTo, backLabel }: Props) {
  const { pathname } = useLocation();
  const isRoot = pathname === "/dashboard";

  // On the dashboard itself, "back" means out to the public site — there was
  // previously no way back to the landing page at all.
  const resolvedBackTo = backTo ?? (isRoot ? "/" : "/dashboard");
  const resolvedBackLabel = backLabel ?? (isRoot ? "Home" : "Dashboard");

  useEffect(() => {
    document.title = isRoot ? "Dashboard — agenticcore.click" : `${title} — agenticcore.click`;
  }, [title, isRoot]);

  return (
    <div className="min-h-screen bg-void">
      <DashboardHeader
        crumb={isRoot ? null : title}
        backTo={resolvedBackTo}
        backLabel={resolvedBackLabel}
      />
      <main className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">{children}</main>
    </div>
  );
}
