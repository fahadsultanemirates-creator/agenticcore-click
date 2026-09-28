import type { Session, User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabase";

type AuthUser = {
  id: string;
  name: string;
  email: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  session: Session | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ error: string | null }>;
  /** Resolves with needsConfirmation when the project requires the client to
   *  click a link before they have a session -- see signup below. */
  signup: (
    name: string,
    email: string,
    password: string
  ) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  /** Emails a recovery link. Always reports success -- see requestPasswordReset. */
  requestPasswordReset: (email: string) => Promise<{ error: string | null }>;
  /** Sets a new password for whoever is holding a recovery session. */
  setPassword: (password: string) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function nameFromEmail(email: string) {
  const local = email.split("@")[0] ?? "there";
  return local
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function toAuthUser(user: User | null | undefined): AuthUser | null {
  if (!user) return null;
  const metaName = (user.user_metadata?.name as string | undefined)?.trim();
  return {
    id: user.id,
    name: metaName || nameFromEmail(user.email ?? ""),
    email: user.email ?? "",
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const login: AuthContextValue["login"] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  // Whether a session comes back depends on a project setting the frontend
  // cannot see: with "Confirm email" on, signUp succeeds with session: null
  // and the client has to click a link first. This used to return only the
  // error, so the caller navigated to /dashboard, RequireAuth found nobody,
  // and a client who had just chosen a password landed back on /login with
  // no explanation. Report which of the two happened instead of guessing.
  const signup: AuthContextValue["signup"] = async (name, email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name: name.trim() || undefined } },
    });
    if (error) return { error: error.message, needsConfirmation: false };
    return { error: null, needsConfirmation: data.session === null };
  };

  // Deliberately does NOT report whether the address exists. An error like
  // "no account with that email" turns this form into a way to find out who
  // has an account here, which is a privacy leak with no upside -- the
  // honest-looking message is the less safe one.
  const requestPasswordReset: AuthContextValue["requestPasswordReset"] = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset`,
    });
    // Rate limiting is worth surfacing: the client can act on "wait a minute"
    // in a way they cannot act on "that address is unknown".
    if (error && /rate|too many|seconds/i.test(error.message)) return { error: error.message };
    return { error: null };
  };

  const setPassword: AuthContextValue["setPassword"] = async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error?.message ?? null };
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        user: toAuthUser(session?.user),
        session,
        loading,
        login,
        signup,
        requestPasswordReset,
        setPassword,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
