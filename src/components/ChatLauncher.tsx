import { Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Floating Forge button. On the public landing page a signed-out visitor
// would otherwise be bounced straight to /login by RequireAuth, so send them
// to sign-up instead — same button, honest destination.
//
// It says "Forge". It used to be a bare sparkle icon with the name only in
// the tooltip and the aria-label, which meant the name existed for screen
// readers and for nobody else: a yellow circle in the corner reads as a
// generic chat bubble, and a product you have to hover to identify may as
// well not be named at all.
export function ChatLauncher() {
  const { user } = useAuth();

  return (
    <Link
      to={user ? "/dashboard/forge" : "/signup"}
      aria-label="Chat with Forge"
      title="Chat with Forge"
      className="animate-pulse-ring fixed right-5 bottom-5 z-50 flex h-14 items-center gap-2 rounded-full bg-yellow-400 px-5 font-semibold text-void shadow-glow-yellow transition-transform hover:-translate-y-0.5 active:translate-y-0 active:scale-95 sm:right-8 sm:bottom-8"
    >
      <Sparkles className="h-5 w-5 shrink-0" />
      Forge
    </Link>
  );
}
