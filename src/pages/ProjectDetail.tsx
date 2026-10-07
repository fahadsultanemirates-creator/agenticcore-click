import { Check, Download, ExternalLink, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChatLauncher } from "../components/ChatLauncher";
import { DashboardShell } from "../components/dashboard/DashboardShell";
import { services } from "../data/services";
import { deliverableFilename, forcedDownloadUrl } from "../lib/downloadUrl";
import { renameProject, useProjects, type ProjectFile, type ProjectOrder } from "../lib/useProjects";

// One project: what has been made, and the way to ask for the next thing
// without starting from nothing.
export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { projects, loading, reload } = useProjects();
  const navigate = useNavigate();
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState("");

  const project = projects.find((p) => p.id === id) ?? null;

  if (loading) {
    return (
      <DashboardShell title="Project" backTo="/projects" backLabel="Projects">
        <p className="mt-8 rounded-2xl border border-dashed border-border bg-surface p-6 text-sm text-fg-faint">
          Loading…
        </p>
      </DashboardShell>
    );
  }

  if (!project) {
    return (
      <DashboardShell title="Project" backTo="/projects" backLabel="Projects">
        <div className="mt-8 rounded-2xl border border-dashed border-border bg-surface p-8 text-center">
          <p className="text-sm text-fg-muted">That project does not exist, or is not yours.</p>
          <Link to="/projects" className="mt-4 inline-block text-sm font-semibold text-yellow-400 hover:underline">
            Back to your projects
          </Link>
        </div>
      </DashboardShell>
    );
  }

  const saveName = async () => {
    if (draftName.trim() && draftName.trim() !== project.name) {
      await renameProject(project.id, draftName);
      await reload();
    }
    setRenaming(false);
  };

  return (
    <DashboardShell title={project.name} backTo="/projects" backLabel="Projects">
      <section className="py-8">
        {renaming ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              autoFocus
              className="min-w-0 flex-1 rounded-xl border-2 border-border bg-void px-3.5 py-2 font-display text-xl font-semibold text-fg focus:border-yellow-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void saveName()}
              aria-label="Save project name"
              className="rounded-full bg-yellow-400 p-2.5 text-void"
            >
              <Check className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-start gap-2">
            <h1 className="font-display text-2xl font-semibold text-fg sm:text-3xl">{project.name}</h1>
            <button
              type="button"
              onClick={() => {
                setDraftName(project.name);
                setRenaming(true);
              }}
              aria-label="Rename project"
              className="mt-1 rounded-full p-2 text-fg-muted transition-colors hover:text-fg"
            >
              <Pencil className="h-4 w-4" />
            </button>
          </div>
        )}

        <p className="mt-1.5 text-sm text-fg-muted">
          {project.orders.length} {project.orders.length === 1 ? "order" : "orders"} in this project.
        </p>

        {/* The whole point of a project: the next thing starts from this one,
            with what has already been made attached rather than re-uploaded. */}
        <div className="mt-6 rounded-2xl border border-yellow-400/30 bg-yellow-400/5 p-4 sm:p-5">
          <p className="font-display text-base font-semibold text-fg">Add to this project</p>
          <p className="mt-1 text-sm text-fg-muted">
            Pick a service and it opens with this project's finished files already attached — "a flyer using
            this logo" needs no re-uploading.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {services.map((service) => (
              <button
                key={service.id}
                type="button"
                onClick={() => navigate(`${service.route}?project=${project.id}`)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-void px-3 py-2 text-xs font-semibold text-fg-muted transition-colors hover:border-yellow-400/50 hover:text-fg"
              >
                <Plus className="h-3 w-3" />
                {service.label}
              </button>
            ))}
          </div>
        </div>

        <h2 className="mt-10 font-display text-xl font-semibold text-fg">Orders</h2>
        <div className="mt-4 flex flex-col gap-3">
          {project.orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      </section>
      <ChatLauncher />
    </DashboardShell>
  );
}

function OrderCard({ order }: { order: ProjectOrder }) {
  const service = services.find((s) => s.id === order.serviceId);
  const images = order.files.filter((file) => file.fileType?.startsWith("image/"));

  const save = (file: ProjectFile) =>
    forcedDownloadUrl(file.url, deliverableFilename(order.publicId, file.optionIndex, file.url, order.files.length));

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-yellow-400/10">
          {service ? <service.icon className="h-5 w-5 text-yellow-400" strokeWidth={2.25} /> : null}
        </span>
        <div className="min-w-0">
          <p className="truncate font-display text-base font-semibold text-fg">{order.product}</p>
          <p className="text-xs text-fg-faint">
            {order.publicId} &middot; {order.createdAt.slice(0, 10)}
          </p>
        </div>
        <span className="ml-auto shrink-0 rounded-full border border-border px-2.5 py-1 text-[10px] font-bold tracking-wide text-fg-muted uppercase">
          {order.status.replace(/_/g, " ")}
        </span>
      </div>

      <p className="mt-3 text-sm text-fg-muted">{order.summary}</p>

      {images.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {images.map((file) => (
            <a
              key={`thumb-${file.optionIndex}-${file.url}`}
              href={file.url}
              target="_blank"
              rel="noreferrer"
              title={`Option ${file.optionIndex} — open full size`}
              className="block h-20 w-20 overflow-hidden rounded-xl border border-border transition-colors hover:border-yellow-400/60"
            >
              <img src={file.url} alt={`Option ${file.optionIndex}`} loading="lazy" className="h-full w-full object-cover" />
            </a>
          ))}
        </div>
      ) : null}

      {order.files.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {order.files.map((file) => {
            const href = save(file);
            return (
              <a
                key={`save-${file.optionIndex}-${file.url}`}
                href={href ?? file.url}
                {...(href ? {} : { target: "_blank", rel: "noreferrer" })}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-fg-muted transition-colors hover:border-yellow-400/50 hover:text-fg"
              >
                {href ? <Download className="h-3 w-3" /> : <ExternalLink className="h-3 w-3" />}
                {order.files.length > 1 ? `Option ${file.optionIndex}` : "Download"}
              </a>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
