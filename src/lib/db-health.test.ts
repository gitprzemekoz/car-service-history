import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { checkDbHealth, classifyDbStatus } from "./db-health";

// Minimal stand-in for the `from().select().limit().abortSignal()` chain the probe uses.
function stubClient(result: () => Promise<{ status: number; error: unknown }>): SupabaseClient {
  const query = {
    select: () => query,
    limit: () => query,
    abortSignal: () => result(),
  };
  return { from: () => query } as unknown as SupabaseClient;
}

describe("classifyDbStatus", () => {
  it.each([0, 500, 502, 503])("treats %i as unavailable", (status) => {
    expect(classifyDbStatus(status)).toBe("unavailable");
  });

  it.each([200, 206, 401, 403, 404])("treats %i as reachable", (status) => {
    expect(classifyDbStatus(status)).toBe("ok");
  });
});

describe("checkDbHealth", () => {
  it("reports unconfigured without a client", async () => {
    expect(await checkDbHealth(null)).toEqual({ health: "unconfigured" });
  });

  it("reports ok when PostgREST answers", async () => {
    expect(await checkDbHealth(stubClient(() => Promise.resolve({ status: 200, error: null })))).toEqual({
      health: "ok",
    });
  });

  it("reports unavailable with the error when PostgREST cannot reach Postgres", async () => {
    const error = { message: "no connection", code: "PGRST001" };
    expect(await checkDbHealth(stubClient(() => Promise.resolve({ status: 503, error })))).toEqual({
      health: "unavailable",
      error,
    });
  });

  it("reports unavailable when the request throws", async () => {
    const error = new TypeError("fetch failed");
    expect(
      await checkDbHealth(
        stubClient(() => {
          throw error;
        }),
      ),
    ).toEqual({ health: "unavailable", error });
  });
});
