import { LayoutGrid, LogIn, LogOut, ShieldCheck, Sparkles, UserRound, Wallet, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useWallet } from "../lib/useWallet";

// The single account control used by both the landing nav and the dashboard
// header, so "am I signed in, and what's my balance" is answered the same way
// everywhere. Signed out it renders Log in / Get started instead of an avatar.
export function AccountMenu() {
  const { user } = useAuth();

  // Split so the signed-out branch never mounts the wallet query.
  return user ? <SignedInMenu /> : <SignedOutActions />;
}

function SignedOutActions() {
  return (
    <div className="flex shrink-0 items-center gap-2">
      {/* Label collapses to the icon on a phone so the header never gets
          crowded next to the menu button. */}
      <Link
        to="/login"
        aria-label="Log in"
        className="flex h-9 items-center gap-1.5 rounded-full border border-border px-2.5 text-sm font-semibold text-fg-muted transition-colors hover:border-yellow-400/50 hover:text-fg sm:px-4"
      >
        <LogIn className="h-4 w-4" />
        <span className="hidden sm:inline">Log in</span>
      </Link>
      <Link
        to="/signup"
        className="flex h-9 items-center rounded-full bg-yellow-400 px-3.5 text-sm font-semibold text-void shadow-glow-yellow transition-transform hover:-translate-y-0.5 active:translate-y-0 sm:px-5"
      >
        Get started
      </Link>
    </div>
  );
}

function SignedInMenu() {
  const { user, logout } = useAuth();
  const { balance, loading } = useWallet();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const handleLogout = async () => {
    await logout();
    setOpen(false);
    navigate("/", { replace: true });
  };

  const initial = user?.name?.trim()?.[0]?.toUpperCase() ?? "Y";
  const balanceLabel = loading ? "—" : `$${(balance ?? 0).toFixed(2)}`;

  return (
    <div className="relative flex shrink-0 items-center gap-2" ref={containerRef}>
      <Link
        to="/dashboard#billing"
        title="Wallet balance"
        className="hidden items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-fg transition-colors hover:border-yellow-400/50 sm:flex"
      >
        <Wallet className="h-3.5 w-3.5 text-yellow-400" />
        {balanceLabel}
      </Link>

      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-yellow-400 text-sm font-semibold text-void transition-transform hover:-translate-y-0.5"
      >
        {initial}
      </button>

      {open && (
        <div
          role="menu"
          className="animate-fade-up absolute top-full right-0 z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-border bg-surface shadow-glow"
        >
          <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-yellow-400/10">
              <UserRound className="h-4 w-4 text-yellow-400" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-fg">{user?.name}</p>
              <p className="truncate text-xs text-fg-faint">{user?.email}</p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <span className="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
              <Wallet className="h-3.5 w-3.5 text-yellow-400" /> Wallet
            </span>
            <span className="font-display text-base font-semibold text-fg">{balanceLabel}</span>
          </div>

          <nav className="flex flex-col p-1.5">
            <MenuLink to="/dashboard" icon={LayoutGrid} onClick={() => setOpen(false)}>
              Dashboard
            </MenuLink>
            <MenuLink to="/dashboard/forge" icon={Sparkles} onClick={() => setOpen(false)}>
              Talk to Forge
            </MenuLink>
            <MenuLink to="/dashboard#billing" icon={Wallet} onClick={() => setOpen(false)}>
              Wallet &amp; billing
            </MenuLink>
            <MenuLink to="/admin" icon={ShieldCheck} onClick={() => setOpen(false)}>
              Admin
            </MenuLink>
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <LogOut className="h-4 w-4" /> Log out
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  to,
  icon: Icon,
  onClick,
  children,
}: {
  to: string;
  icon: LucideIcon;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      role="menuitem"
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
    >
      <Icon className="h-4 w-4" /> {children}
    </Link>
  );
}
