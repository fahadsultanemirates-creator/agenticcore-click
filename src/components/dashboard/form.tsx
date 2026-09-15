import { Clock, Loader2, Sparkles, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { getService } from "../../data/services";

export const inputClass =
  "w-full min-w-0 rounded-xl border-2 border-border bg-void px-3.5 py-2.5 text-fg placeholder:text-fg-faint focus:border-yellow-400 focus:outline-none";

type DelegateProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export function Field({
  label,
  optional = true,
  delegate,
  children,
}: {
  label: string;
  optional?: boolean;
  delegate?: DelegateProps;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
          {label} {optional && <span className="text-fg-faint normal-case">(optional)</span>}
        </span>
        {delegate && (
          <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs font-medium text-fg-faint">
            <input
              type="checkbox"
              checked={delegate.checked}
              onChange={(e) => delegate.onChange(e.target.checked)}
              className="accent-yellow-400"
            />
            You decide
          </label>
        )}
      </div>
      <div className={delegate?.checked ? "pointer-events-none opacity-40" : ""}>{children}</div>
    </div>
  );
}

export function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <h2 className="font-display text-lg font-semibold text-fg">{title}</h2>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </div>
  );
}

// Price and turnaround come from src/data/services.ts so the dashboard card
// and this header can never disagree. `price`/`eta` are overridable for
// services whose figure depends on what's selected on the page (video).
export function ServicePageHeader({
  serviceId,
  title,
  subtitle,
  price,
  eta,
}: {
  serviceId: string;
  title: string;
  subtitle: string;
  price?: string;
  eta?: string;
}) {
  const service = getService(serviceId);

  return (
    <div className="mb-8">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-yellow-400/10">
          <service.icon className="h-5 w-5 text-yellow-400" strokeWidth={2.25} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-fg-faint uppercase">
            {service.label}
          </p>
          <h1 className="mt-0.5 font-display text-2xl font-semibold text-fg sm:text-3xl">{title}</h1>
        </div>
      </div>

      <p className="mt-3 text-sm text-fg-muted sm:text-base">{subtitle}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 rounded-full border border-yellow-400/40 bg-yellow-400/10 px-3 py-1.5 text-sm font-semibold text-yellow-400">
          <Sparkles className="h-3.5 w-3.5" /> {price ?? service.price}
        </span>
        <span className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium text-fg-muted">
          <Clock className="h-3.5 w-3.5" /> {eta ?? service.eta}
        </span>
      </div>
    </div>
  );
}

export function SubmitBar({
  label = "Send brief",
  loading = false,
  loadingLabel = "Submitting...",
}: {
  label?: string;
  loading?: boolean;
  loadingLabel?: string;
}) {
  return (
    <div className="flex flex-col items-start gap-3">
      <button
        type="submit"
        disabled={loading}
        className="inline-flex w-fit items-center gap-2 rounded-full bg-yellow-400 px-7 py-3.5 text-base font-semibold text-void shadow-glow-yellow transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? loadingLabel : label}
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function SubmittedNote({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 flex items-start gap-3 rounded-2xl border border-yellow-400/40 bg-yellow-400/10 p-4">
      <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-yellow-400" />
      <p className="text-sm text-fg">{children}</p>
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 flex items-start gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 p-4">
      <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
      <p className="text-sm text-fg">{children}</p>
    </div>
  );
}

export function UploadDropzone({ label }: { label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-void px-4 py-6 text-sm text-fg-faint transition-colors hover:border-yellow-400/50">
      {label}
      <input type="file" className="hidden" />
    </label>
  );
}

export function ChipToggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border-2 px-3.5 py-1.5 text-sm font-medium transition-colors ${
        active ? "border-yellow-400 bg-yellow-400 text-void" : "border-border text-fg-muted hover:border-yellow-400/50"
      }`}
    >
      {label}
    </button>
  );
}
