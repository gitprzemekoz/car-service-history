import { afterEach, describe, expect, it, vi } from "vitest";
import { logError, logWarn, safePath, serializeError } from "./log-error";

describe("serializeError", () => {
  it("keeps name, message and stack of an Error", () => {
    const result = serializeError(new TypeError("boom"));
    expect(result.name).toBe("TypeError");
    expect(result.message).toBe("boom");
    expect(result.stack).toContain("boom");
  });

  it("serializes the cause chain, capped at three levels", () => {
    const err = new Error("l0", {
      cause: new Error("l1", { cause: new Error("l2", { cause: new Error("l3", { cause: new Error("l4") }) }) }),
    });
    const result = serializeError(err);
    expect(result.cause?.message).toBe("l1");
    expect(result.cause?.cause?.message).toBe("l2");
    expect(result.cause?.cause?.cause?.message).toBe("l3");
    expect(result.cause?.cause?.cause?.cause).toBeUndefined();
  });

  it("keeps the fields of a PostgREST-like plain object", () => {
    const result = serializeError({ message: "denied", code: "42501", details: "RLS", hint: "check policies" });
    expect(result).toEqual({ name: "Error", message: "denied", code: "42501", details: "RLS", hint: "check policies" });
  });

  it("keeps status of an auth-like error", () => {
    const err = Object.assign(new Error("down"), { name: "AuthApiError", status: 503, code: "unexpected" });
    expect(serializeError(err)).toMatchObject({ name: "AuthApiError", status: 503, code: "unexpected" });
  });

  it("wraps a string", () => {
    expect(serializeError("plain failure")).toEqual({ name: "NonError", message: "plain failure" });
  });

  it("wraps null", () => {
    expect(serializeError(null)).toEqual({ name: "NonError", message: "null" });
  });

  it("wraps an object without a message", () => {
    expect(serializeError({ code: "X" })).toEqual({ name: "NonError", message: "[object Object]" });
  });
});

describe("safePath", () => {
  it("masks the share token", () => {
    expect(safePath("/share/abc123")).toBe("/share/***");
  });

  it("masks the share token with a trailing slash", () => {
    expect(safePath("/share/abc123/")).toBe("/share/***/");
  });

  it("leaves other paths unchanged", () => {
    const path = "/dashboard/mechanic/clients/3f1c2a9e-8b7d-4c6e-9a5b-1d2e3f4a5b6c";
    expect(safePath(path)).toBe(path);
  });
});

describe("logError / logWarn", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes one JSON line to console.error with context and error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logError("middleware.auth", new Error("boom"), { route: "/dashboard", method: "GET", stage: "auth" });

    expect(spy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(String(spy.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(line).toMatchObject({
      level: "error",
      event: "middleware.auth",
      route: "/dashboard",
      method: "GET",
      stage: "auth",
      error: { name: "Error", message: "boom" },
    });
  });

  it("writes one JSON line to console.warn, with the error optional", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    logWarn("middleware.profile", { path: "/share/***", userId: "u1" });
    logWarn("middleware.profile", { stage: "profile" }, { message: "denied", code: "42501" });

    expect(spy).toHaveBeenCalledTimes(2);
    const first = JSON.parse(String(spy.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(first).toEqual({ level: "warn", event: "middleware.profile", path: "/share/***", userId: "u1" });
    const second = JSON.parse(String(spy.mock.calls[1]?.[0])) as Record<string, unknown>;
    expect(second).toMatchObject({ level: "warn", stage: "profile", error: { message: "denied", code: "42501" } });
  });
});
