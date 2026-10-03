import { isAuthApiError, isAuthSessionMissingError } from "@supabase/supabase-js";
import type { AuthError, PostgrestError, User } from "@supabase/supabase-js";
import type { Role } from "@/lib/types";

export type AuthState =
  { kind: "signed-in"; user: User } | { kind: "anonymous" } | { kind: "unavailable"; error: AuthError };

export type ProfileState =
  { kind: "found"; role: Role } | { kind: "missing" } | { kind: "unavailable"; error: PostgrestError };

// PostgREST code for `.single()` matching zero rows.
const NO_ROWS = "PGRST116";

// A 4xx from the auth API means the session itself is bad (expired, revoked) — the visitor is
// simply signed out. Network failures and 5xx mean auth could not be checked at all.
export function classifyAuth({ user, error }: { user: User | null; error: AuthError | null }): AuthState {
  if (error === null) {
    return user === null ? { kind: "anonymous" } : { kind: "signed-in", user };
  }
  if (isAuthSessionMissingError(error)) return { kind: "anonymous" };
  if (isAuthApiError(error) && error.status >= 400 && error.status < 500) return { kind: "anonymous" };
  return { kind: "unavailable", error };
}

export function classifyProfile({
  data,
  error,
}: {
  data: { role: string } | null;
  error: PostgrestError | null;
}): ProfileState {
  if (error !== null) {
    return error.code === NO_ROWS ? { kind: "missing" } : { kind: "unavailable", error };
  }
  return data === null ? { kind: "missing" } : { kind: "found", role: data.role as Role };
}
