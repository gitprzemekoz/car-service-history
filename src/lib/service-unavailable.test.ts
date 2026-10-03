import { describe, expect, it } from "vitest";
import { serviceUnavailableResponse } from "./service-unavailable";

describe("serviceUnavailableResponse", () => {
  it("returns an uncached 503 with a retry hint", () => {
    const response = serviceUnavailableResponse();
    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("retry-after")).toBe("30");
  });

  it("serves a self-contained page linking home", async () => {
    const body = await serviceUnavailableResponse().text();
    expect(body).toContain('href="/"');
    expect(body).not.toMatch(/<link\b|<script\b|src=/i);
  });
});
