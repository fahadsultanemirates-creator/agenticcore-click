import { ArrowRight } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Logo } from "../components/Logo";
import { PasswordInput } from "../components/PasswordInput";
import { useAuth } from "../context/AuthContext";
import { looksLikeSigninCode } from "../lib/signinCodeShape";

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [codeInPassword, setCodeInPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? "/dashboard";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("Enter an email and password to continue.");
      return;
    }
    setError("");
    setCodeInPassword(false);
    setSubmitting(true);
    const { error: loginError } = await login(email.trim(), password);
    setSubmitting(false);
    if (loginError) {
      // A client who signed up in Telegram has exactly one credential --
      // the sign-in code -- and no reason to know it is not a password.
      // "Invalid login credentials" sends them nowhere; this sends them
      // to the page that turns the code into a password.
      setError(loginError);
      setCodeInPassword(looksLikeSigninCode(password));
      return;
    }
    navigate(from, { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-void px-6 py-16">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 flex justify-center">
          <Logo />
        </Link>

        <div className="rounded-2xl border border-border bg-surface p-7">
          <h1 className="font-display text-2xl font-semibold text-fg">Welcome back</h1>
          <p className="mt-1.5 text-sm text-fg-muted">
            Log in to your dashboard.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold tracking-wide text-fg-muted uppercase">Email</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@business.com"
                className="rounded-xl border-2 border-border bg-void px-3.5 py-2.5 text-fg placeholder:text-fg-faint focus:border-yellow-400 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs font-semibold tracking-wide text-fg-muted uppercase">Password</span>
                <Link to="/reset" className="text-xs font-semibold text-yellow-400 hover:underline">
                  Forgot?
                </Link>
              </div>
              <PasswordInput
                autoComplete="current-password"
                value={password}
                onChange={setPassword}
                placeholder="••••••••"
                className="rounded-xl border-2 border-border bg-void px-3.5 py-2.5 text-fg placeholder:text-fg-faint focus:border-yellow-400 focus:outline-none"
              />
            </label>

            {error && <p className="text-sm text-yellow-400">{error}</p>}
            {codeInPassword && (
              <p className="rounded-xl border border-yellow-400/30 bg-yellow-400/5 p-3 text-sm text-fg-muted">
                That looks like the sign-in code from your Telegram chat. It is not a password — it{" "}
                <em>sets</em> one.{" "}
                <Link to="/claim" className="font-semibold text-yellow-400 hover:underline">
                  Use it here to choose a password
                </Link>
                , then come back and log in with that.
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-yellow-400 px-5 py-3 text-sm font-semibold text-void shadow-glow-yellow transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Logging in..." : "Log in"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-fg-muted">
          New here?{" "}
          <Link to="/signup" className="font-semibold text-yellow-400 hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
