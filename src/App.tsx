import { Route, Routes } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { Landing } from "./pages/Landing";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/dashboard" element={<Dashboard />} />
    </Routes>
  );
}
