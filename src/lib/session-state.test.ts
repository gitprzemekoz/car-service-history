import {
  AuthApiError,
  AuthError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  PostgrestError,
} from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { classifyAuth, classifyProfile } from "./session-state";

const USER = { id: "user-1" } as User;

const postgrestError = (code: string) => new PostgrestError({ message: "query failed", details: "", hint: "", code });

describe("classifyAuth", () => {
  it("is signed-in when a user is returned", () => {
    expect(classifyAuth({ user: USER, error: null })).toEqual({ kind: "signed-in", user: USER });
  });

  it("is anonymous when there is neither user nor error", () => {
    expect(classifyAuth({ user: null, error: null })).toEqual({ kind: "anonymous" });
  });

  it("is anonymous when the session is missing", () => {
    expect(classifyAuth({ user: null, error: new AuthSessionMissingError() })).toEqual({ kind: "anonymous" });
  });

  it.each([401, 403])("is anonymous on a %i AuthApiError", (status) => {
    const error = new AuthApiError("bad jwt", status, "bad_jwt");
    expect(classifyAuth({ user: null, error })).toEqual({ kind: "anonymous" });
  });

  it("is unavailable on a retryable fetch error", () => {
    const error = new AuthRetryableFetchError("fetch failed", 0);
    expect(classifyAuth({ user: null, error })).toEqual({ kind: "unavailable", error });
  });

  it("is unavailable on a 5xx AuthApiError", () => {
    const error = new AuthApiError("internal", 500, "unexpected_failure");
    expect(classifyAuth({ user: null, error })).toEqual({ kind: "unavailable", error });
  });

  it("is unavailable on an unknown auth error", () => {
    const error = new AuthError("something else");
    expect(classifyAuth({ user: null, error })).toEqual({ kind: "unavailable", error });
  });
});

describe("classifyProfile", () => {
  it("is found with the row's role", () => {
    expect(classifyProfile({ data: { role: "mechanic" }, error: null })).toEqual({ kind: "found", role: "mechanic" });
  });

  it("is missing on PGRST116 (no rows)", () => {
    expect(classifyProfile({ data: null, error: postgrestError("PGRST116") })).toEqual({ kind: "missing" });
  });

  it("is missing when no data and no error", () => {
    expect(classifyProfile({ data: null, error: null })).toEqual({ kind: "missing" });
  });

  it("is unavailable on any other PostgREST error", () => {
    const error = postgrestError("42501");
    expect(classifyProfile({ data: null, error })).toEqual({ kind: "unavailable", error });
  });
});
