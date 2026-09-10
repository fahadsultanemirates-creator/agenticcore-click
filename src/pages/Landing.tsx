import { ChatLauncher } from "../components/ChatLauncher";
import { CtaBanner } from "../components/landing/CtaBanner";
import { Faq } from "../components/landing/Faq";
import { Footer } from "../components/landing/Footer";
import { Hero } from "../components/landing/Hero";
import { HowItWorks } from "../components/landing/HowItWorks";
import { Nav } from "../components/landing/Nav";
import { ServicesGrid } from "../components/landing/ServicesGrid";
import { StatsBand } from "../components/landing/StatsBand";

export function Landing() {
  return (
    <div>
      <Nav />
      <main>
        <Hero />
        <HowItWorks />
        <ServicesGrid />
        <StatsBand />
        <Faq />
        <CtaBanner />
      </main>
      <Footer />
      <ChatLauncher />
    </div>
  );
}
