import { Check, Download, ExternalLink, FolderInput, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChatLauncher } from "../components/ChatLauncher";
import { DashboardShell } from "../components/dashboard/DashboardShell";
import { ShareButton } from "../components/dashboard/ShareButton";
import { services } from "../data/services";
import { deliverableFilename, forcedDownloadUrl } from "../lib/downloadUrl";
import {
  moveTaskToProject,
  renameProject,
  useProjects,
  type Project,
  type ProjectFile,
  type ProjectOrder,
} from "../lib/useProjects";

// One project, in the order a client reads it: what is ready, then how to
// ask for the next thing, then everything that has been ordered.
//
// "Download" is gone as a word. It is wrong for half of what we sell -- a
// website is visited, a video is watched -- and it describes the
// mechanism rather than the thing. "Save" is what the person is doing.
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

  const ready = project.orders.filter((order) => order.files.length > 0 || order.previewUrl);
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

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <p className="text-sm text-fg-muted">
            {project.orders.length} {project.orders.length === 1 ? "order" : "orders"} in this project.
          </p>
          {/* The project page itself is behind a login, so what gets shared
              is the finished files -- those open for anybody. */}
          <ShareButton title={project.name} urls={project.files.map((file) => file.url)} label="Share everything" />
        </div>

        {/* FIRST: what is actually ready. This is what the client came for,
            and it used to be underneath the brief, the status pill and the
            order history. */}
        <h2 className="mt-9 font-display text-xl font-semibold text-fg">Ready for you</h2>
        {ready.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-border bg-surface p-6 text-sm text-fg-faint">
            Nothing finished in this project yet. We will message you the moment there is.
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {ready.map((order) => (
              <ReadyCard key={order.id} order={order} />
            ))}
          </div>
        )}

        {/* THEN: the next thing, started from this one. */}
        <div className="mt-9 rounded-2xl border border-yellow-400/30 bg-yellow-400/5 p-4 sm:p-5">
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

        {/* LAST: the paper trail, including what is still being made. */}
        <h2 className="mt-9 font-display text-xl font-semibold text-fg">Orders</h2>
        <div className="mt-4 flex flex-col gap-2.5">
          {project.orders.map((order) => (
            <OrderRow
              key={order.id}
              order={order}
              projects={projects}
              currentProjectId={project.id}
              onMoved={() => void reload()}
            />
          ))}
        </div>
      </section>
      <ChatLauncher />
    </DashboardShell>
  );
}

/** A finished order: see it, keep it, send it. */
function ReadyCard({ order }: { order: ProjectOrder }) {
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
      </div>

      {images.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {images.map((file) => (
            <a
              key={`thumb-${file.optionIndex}-${file.url}`}
              href={file.url}
              target="_blank"
              rel="noreferrer"
              title={`Option ${file.optionIndex} — see it full size`}
              className="block h-20 w-20 overflow-hidden rounded-xl border border-border transition-colors hover:border-yellow-400/60"
            >
              <img src={file.url} alt={`Option ${file.optionIndex}`} loading="lazy" className="h-full w-full object-cover" />
            </a>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {/* A deployed site is visited, not kept. */}
        {order.previewUrl ? (
          <>
            <a
              href={order.previewUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-yellow-400 px-3.5 py-1.5 text-xs font-semibold text-void transition-transform hover:-translate-y-0.5"
            >
              <ExternalLink className="h-3 w-3" /> Open site
            </a>
            <ShareButton title={`${order.product} — ${order.publicId}`} urls={[order.previewUrl]} />
          </>
        ) : null}

        {order.files.length > 1 ? (
          <ShareButton title={`${order.product} — ${order.publicId}`} urls={order.files.map((f) => f.url)} label="Share all" />
        ) : null}

        {order.files.map((file) => {
          const href = save(file);
          const name = order.files.length > 1 ? `Option ${file.optionIndex}` : order.product;
          return (
            <span
              key={`file-${file.optionIndex}-${file.url}`}
              className="inline-flex items-center gap-0.5 rounded-full bg-yellow-400 py-1 pr-1 pl-3 text-void"
            >
              <a
                href={href ?? file.url}
                {...(href ? {} : { target: "_blank", rel: "noreferrer" })}
                className="inline-flex items-center gap-1.5 pr-1 text-xs font-semibold"
              >
                {href ? <Download className="h-3 w-3" /> : <ExternalLink className="h-3 w-3" />}
                {order.files.length > 1 ? `Save ${name.toLowerCase()}` : "Save"}
              </a>
              <ShareButton
                compact
                title={`${name} — ${order.publicId}`}
                urls={[file.url]}
                className="text-void/70 hover:bg-void/10 hover:text-void"
              />
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** A line in the paper trail, with the one control that fixes a misfiling. */
function OrderRow({
  order,
  projects,
  currentProjectId,
  onMoved,
}: {
  order: ProjectOrder;
  projects: Project[];
  currentProjectId: string;
  onMoved: () => void;
}) {
  const service = services.find((s) => s.id === order.serviceId);
  const elsewhere = projects.filter((p) => p.id !== currentProjectId);
  const [moving, setMoving] = useState(false);

  const move = async (projectId: string) => {
    setMoving(false);
    if (await moveTaskToProject(order.id, projectId)) onMoved();
  };

  return (
    <div className="rounded-xl border border-border bg-surface p-3.5">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-yellow-400/10">
          {service ? <service.icon className="h-4 w-4 text-yellow-400" strokeWidth={2.25} /> : null}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-fg">{order.product}</p>
          <p className="text-xs text-fg-faint">
            {order.publicId} &middot; {order.createdAt.slice(0, 10)}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-border px-2.5 py-1 text-[10px] font-bold tracking-wide text-fg-muted uppercase">
          {order.status.replace(/_/g, " ")}
        </span>
        {/* The backfill named every old project after its brief, so the
            logos landed under "Client wants a logo created." rather than
            the business they are for. Guessing is fine; being unable to
            correct the guess is not. */}
        {elsewhere.length > 0 ? (
          <button
            type="button"
            onClick={() => setMoving(!moving)}
            aria-label={`Move ${order.publicId} to another project`}
            className="shrink-0 rounded-full p-1.5 text-fg-muted transition-colors hover:text-fg"
          >
            <FolderInput className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <p className="mt-2 line-clamp-2 text-xs text-fg-muted">{order.summary}</p>

      {moving ? (
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-xs font-semibold tracking-wide text-fg-faint uppercase">Move to</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {elsewhere.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => void move(p.id)}
                className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-fg-muted transition-colors hover:border-yellow-400/50 hover:text-fg"
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
