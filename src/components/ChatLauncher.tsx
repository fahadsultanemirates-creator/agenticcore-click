import { Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function ChatLauncher() {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate("/dashboard/forge")}
      aria-label="Chat with Forge"
      title="Chat with Forge"
      className="animate-pulse-ring fixed right-5 bottom-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-yellow-400 text-void shadow-glow-yellow transition-transform hover:-translate-y-0.5 sm:right-8 sm:bottom-8"
    >
      <Sparkles className="h-5 w-5" />
    </button>
  );
}
