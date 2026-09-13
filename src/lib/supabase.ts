import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

// Publishable/anon key -- safe to ship in client code by design (real
// protection is Postgres RLS + the Edge Functions' own auth checks, not
// secrecy of this key). Values point at the agenticcore-click project.
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
