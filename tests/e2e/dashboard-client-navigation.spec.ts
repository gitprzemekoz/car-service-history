import { test, expect } from "@playwright/test";
import { createWorkshopPair, PASSWORD, RUN_ID } from "../db/fixtures";

// risk: test-plan.md #1 — facet E3: a mechanic clicks a client on their dashboard and the
// client page shows that client's existing service entry, not a blank or empty page.
// Server-side render of the same page is covered by tests/http/dashboard-render.test.ts;
// the mechanic-dashboard landing is covered by seed.spec.ts.
// Data: createWorkshopPair signs up fresh users per run (2 sign-ups + 1 sign-in toward the
// local auth limit). The schema has no DELETE policies for clients, vehicles or entries, so
// rows stay until `npx supabase db reset` (test-plan.md §6.6); unique run ids keep runs apart.

// Start signed out: this test signs in as its own fixture mechanic, not the shared E2E account.
test.use({ storageState: { cookies: [], origins: [] } });

test("mechanic opening a client from the dashboard sees the client's existing service entry", async ({
  page,
  baseURL,
}) => {
  if (!baseURL) throw new Error("baseURL is not set in playwright.config.ts");
  const runId = `${RUN_ID}-e2e-nav`;
  test.info().annotations.push({ type: "test-data", description: runId });
  const pair = await createWorkshopPair("a", runId);
  const clientName = `Client A ${runId}`;

  // Sign in through the app's form endpoint, without the UI; the cookies land in this page's context.
  const signIn = await page.request.post("/api/auth/signin", {
    form: { email: pair.mechanic.email, password: PASSWORD },
    headers: { Origin: new URL(baseURL).origin },
    maxRedirects: 0,
  });
  expect(signIn.status()).toBe(302);

  // The mechanic opens their dashboard and finds the client in the list.
  await page.goto("/dashboard");
  await page.waitForURL("/dashboard/mechanic");
  const clientLink = page.getByRole("link", { name: clientName });
  await expect(clientLink).toBeVisible();

  // Clicking the client opens that client's page.
  await clientLink.click();
  await page.waitForURL(`/dashboard/mechanic/clients/${pair.clientRowId}`);
  await expect(page.getByRole("heading", { level: 1, name: clientName })).toBeVisible();

  // The seeded entry is on screen: service type and date inside the service history.
  await expect(page.getByRole("heading", { level: 2, name: "Service history" })).toBeVisible();
  const entry = page.getByTestId("service-entry");
  await expect(entry).toHaveCount(1);
  await expect(entry).toHaveAttribute("data-entry-id", pair.entryId);
  await expect(entry.getByText("Oil change", { exact: true })).toBeVisible();
  await expect(entry.getByText("1 wrz 2026")).toBeVisible();
});
