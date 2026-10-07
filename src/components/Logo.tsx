import logoMark from "../assets/agenticcore-mark.png";

export function Logo({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <img
        src={logoMark}
        alt=""
        aria-hidden
        className="h-9 w-9 shrink-0 rounded-xl bg-void object-cover ring-1 ring-border"
      />
      {!compact && (
        <span className="font-display text-xl font-semibold tracking-tight whitespace-nowrap text-fg">
          agentic<span className="text-yellow-400">core</span>
          <span className="font-sans text-base font-medium text-fg-muted">.click</span>
        </span>
      )}
    </div>
  );
}
