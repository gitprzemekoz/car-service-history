import { createClient } from "@supabase/supabase-js";
import { anonKey, url } from "./env";

// One instance per actor: signing a second user into the same instance would replace its session.
export function newClient() {
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type DbClient = ReturnType<typeof newClient>;
