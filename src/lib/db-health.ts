import type { SupabaseClient } from "@supabase/supabase-js";

export type DbHealth = "ok" | "unavailable" | "unconfigured";

// Bounds the probe so a hanging database cannot hold the health request open.
const PROBE_TIMEOUT_MS = 3000;

// postgrest-js reports status 0 when fetch itself fails or is aborted; PostgREST answers 5xx
// (503 for a lost Postgres connection). A 4xx — RLS, permissions — means the database answered.
export function classifyDbStatus(status: number): "ok" | "unavailable" {
  return status === 0 || status >= 500 ? "unavailable" : "ok";
}

export async function checkDbHealth(supabase: SupabaseClient | null): Promise<{ health: DbHealth; error?: unknown }> {
  if (!supabase) return { health: "unconfigured" };
  try {
    // Anonymous visitors see zero `profiles` rows under RLS — a cheap round-trip to Postgres.
    const { status, error } = await supabase
      .from("profiles")
      .select("id", { head: true })
      .limit(1)
      .abortSignal(AbortSignal.timeout(PROBE_TIMEOUT_MS));
    const health = classifyDbStatus(status);
    return health === "unavailable" ? { health, error } : { health };
  } catch (error) {
    return { health: "unavailable", error };
  }
}
