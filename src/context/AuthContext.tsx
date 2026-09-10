import { createContext, useContext, useState, type ReactNode } from "react";

type AuthUser = {
  name: string;
  email: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  login: (email: string, _password: string) => AuthUser;
  signup: (name: string, email: string, _password: string) => AuthUser;
  logout: () => void;
};

const STORAGE_KEY = "agenticcore_click_auth_user";

const AuthContext = createContext<AuthContextValue | null>(null);

function nameFromEmail(email: string) {
  const local = email.split("@")[0] ?? "there";
  return local
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function readStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(readStoredUser);

  const persist = (next: AuthUser) => {
    setUser(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // best-effort only — this is a mock auth flow
    }
    return next;
  };

  const login: AuthContextValue["login"] = (email) => {
    return persist({ name: nameFromEmail(email), email });
  };

  const signup: AuthContextValue["signup"] = (name, email) => {
    return persist({ name: name.trim() || nameFromEmail(email), email });
  };

  const logout = () => {
    setUser(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
