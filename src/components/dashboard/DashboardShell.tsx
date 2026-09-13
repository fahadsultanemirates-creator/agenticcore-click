import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

type Props = {
  crumb: string;
  title: string;
  children: ReactNode;
};

export function DashboardShell({ crumb, title, children }: Props) {
  return (
    <div className="flex h-screen overflow-hidden bg-void">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar crumb={crumb} title={title} />
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
