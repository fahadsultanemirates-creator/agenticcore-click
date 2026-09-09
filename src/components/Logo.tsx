import { Zap } from "lucide-react";

export function Logo({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 to-orange-500">
        <Zap className="h-5 w-5 text-cream" fill="currentColor" strokeWidth={0} />
      </span>
      {!compact && (
        <span className="font-display text-xl font-semibold tracking-tight whitespace-nowrap text-ink">
          agenticcore
          <span className="font-sans text-base font-medium text-ink-faint">.click</span>
        </span>
      )}
    </div>
  );
}
