// Where an account opened in Telegram gets its password.
//
// The bot creates a real, usable account from a chat and hands over a
// one-time code. That account has no password at all until somebody lands
// here: Supabase lets a user exist without one, which is exactly the state
// a Telegram signup is in. This page is the only way out of it.
//
// It deliberately does not ask the client to understand any of that. Three
// fields, then they are signed in.

import { ArrowRight, Check } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Logo } from "../components/Logo";
import { TelegramIcon } from "../components/icons/TelegramIcon";
import { useAuth } from "../context/AuthContext";
import { functionErrorMessage } from "../lib/functionError";
import { supabase } from "../lib/supabase";

const FIELD =
  "rounded-xl border-2 border-border bg-void px-3.5 py-2.5 text-fg placeholder:text-fg-faint focus:border-yellow-400 focus:outline-none";
const LABEL = "text-xs font-semibold tracking-wide text-fg-muted uppercase";
const BUTTON =
  "mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-yellow-400 px-5 py-3 text-sm font-semibold text-void shadow-glow-yellow transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60";

const MIN_PASSWORD_LENGTH = 8;

export function ClaimAccount() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  // Read once, as the initial value, rather than in an effect: these are
  // in the URL before the first render, and setting them afterwards just
  // renders the page twice.
  const [email, setEmail] = useState(() => params.get("email") ?? "");
  const [code, setCode] = useState(() => params.get("code") ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !code.trim()) {
      setError("Enter the email you gave the bot, and the code it sent you.");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Those two passwords don't match.");
      return;
    }

    setError("");
    setSubmitting(true);

    const { data, error: fnError } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
      "telegram-claim",
      { body: { email: email.trim(), code: code.trim(), password } },
    );

    if (fnError || !data?.ok) {
      setSubmitting(false);
      setError(
        await functionErrorMessage(fnError, data?.error ?? "Could not set that password. Please try again."),
      );
      return;
    }

    // Sign them straight in rather than sending them to /login to type the
    // password they chose ten seconds ago.
    const { error: loginError } = await login(email.trim(), password);
    setSubmitting(false);
    if (loginError) {
      setError(`Password saved. Please sign in at the login page: ${loginError}`);
      return;
    }
    navigate("/dashboard", { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-void px-6 py-16">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 flex justify-center">
          <Logo />
        </Link>

        <div className="rounded-2xl border border-border bg-surface p-7">
          <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-medium text-fg-muted">
            <TelegramIcon className="h-3.5 w-3.5 text-yellow-400" />
            From the Telegram bot
          </span>

          <h1 className="font-display text-2xl font-semibold text-fg">Set your password</h1>
          <p className="mt-1.5 text-sm text-fg-muted">
            Your account already exists — this gives it a password so you can sign in here too.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className={LABEL}>Email</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="The address you gave the bot"
                className={FIELD}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className={LABEL}>Code from the bot</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="ABCD-2345"
                autoCapitalize="characters"
                spellCheck={false}
                className={`${FIELD} font-mono tracking-widest uppercase`}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className={LABEL}>Choose a password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                className={FIELD}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className={LABEL}>Confirm password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Type it again"
                className={FIELD}
              />
            </label>

            {error && <p className="text-sm text-yellow-400">{error}</p>}

            <button type="submit" disabled={submitting} className={BUTTON}>
              {submitting ? "Saving..." : "Save password and sign in"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <ul className="mt-6 flex flex-col gap-2 border-t border-border pt-5 text-xs text-fg-faint">
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-yellow-400" />
              The code works once and lasts 30 days.
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-yellow-400" />
              Lost it? Send <span className="font-mono text-fg-muted">/login</span> to the bot for a new one.
            </li>
          </ul>
        </div>

        <p className="mt-6 text-center text-sm text-fg-faint">
          Already have a password?{" "}
          <Link to="/login" className="text-yellow-400 hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
