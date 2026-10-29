import { test, expect } from "@playwright/test";

// The favicon links live in the shared layout, so anonymous visitors get them too.
test.use({ storageState: { cookies: [], origins: [] } });

test("layout links the SVG favicon with a PNG fallback, and both are served", async ({ page, request }) => {
  await page.goto("/");

  const icons = [
    { href: "/favicon.svg", type: "image/svg+xml" },
    { href: "/favicon.png", type: "image/png" },
  ];

  for (const { href, type } of icons) {
    await expect(page.locator(`link[rel="icon"][type="${type}"][href="${href}"]`)).toHaveCount(1);

    const response = await request.get(href);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain(type);
  }
});
