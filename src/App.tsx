import { Route, Routes } from "react-router-dom";
import { RequireAuth } from "./components/auth/RequireAuth";
import { Dashboard } from "./pages/Dashboard";
import { Forge } from "./pages/Forge";
import { Landing } from "./pages/Landing";
import { Login } from "./pages/Login";
import { Signup } from "./pages/Signup";
import { WebsiteIntake } from "./pages/WebsiteIntake";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        }
      />
      <Route
        path="/dashboard/website"
        element={
          <RequireAuth>
            <WebsiteIntake />
          </RequireAuth>
        }
      />
      <Route
        path="/dashboard/forge"
        element={
          <RequireAuth>
            <Forge />
          </RequireAuth>
        }
      />
    </Routes>
  );
}
