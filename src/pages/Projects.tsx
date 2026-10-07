import { FolderPlus, Layers } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChatLauncher } from "../components/ChatLauncher";
import { DashboardShell } from "../components/dashboard/DashboardShell";
import { createProject, useProjects, type Project } from "../lib/useProjects";

// Everything a client has had made, grouped as the work it belongs to.
//
// This used to be two sections at the bottom of the dashboard, under the
// wallet, the service grid, the $20 package and the billing table. A logo
// delivered in five options was four lines of text down there. Work people
// paid for deserves its own room.
export function Projects() {
  const { projects, loading, failed, reload } = useProjects();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Give the project a name — your business, or what it is for.");
      return;
    }
    setBusy(true);
    const result = await createProject(name);
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    navigate(`/projects/${result.id}`);
  };

  return (
    <DashboardShell title="Projects" backTo="/dashboard" backLabel="Dashboard">
      <section className="py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold text-fg sm:text-3xl">Your projects</h1>
            <p className="mt-1.5 text-sm text-fg-muted">
              Every order you have placed, kept with the work it belongs to.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setCreating(!creating);
              setError("");
            }}
            className="inline-flex items-center gap-2 rounded-full border-2 border-border px-4 py-2.5 text-sm font-semibold text-fg transition-colors hover:border-yellow-400/60"
          >
            <FolderPlus className="h-4 w-4" /> New project
          </button>
        </div>

        {creating ? (
          <form onSubmit={handleCreate} className="mt-5 rounded-2xl border border-border bg-surface p-4 sm:p-5">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold tracking-wide text-fg-muted uppercase">Project name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Noor Bakery"
                autoFocus
                className="rounded-xl border-2 border-border bg-void px-3.5 py-2.5 text-fg placeholder:text-fg-faint focus:border-yellow-400 focus:outline-none"
              />
            </label>
            {error ? <p className="mt-2 text-sm text-yellow-400">{error}</p> : null}
            <button
              type="submit"
              disabled={busy}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-yellow-400 px-5 py-2.5 text-sm font-semibold text-void transition-transform hover:-translate-y-0.5 disabled:opacity-60"
            >
              {busy ? "Creating…" : "Create project"}
            </button>
          </form>
        ) : null}

        {loading ? (
          <p className="mt-6 rounded-2xl border border-dashed border-border bg-surface p-6 text-sm text-fg-faint">
            Loading…
          </p>
        ) : failed ? (
          <div className="mt-6 rounded-2xl border border-dashed border-border bg-surface p-6">
            <p className="text-sm text-fg-muted">Could not load your projects.</p>
            <button
              type="button"
              onClick={() => void reload()}
              className="mt-3 text-sm font-semibold text-yellow-400 hover:underline"
            >
              Try again
            </button>
          </div>
        ) : projects.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-border bg-surface p-8 text-center">
            <Layers className="mx-auto h-8 w-8 text-fg-faint" />
            <p className="mt-3 text-sm text-fg-muted">
              Nothing here yet. Order a service and it will open its own project automatically.
            </p>
            <Link
              to="/dashboard"
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-yellow-400 px-5 py-2.5 text-sm font-semibold text-void transition-transform hover:-translate-y-0.5"
            >
              Pick a service
            </Link>
          </div>
        ) : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </section>
      <ChatLauncher />
    </DashboardShell>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const images = project.files.filter((file) => file.fileType?.startsWith("image/")).slice(0, 4);
  const inFlight = project.orders.filter((order) => order.status !== "delivered").length;

  return (
    <Link
      to={`/projects/${project.id}`}
      className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-yellow-400/50 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 font-display text-base font-semibold text-fg">{project.name}</p>
        {inFlight > 0 ? (
          <span className="shrink-0 rounded-full bg-yellow-400/15 px-2 py-0.5 text-[10px] font-bold text-yellow-400">
            {inFlight} IN PROGRESS
          </span>
        ) : null}
      </div>

      {images.length > 0 ? (
        <div className="flex gap-2">
          {images.map((file) => (
            <span key={file.url} className="h-14 w-14 overflow-hidden rounded-lg border border-border">
              <img src={file.url} alt="" loading="lazy" className="h-full w-full object-cover" />
            </span>
          ))}
        </div>
      ) : null}

      <p className="mt-auto text-xs text-fg-faint">
        {project.orders.length} {project.orders.length === 1 ? "order" : "orders"}
        {project.files.length > 0 ? ` · ${project.files.length} files` : ""}
      </p>
    </Link>
  );
}
