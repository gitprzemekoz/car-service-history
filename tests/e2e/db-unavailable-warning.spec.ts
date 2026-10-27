import { test, expect } from "@playwright/test";

// The warning targets anonymous visitors of the main page; /api/health is mocked so the
// outage is simulated without stopping the real database.
test.use({ storageState: { cookies: [], origins: [] } });

const WARNING = "db-unavailable-warning";

test("main page shows a bottom-right warning when the database is unavailable", async ({ page }) => {
  await page.route("**/api/health", (route) =>
    route.fulfill({ status: 503, json: { database: "unavailable" }, headers: { "cache-control": "no-store" } }),
  );

  await page.goto("/");

  const warning = page.getByTestId(WARNING);
  await expect(warning).toBeVisible();
  await expect(warning).toContainText("Database is unavailable");

  // Anchored to the bottom-right corner of the viewport.
  const box = await warning.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error("warning or viewport has no geometry");
  expect(box.x).toBeGreaterThan(viewport.width / 2);
  expect(box.y).toBeGreaterThan(viewport.height / 2);
});

test("main page shows no warning when the database is reachable", async ({ page }) => {
  await page.route("**/api/health", (route) => route.fulfill({ status: 200, json: { database: "ok" } }));

  const health = page.waitForResponse("**/api/health");
  await page.goto("/");
  await health;

  await expect(page.getByTestId(WARNING)).toBeHidden();
});
