import type { ReactNode } from "react";
import type { Service } from "../../data/services";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

type Props = {
  activeId: string;
  onSelectService: (service: Service) => void;
  topBarService: Service;
  children: ReactNode;
};

export function DashboardShell({ activeId, onSelectService, topBarService, children }: Props) {
  return (
    <div className="flex h-screen overflow-hidden bg-void">
      <Sidebar activeId={activeId} onSelect={onSelectService} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar service={topBarService} />
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
