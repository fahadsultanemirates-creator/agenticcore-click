import { useEffect, useState } from "react";
import { BriefPanel } from "../components/dashboard/BriefPanel";
import { ResultPreview } from "../components/dashboard/ResultPreview";
import { Sidebar } from "../components/dashboard/Sidebar";
import { TopBar } from "../components/dashboard/TopBar";
import { services, type Service } from "../data/services";

type Status = "idle" | "generating" | "done";

const defaultService = services.find((s) => !s.comingSoon) ?? services[0];

export function Dashboard() {
  const [activeService, setActiveService] = useState<Service>(defaultService);
  const [brief, setBrief] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  useEffect(() => {
    if (status !== "generating") return;
    const timer = window.setTimeout(() => setStatus("done"), 1400);
    return () => window.clearTimeout(timer);
  }, [status]);

  const handleSelect = (service: Service) => {
    setActiveService(service);
    setBrief("");
    setStatus("idle");
  };

  const handleGenerate = () => {
    if (!brief.trim()) return;
    setStatus("generating");
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-cream">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar activeId={activeService.id} onSelect={handleSelect} />

        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar service={activeService} />

          <div className="grid flex-1 overflow-y-auto lg:grid-cols-2">
            <BriefPanel
              service={activeService}
              brief={brief}
              onBriefChange={setBrief}
              onGenerate={handleGenerate}
              status={status}
            />
            <ResultPreview service={activeService} status={status} />
          </div>
        </div>
      </div>
    </div>
  );
}
