import { lazy, Suspense, type ReactNode } from "react";
import { Route, Routes } from "react-router-dom";
import { RequireAuth } from "./components/auth/RequireAuth";
import { Landing } from "./pages/Landing";
import { Login } from "./pages/Login";
import { Signup } from "./pages/Signup";

// Eager above, lazy below.
//
// Everything used to ship in one 597 kB chunk, so a first-time visitor
// downloaded the whole dashboard, every intake form and Forge before the
// landing page could paint -- none of which they can even reach until they
// have an account. The three routes a logged-out visitor actually touches
// stay eager; the rest arrive when they're needed.
const Dashboard = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const Forge = lazy(() => import("./pages/Forge").then((m) => ({ default: m.Forge })));
const WebsiteIntake = lazy(() => import("./pages/WebsiteIntake").then((m) => ({ default: m.WebsiteIntake })));
const BrandKitPage = lazy(() => import("./pages/services/BrandKitPage").then((m) => ({ default: m.BrandKitPage })));
const BusinessDocumentsPage = lazy(() =>
  import("./pages/services/BusinessDocumentsPage").then((m) => ({ default: m.BusinessDocumentsPage }))
);
const ImagePage = lazy(() => import("./pages/services/ImagePage").then((m) => ({ default: m.ImagePage })));
const PdfDocumentsPage = lazy(() =>
  import("./pages/services/PdfDocumentsPage").then((m) => ({ default: m.PdfDocumentsPage }))
);
const SocialMediaPage = lazy(() => import("./pages/services/SocialMediaPage").then((m) => ({ default: m.SocialMediaPage })));
const VideoPage = lazy(() => import("./pages/services/VideoPage").then((m) => ({ default: m.VideoPage })));
const ResetPassword = lazy(() => import("./pages/ResetPassword").then((m) => ({ default: m.ResetPassword })));
const ClaimAccount = lazy(() => import("./pages/ClaimAccount").then((m) => ({ default: m.ClaimAccount })));
const Terms = lazy(() => import("./pages/legal/Terms").then((m) => ({ default: m.Terms })));
const Privacy = lazy(() => import("./pages/legal/Privacy").then((m) => ({ default: m.Privacy })));
const Refunds = lazy(() => import("./pages/legal/Refunds").then((m) => ({ default: m.Refunds })));
const NotFound = lazy(() => import("./pages/NotFound").then((m) => ({ default: m.NotFound })));

// Deliberately blank rather than a spinner. These chunks load in a fraction
// of a second on any normal connection, and a spinner that flashes for 80ms
// reads as a glitch.
const LOADING = <div className="min-h-screen bg-void" />;

function Protected({ children }: { children: ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}

export default function App() {
  return (
    <Suspense fallback={LOADING}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/reset" element={<ResetPassword />} />
        {/* Where a Telegram-created account gets its password. Public by
            necessity: the whole point is that the client has no session. */}
        <Route path="/claim" element={<ClaimAccount />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/refunds" element={<Refunds />} />
        <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
        <Route path="/dashboard/website" element={<Protected><WebsiteIntake /></Protected>} />
        <Route path="/dashboard/pdf" element={<Protected><PdfDocumentsPage /></Protected>} />
        <Route path="/dashboard/image" element={<Protected><ImagePage /></Protected>} />
        <Route path="/dashboard/video" element={<Protected><VideoPage /></Protected>} />
        <Route path="/dashboard/social" element={<Protected><SocialMediaPage /></Protected>} />
        <Route path="/dashboard/documents" element={<Protected><BusinessDocumentsPage /></Protected>} />
        <Route path="/dashboard/brand-kit" element={<Protected><BrandKitPage /></Protected>} />
        <Route path="/dashboard/forge" element={<Protected><Forge /></Protected>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
