import { ChatLauncher } from "../components/ChatLauncher";
import { BillingSection } from "../components/dashboard/BillingSection";
import { DashboardShell } from "../components/dashboard/DashboardShell";
import { ServicesSection } from "../components/dashboard/ServicesSection";
import { WelcomeSection } from "../components/dashboard/WelcomeSection";
import { useOrders } from "../lib/useOrders";

// Start something, and pay for it. That is the whole job of this page now.
//
// Finished work and order history both moved to /projects, where they are
// kept with the project they belong to. What was left here was the same
// information three times over -- a wallet card above the billing
// section, a package tile above the package, a deliverables grid and a
// history table listing the same orders -- and the thing a client came
// back for was at the bottom of all of it.
export function Dashboard() {
  const { unseenCount } = useOrders();

  return (
    <DashboardShell title="Dashboard">
      <WelcomeSection unseenCount={unseenCount} />
      <ServicesSection />
      <div id="billing" className="scroll-mt-20">
        <BillingSection />
      </div>
      <ChatLauncher />
    </DashboardShell>
  );
}
