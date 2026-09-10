import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChatLauncher } from "../components/ChatLauncher";
import { BillingSection } from "../components/dashboard/BillingSection";
import { BriefPanel } from "../components/dashboard/BriefPanel";
import { DashboardShell } from "../components/dashboard/DashboardShell";
import { DeliverablesSection } from "../components/dashboard/DeliverablesSection";
import { PortfolioSection } from "../components/dashboard/PortfolioSection";
import { ResultPreview } from "../components/dashboard/ResultPreview";
import { services, type Service } from "../data/services";

type Status = "idle" | "generating" | "done";

// "website" has its own dedicated intake page, so it's never the inline default.
const defaultService =
  services.find((s) => !s.comingSoon && s.id !== "website") ?? services[0];

export function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const initialId = (location.state as { serviceId?: string } | null)?.serviceId;
  const initialService =
    services.find((s) => s.id === initialId && !s.comingSoon) ?? defaultService;

  const [activeService, setActiveService] = useState<Service>(initialService);
  const [brief, setBrief] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  useEffect(() => {
    if (status !== "generating") return;
    const timer = window.setTimeout(() => setStatus("done"), 1400);
    return () => window.clearTimeout(timer);
  }, [status]);

  const handleSelect = (service: Service) => {
    if (service.id === "website") {
      navigate("/dashboard/website");
      return;
    }
    setActiveService(service);
    setBrief("");
    setStatus("idle");
  };

  const handleGenerate = () => {
    if (!brief.trim()) return;
    setStatus("generating");
  };

  return (
    <DashboardShell activeId={activeService.id} onSelectService={handleSelect} topBarService={activeService}>
      <div className="grid min-h-[calc(100vh-73px)] lg:grid-cols-2">
        <BriefPanel
          key={activeService.id}
          service={activeService}
          brief={brief}
          onBriefChange={setBrief}
          onGenerate={handleGenerate}
          status={status}
        />
        <ResultPreview service={activeService} status={status} />
      </div>

      <DeliverablesSection />
      <BillingSection />
      <PortfolioSection />

      <ChatLauncher />
    </DashboardShell>
  );
}
