import { Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Floating Forge button. On the public landing page a signed-out visitor
// would otherwise be bounced straight to /login by RequireAuth, so send them
// to sign-up instead — same button, honest destination.
export function ChatLauncher() {
  const { user } = useAuth();

  return (
    <Link
      to={user ? "/dashboard/forge" : "/signup"}
      aria-label="Chat with Forge"
      title="Chat with Forge"
      className="animate-pulse-ring fixed right-5 bottom-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-yellow-400 text-void shadow-glow-yellow transition-transform hover:-translate-y-0.5 sm:right-8 sm:bottom-8"
    >
      <Sparkles className="h-5 w-5" />
    </Link>
  );
}
