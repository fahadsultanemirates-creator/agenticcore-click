import { Logo } from "../Logo";

export function Footer() {
  return (
    <footer className="border-t border-ink/10 px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
        <Logo />
        <p className="text-sm text-ink-faint">
          Part of the AgenticCore family — the fast, self-serve one.
        </p>
        <p className="text-sm text-ink-faint">
          &copy; {new Date().getFullYear()} agenticcore.click
        </p>
      </div>
    </footer>
  );
}
