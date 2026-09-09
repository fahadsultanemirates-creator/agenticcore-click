import logoImg from "../assets/agenticcore-logo.jpg";

export function Logo({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <span className="h-9 w-9 shrink-0 overflow-hidden rounded-xl bg-void ring-1 ring-border">
        <img
          src={logoImg}
          alt=""
          aria-hidden
          className="h-[220%] w-[220%] max-w-none -translate-x-[18%] -translate-y-[8%] object-cover"
        />
      </span>
      {!compact && (
        <span className="font-display text-xl font-semibold tracking-tight whitespace-nowrap text-fg">
          agentic<span className="text-yellow-400">core</span>
          <span className="font-sans text-base font-medium text-fg-muted">.click</span>
        </span>
      )}
    </div>
  );
}
