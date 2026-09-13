import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";

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

export function ServicePageHeader({
  eta,
  price,
  title,
  subtitle,
}: {
  eta: string;
  price: string;
  title: string;
  subtitle: string;
}) {
  return (
    <>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-yellow-400">
        <Sparkles className="h-4 w-4" />
        {eta} &middot; {price}
      </div>
      <h1 className="font-display text-3xl font-semibold text-fg sm:text-4xl">{title}</h1>
      <p className="mt-2 text-fg-muted">{subtitle}</p>
    </>
  );
}

export function SubmitBar({ label = "Send brief" }: { label?: string }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <button
        type="submit"
        className="inline-flex w-fit items-center gap-2 rounded-full bg-yellow-400 px-7 py-3.5 text-base font-semibold text-void shadow-glow-yellow transition-transform hover:-translate-y-0.5"
      >
        {label}
        <Sparkles className="h-4 w-4" />
      </button>
      <p className="text-xs text-fg-faint">
        Mockup only — this simulates the flow, no request is actually sent anywhere.
      </p>
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
