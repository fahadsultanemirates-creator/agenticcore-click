import { ChatLauncher } from "../components/ChatLauncher";
import { BillingSection } from "../components/dashboard/BillingSection";
import { DashboardShell } from "../components/dashboard/DashboardShell";
import { DeliverablesSection } from "../components/dashboard/DeliverablesSection";
import { PortfolioSection } from "../components/dashboard/PortfolioSection";
import { ServicesSection } from "../components/dashboard/ServicesSection";
import { WelcomeSection } from "../components/dashboard/WelcomeSection";
import { useOrders } from "../lib/useOrders";

export function Dashboard() {
  // Read once here and passed down, so the history table and the deliverables
  // grid can never disagree about what the client has.
  const { orders, loading, failed, unseenCount, markSeen } = useOrders();

  return (
    <DashboardShell title="Dashboard">
      <WelcomeSection unseenCount={unseenCount} />
      <ServicesSection />
      <DeliverablesSection orders={orders} loading={loading} onOpen={markSeen} />
      <PortfolioSection orders={orders} loading={loading} failed={failed} />
      <div id="billing" className="scroll-mt-20">
        <BillingSection />
      </div>
      <ChatLauncher />
    </DashboardShell>
  );
}
