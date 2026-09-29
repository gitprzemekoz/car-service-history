import { describe, expect, it } from "vitest";
// Only the oracle: this file must not import ./app, so it runs without a preview.
import { assertCompletePage, clientIds, entryIds } from "./page";

const COMPLETE = '<!doctype html><html><body><main>ok</main><div data-testid="page-end" hidden></div></body></html>';

describe("assertCompletePage (negative control)", () => {
  it("rejects an empty body", () => {
    expect(() => {
      assertCompletePage("");
    }).toThrow(/does not end with <\/html>/);
  });

  it("rejects a body truncated before </html>", () => {
    expect(() => {
      assertCompletePage('<!doctype html><html><body><ul data-testid="service-history"><li>');
    }).toThrow(/does not end with <\/html>/);
  });

  it("rejects a complete document without the page-end marker", () => {
    expect(() => {
      assertCompletePage("<!doctype html><html><body><main>ok</main></body></html>");
    }).toThrow(/page-end/);
  });

  it("accepts a complete document with the marker, ignoring surrounding whitespace", () => {
    expect(() => {
      assertCompletePage(`\n  ${COMPLETE}\n`);
    }).not.toThrow();
  });
});

describe("id extractors", () => {
  it("returns data-entry-id and data-client-id values in document order", () => {
    const html = '<li data-entry-id="e1"></li><a data-client-id="c1"></a><li data-entry-id="e2"></li>';
    expect(entryIds(html)).toEqual(["e1", "e2"]);
    expect(clientIds(html)).toEqual(["c1"]);
    expect(entryIds(COMPLETE)).toEqual([]);
  });
});
