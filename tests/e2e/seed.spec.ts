import { test, expect } from "@playwright/test";

// Protects test-plan.md risk #1 (browser view): a logged-in mechanic gets a blank page
// although the dashboard should render — no error, no alert.
// Creates no data, so there is nothing to clean up.
test("signed-in mechanic sees their dashboard rendered, not a blank page", async ({ page }) => {
  await page.goto("/dashboard");

  // The role gate sends a mechanic on to their own dashboard.
  await page.waitForURL("/dashboard/mechanic");
  await expect(page.getByRole("heading", { level: 1, name: "Mechanic Dashboard" })).toBeVisible();
  // Rendered from the signed-in user's data, so a page without the session data fails here.
  await expect(page.getByText(`Signed in as ${process.env.E2E_USERNAME}`)).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Clients" })).toBeVisible();
});
