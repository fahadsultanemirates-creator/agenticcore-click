import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Legacy JWT-format anon key, not the newer sb_publishable_ key -- Edge
// Functions invocation silently failed client-side with the publishable
// key (zero server-side logs, meaning the request never went out), so
// stick with the format .agency's own working functions were built
// around. Safe to ship in client code either way: real protection is
// Postgres RLS + the Edge Functions' own auth checks, not secrecy of
// this key.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
