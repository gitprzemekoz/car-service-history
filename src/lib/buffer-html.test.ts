import { describe, expect, it } from "vitest";
import { bufferHtmlResponse } from "./buffer-html";

const encoder = new TextEncoder();

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe("bufferHtmlResponse", () => {
  it("buffers a healthy multi-chunk HTML body and preserves status and headers", async () => {
    const headers = new Headers({ "content-type": "text/html; charset=utf-8", "x-custom": "1" });
    headers.append("set-cookie", "a=1; Path=/");
    headers.append("set-cookie", "b=2; Path=/");
    const original = new Response(streamOf(["<!doctype html>", "<html><body>", "ok</body></html>"]), {
      status: 201,
      statusText: "Created",
      headers,
    });

    const buffered = await bufferHtmlResponse(original);

    expect(buffered).not.toBe(original);
    expect(await buffered.text()).toBe("<!doctype html><html><body>ok</body></html>");
    expect(buffered.status).toBe(201);
    expect(buffered.statusText).toBe("Created");
    expect(buffered.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(buffered.headers.get("x-custom")).toBe("1");
    expect(buffered.headers.getSetCookie()).toEqual(["a=1; Path=/", "b=2; Path=/"]);
  });

  it("rejects when the HTML body stream errors mid-render", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("<!doctype html><html><body>partial"));
        controller.error(new Error("boom"));
      },
    });
    const original = new Response(body, { status: 200, headers: { "content-type": "text/html" } });

    await expect(bufferHtmlResponse(original)).rejects.toThrow("boom");
  });

  it("returns a redirect unchanged and unread", async () => {
    const original = new Response(null, { status: 302, headers: { location: "/auth/signin" } });

    const result = await bufferHtmlResponse(original);

    expect(result).toBe(original);
    expect(result.bodyUsed).toBe(false);
  });

  it("returns a JSON response unchanged and unread", async () => {
    const original = new Response(streamOf(['{"ok":true}']), {
      headers: { "content-type": "application/json" },
    });

    const result = await bufferHtmlResponse(original);

    expect(result).toBe(original);
    expect(result.bodyUsed).toBe(false);
  });

  it("returns an HTML response with a null body unchanged", async () => {
    const original = new Response(null, { status: 204, headers: { "content-type": "text/html" } });

    const result = await bufferHtmlResponse(original);

    expect(result).toBe(original);
  });
});
