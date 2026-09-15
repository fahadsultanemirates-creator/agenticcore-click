import { ChatLauncher } from "../components/ChatLauncher";
import { BillingSection } from "../components/dashboard/BillingSection";
import { DashboardShell } from "../components/dashboard/DashboardShell";
import { DeliverablesSection } from "../components/dashboard/DeliverablesSection";
import { PortfolioSection } from "../components/dashboard/PortfolioSection";
import { ServicesSection } from "../components/dashboard/ServicesSection";
import { WelcomeSection } from "../components/dashboard/WelcomeSection";

export function Dashboard() {
  return (
    <DashboardShell title="Dashboard">
      <WelcomeSection />
      <ServicesSection />
      <DeliverablesSection />
      <PortfolioSection />
      <div id="billing" className="scroll-mt-20">
        <BillingSection />
      </div>
      <ChatLauncher />
    </DashboardShell>
  );
}
