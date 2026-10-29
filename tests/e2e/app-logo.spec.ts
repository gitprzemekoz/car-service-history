import { test, expect } from "@playwright/test";

// The logo is rendered by the shared layout, so it must show up for anonymous visitors too.
test.use({ storageState: { cookies: [], origins: [] } });

test("app logo is shown in the layout on every page", async ({ page }) => {
  for (const path of ["/", "/auth/signin"]) {
    await page.goto(path);
    await expect(page.getByTestId("app-logo")).toBeVisible();
  }
});

test("clicking the app logo goes to the home page", async ({ page }) => {
  await page.goto("/auth/signin");

  await page.getByTestId("app-logo").click();

  await expect(page).toHaveURL(/\/$/);
});
