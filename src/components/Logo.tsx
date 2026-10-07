import logoLockup from "../assets/agenticcore-lockup.png";

/**
 * The whole lockup, monogram and wordmark together, as one image -- the
 * wordmark used to be html text beside a cropped monogram, which meant the
 * compact header showed the monogram alone and read as half a logo.
 *
 * The artwork's black field is keyed out, so it sits on --color-void with no
 * visible plate. It stacks, so it needs the height: much below h-11 the
 * wordmark stops being readable.
 */
export function Logo({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <img
      src={logoLockup}
      alt="agenticcore.click"
      className={`${compact ? "h-11" : "h-12"} w-auto shrink-0 ${className}`}
    />
  );
}
