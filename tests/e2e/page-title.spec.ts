import { test, expect } from "@playwright/test";

// The home page relies on the layout's default title.
test.use({ storageState: { cookies: [], origins: [] } });

test("home page uses the app name as its title", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Car Service History");
});
