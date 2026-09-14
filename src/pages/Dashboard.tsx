import { ChatLauncher } from "../components/ChatLauncher";
import { BillingSection } from "../components/dashboard/BillingSection";
import { DashboardShell } from "../components/dashboard/DashboardShell";
import { DeliverablesSection } from "../components/dashboard/DeliverablesSection";
import { NewRequestSection } from "../components/dashboard/NewRequestSection";
import { PortfolioSection } from "../components/dashboard/PortfolioSection";

export function Dashboard() {
  return (
    <DashboardShell crumb="Dashboard" title="Welcome back">
      <NewRequestSection />
      <DeliverablesSection />
      <div id="billing">
        <BillingSection />
      </div>
      <PortfolioSection />
      <ChatLauncher />
    </DashboardShell>
  );
}
