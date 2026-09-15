import type { ReactNode } from "react";
import { Route, Routes } from "react-router-dom";
import { RequireAuth } from "./components/auth/RequireAuth";
import { Admin } from "./pages/Admin";
import { Dashboard } from "./pages/Dashboard";
import { Forge } from "./pages/Forge";
import { Landing } from "./pages/Landing";
import { Login } from "./pages/Login";
import { BrandKitPage } from "./pages/services/BrandKitPage";
import { BusinessDocumentsPage } from "./pages/services/BusinessDocumentsPage";
import { ImagePage } from "./pages/services/ImagePage";
import { PdfDocumentsPage } from "./pages/services/PdfDocumentsPage";
import { SocialMediaPage } from "./pages/services/SocialMediaPage";
import { VideoPage } from "./pages/services/VideoPage";
import { Signup } from "./pages/Signup";
import { WebsiteIntake } from "./pages/WebsiteIntake";

function Protected({ children }: { children: ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
      <Route path="/dashboard/website" element={<Protected><WebsiteIntake /></Protected>} />
      <Route path="/dashboard/pdf" element={<Protected><PdfDocumentsPage /></Protected>} />
      <Route path="/dashboard/image" element={<Protected><ImagePage /></Protected>} />
      <Route path="/dashboard/video" element={<Protected><VideoPage /></Protected>} />
      <Route path="/dashboard/social" element={<Protected><SocialMediaPage /></Protected>} />
      <Route path="/dashboard/documents" element={<Protected><BusinessDocumentsPage /></Protected>} />
      <Route path="/dashboard/brand-kit" element={<Protected><BrandKitPage /></Protected>} />
      <Route path="/dashboard/forge" element={<Protected><Forge /></Protected>} />
      <Route path="/admin" element={<Protected><Admin /></Protected>} />
    </Routes>
  );
}
