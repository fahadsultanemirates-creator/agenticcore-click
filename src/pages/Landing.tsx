import { ChatLauncher } from "../components/ChatLauncher";
import { CtaBanner } from "../components/landing/CtaBanner";
import { Footer } from "../components/landing/Footer";
import { Hero } from "../components/landing/Hero";
import { HowItWorks } from "../components/landing/HowItWorks";
import { Nav } from "../components/landing/Nav";
import { PackagesSection } from "../components/landing/PackagesSection";
import { ServicesGrid } from "../components/landing/ServicesGrid";
import { StatsBand } from "../components/landing/StatsBand";
import { TermsSummary } from "../components/landing/TermsSummary";

export function Landing() {
  return (
    <div>
      <Nav />
      <main>
        <Hero />
        <HowItWorks />
        <ServicesGrid />
        <PackagesSection />
        <StatsBand />
        <TermsSummary />
        <CtaBanner />
      </main>
      <Footer />
      <ChatLauncher />
    </div>
  );
}
