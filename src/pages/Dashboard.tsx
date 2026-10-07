import { ChatLauncher } from "../components/ChatLauncher";
import { BillingSection } from "../components/dashboard/BillingSection";
import { DashboardShell } from "../components/dashboard/DashboardShell";
import { PortfolioSection } from "../components/dashboard/PortfolioSection";
import { ProjectsCallout } from "../components/dashboard/ProjectsCallout";
import { ServicesSection } from "../components/dashboard/ServicesSection";
import { WelcomeSection } from "../components/dashboard/WelcomeSection";
import { useOrders } from "../lib/useOrders";
import { useProjects } from "../lib/useProjects";

// Money and ordering. The finished work moved to /projects: this page was
// a wallet, a service grid, a package, a deliverables grid, a history
// table and a billing table stacked on one scroll, and the thing a client
// actually came back for -- their logo -- was four lines of text near the
// bottom of it.
export function Dashboard() {
  // Read once here and passed down, so the history table and the
  // deliverables count can never disagree about what the client has.
  const { orders, loading, failed, unseenCount } = useOrders();
  const { projects } = useProjects();

  return (
    <DashboardShell title="Dashboard">
      <WelcomeSection unseenCount={unseenCount} />
      <ServicesSection />
      <ProjectsCallout projectCount={projects.length} unseenCount={unseenCount} />
      <PortfolioSection orders={orders} loading={loading} failed={failed} />
      <div id="billing" className="scroll-mt-20">
        <BillingSection />
      </div>
      <ChatLauncher />
    </DashboardShell>
  );
}
