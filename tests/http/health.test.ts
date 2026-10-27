import { describe, expect, it } from "vitest";
import { BASE_URL } from "./app";

describe("GET /api/health", () => {
  it("reports the local database as reachable, uncached", async () => {
    const response = await fetch(`${BASE_URL}/api/health`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ database: "ok" });
  });
});
