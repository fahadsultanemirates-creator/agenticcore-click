import { FolderOpen } from "lucide-react";
import { Link } from "react-router-dom";

// Says which project this order will land in, before it is placed rather
// than after. Without it the only sign that "?project=" did anything is
// finding the order in the right folder afterwards.
export function ProjectBanner({ projectId, name }: { projectId: string | null; name: string | null }) {
  if (!projectId || !name) return null;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 rounded-2xl border border-yellow-400/30 bg-yellow-400/5 px-4 py-3 text-sm">
      <FolderOpen className="h-4 w-4 shrink-0 text-yellow-400" />
      <span className="text-fg-muted">
        Adding to <span className="font-semibold text-fg">{name}</span>
      </span>
      <Link to={`/projects/${projectId}`} className="ml-auto font-semibold text-yellow-400 hover:underline">
        Open project
      </Link>
    </div>
  );
}
