// The way back in after a forgotten password.
//
// Until this page existed there was none: a client who forgot their password
// was locked out permanently unless somebody edited their row by hand.
//
// One route does both halves of the job, because the client arrives at the
// same URL twice and should not have to understand why. Arriving from the
// login link, there is no recovery session, so they get the "email me a
// link" form. Arriving from the emailed link, supabase-js has already
// exchanged the token in the URL for a recovery session by the time this
// renders, so they get the "choose a new password" form instead.

import { ArrowRight, MailCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Logo } from "../components/Logo";
import { PasswordInput } from "../components/PasswordInput";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

const FIELD =
  "rounded-xl border-2 border-border bg-void px-3.5 py-2.5 text-fg placeholder:text-fg-faint focus:border-yellow-400 focus:outline-none";
const LABEL = "text-xs font-semibold tracking-wide text-fg-muted uppercase";
const BUTTON =
  "mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-yellow-400 px-5 py-3 text-sm font-semibold text-void shadow-glow-yellow transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60";

export function ResetPassword() {
  const { requestPasswordReset, setPassword } = useAuth();
  const navigate = useNavigate();

  const [recovering, setRecovering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPasswordValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Two ways to find out we are mid-recovery, because they race. The event
  // fires when supabase-js finishes reading the token out of the URL, which
  // may already have happened before this component mounted -- in which case
  // no event is coming and only the session says so.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session && window.location.hash.includes("type=recovery")) setRecovering(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleRequest = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Enter the email address you signed up with.");
      return;
    }
    setError("");
    setSubmitting(true);
    const { error: requestError } = await requestPasswordReset(email.trim());
    setSubmitting(false);
    if (requestError) {
      setError(requestError);
      return;
    }
    setSent(true);
  };

  const handleSet = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Those two passwords don't match.");
      return;
    }
    setError("");
    setSubmitting(true);
    const { error: setError_ } = await setPassword(password);
    setSubmitting(false);
    if (setError_) {
      setError(setError_);
      return;
    }
    // Already signed in by the recovery session, so there is nothing to log
    // into -- go straight where they were trying to get.
    navigate("/dashboard", { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-void px-6 py-16">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 flex justify-center">
          <Logo />
        </Link>

        <div className="rounded-2xl border border-border bg-surface p-7">
          {recovering ? (
            <>
              <h1 className="font-display text-2xl font-semibold text-fg">Choose a new password</h1>
              <p className="mt-1.5 text-sm text-fg-muted">
                You'll be signed in as soon as it's saved.
              </p>

              <form onSubmit={handleSet} className="mt-6 flex flex-col gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className={LABEL}>New password</span>
                  <PasswordInput
                    autoComplete="new-password"
                    value={password}
                    onChange={setPasswordValue}
                    placeholder="At least 6 characters"
                    className={FIELD}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className={LABEL}>Confirm password</span>
                  <PasswordInput
                    autoComplete="new-password"
                    value={confirm}
                    onChange={setConfirm}
                    placeholder="Type it again"
                    className={FIELD}
                  />
                </label>

                {error && <p className="text-sm text-yellow-400">{error}</p>}

                <button type="submit" disabled={submitting} className={BUTTON}>
                  {submitting ? "Saving..." : "Save password"}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>
            </>
          ) : sent ? (
            <>
              <MailCheck className="h-8 w-8 text-yellow-400" />
              <h1 className="mt-3 font-display text-2xl font-semibold text-fg">Check your email</h1>
              {/* Worded so it is true whether or not that address has an
                  account, which is the point -- see requestPasswordReset. */}
              <p className="mt-1.5 text-sm text-fg-muted">
                If there's an account for {email.trim()}, a reset link is on its way. The link opens
                this page again and lets you set a new password.
              </p>
              <p className="mt-4 text-sm text-fg-faint">
                Nothing after a few minutes? Check spam, then try again.
              </p>
            </>
          ) : (
            <>
              <h1 className="font-display text-2xl font-semibold text-fg">Reset your password</h1>
              <p className="mt-1.5 text-sm text-fg-muted">
                We'll email you a link to set a new one.
              </p>

              <form onSubmit={handleRequest} className="mt-6 flex flex-col gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className={LABEL}>Email</span>
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@business.com"
                    className={FIELD}
                  />
                </label>

                {error && <p className="text-sm text-yellow-400">{error}</p>}

                <button type="submit" disabled={submitting} className={BUTTON}>
                  {submitting ? "Sending..." : "Email me a link"}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-fg-muted">
          <Link to="/login" className="font-semibold text-yellow-400 hover:underline">
            Back to log in
          </Link>
        </p>
      </div>
    </div>
  );
}
