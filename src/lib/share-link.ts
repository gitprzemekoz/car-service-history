import type { ShareLink } from "@/lib/types";

// expires_at is a real instant; the Cloudflare runtime runs in UTC, so the zone must be explicit.
const expiryFormat = new Intl.DateTimeFormat("pl-PL", {
  timeZone: "Europe/Warsaw",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

// 32 random bytes as base64url without padding (see create_share_link()).
const SHARE_TOKEN = /^[A-Za-z0-9_-]{43}$/;

// An expired row is treated exactly like no link.
export function isActive(link: Pick<ShareLink, "expires_at"> | null, now: Date): boolean {
  return link !== null && new Date(link.expires_at).getTime() > now.getTime();
}

export function shareUrl(origin: string, token: string): string {
  return `${origin}/share/${token}`;
}

export function formatExpiry(iso: string): string {
  return expiryFormat.format(new Date(iso));
}

export function isShareToken(value: string): boolean {
  return SHARE_TOKEN.test(value);
}
