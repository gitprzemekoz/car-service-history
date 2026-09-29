import { describe, expect, it } from "vitest";
import { formatExpiry, isActive, isShareToken, shareUrl } from "./share-link";

// Intl may use non-breaking spaces (U+00A0 / U+202F) between parts.
const normalize = (value: string) => value.replace(/\s/g, " ");

const TOKEN = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123-_Z";

describe("isActive", () => {
  const now = new Date("2026-09-28T12:00:00Z");

  it("is active when expires_at is in the future", () => {
    expect(isActive({ expires_at: "2026-09-28T12:00:01Z" }, now)).toBe(true);
  });

  it("is inactive when expires_at equals now", () => {
    expect(isActive({ expires_at: "2026-09-28T12:00:00Z" }, now)).toBe(false);
  });

  it("is inactive when expires_at is in the past", () => {
    expect(isActive({ expires_at: "2026-09-27T12:00:00Z" }, now)).toBe(false);
  });

  it("is inactive when there is no link", () => {
    expect(isActive(null, now)).toBe(false);
  });

  it("compares instants, not strings, across offsets", () => {
    expect(isActive({ expires_at: "2026-09-28T14:00:01+02:00" }, now)).toBe(true);
  });
});

describe("shareUrl", () => {
  it("joins origin and token under /share/", () => {
    expect(shareUrl("https://example.com", TOKEN)).toBe(`https://example.com/share/${TOKEN}`);
  });
});

describe("formatExpiry", () => {
  it("formats in Europe/Warsaw summer time (UTC+2)", () => {
    expect(normalize(formatExpiry("2026-07-15T10:00:00Z"))).toBe("15 lip 2026, 12:00");
  });

  it("formats in Europe/Warsaw winter time (UTC+1)", () => {
    expect(normalize(formatExpiry("2026-01-15T10:00:00Z"))).toBe("15 sty 2026, 11:00");
  });

  it("rolls over to the next Warsaw day near midnight UTC", () => {
    expect(normalize(formatExpiry("2026-09-28T22:30:00Z"))).toBe("29 wrz 2026, 00:30");
  });
});

describe("isShareToken", () => {
  it("accepts a 43-char base64url token", () => {
    expect(TOKEN).toHaveLength(43);
    expect(isShareToken(TOKEN)).toBe(true);
  });

  it("rejects the wrong length", () => {
    expect(isShareToken(TOKEN.slice(0, 42))).toBe(false);
    expect(isShareToken(`${TOKEN}a`)).toBe(false);
    expect(isShareToken("")).toBe(false);
  });

  it.each(["+", "/", "="])("rejects standard base64 character %s", (char) => {
    expect(isShareToken(`${TOKEN.slice(0, 42)}${char}`)).toBe(false);
  });
});
