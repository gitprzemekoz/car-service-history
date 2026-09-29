import { beforeAll, describe, expect, it } from "vitest";
import { createWorkshopPair, RUN_ID, type WorkshopPair } from "../db/fixtures";
import { signInAs, type Session } from "./app";
import { assertCompletePage, clientIds, entryIds } from "./page";

// Own label, so this file's users never collide with role-routing.test.ts or the DB suite.
const runId = `${RUN_ID}-render`;

let a: WorkshopPair;
let b: WorkshopPair;
let clientA: Session;
let mechanicA: Session;

beforeAll(async () => {
  // Sequential on purpose: keeps sign-ups and sign-ins ordered and well under the auth rate limit.
  a = await createWorkshopPair("a", runId);
  b = await createWorkshopPair("b", runId);
  clientA = await signInAs(a.client);
  mechanicA = await signInAs(a.mechanic);
});

const registration = (label: "A" | "B") => `RLS-${label}-${runId}`;
const clientPage = (pair: WorkshopPair) => `/dashboard/mechanic/clients/${pair.clientRowId}`;
const editPage = (pair: WorkshopPair) => `${clientPage(pair)}/entries/${pair.entryId}/edit`;

async function getPage(session: Session, path: string): Promise<{ status: number; html: string }> {
  const response = await session.request(path);
  return { status: response.status, html: await response.text() };
}

function serviceTypes(html: string): string[] {
  return Array.from(html.matchAll(/data-testid="service-type"[^>]*>\s*([^<]*?)\s*</g), (match) => match[1]);
}

// The value attribute of the named <input>; its placeholder is also "Oil change", so body-contains would not do.
function inputValue(html: string, name: string): string | undefined {
  const tag = new RegExp(`<input\\b[^>]*\\bname="${name}"[^>]*>`).exec(html)?.[0];
  return tag ? /\svalue="([^"]*)"/.exec(tag)?.[1] : undefined;
}

describe("client dashboard", () => {
  it("renders exactly the client's own seeded entry", async () => {
    const { status, html } = await getPage(clientA, "/dashboard");
    expect(status).toBe(200);
    assertCompletePage(html);
    expect(entryIds(html)).toEqual([a.entryId]);
    expect(serviceTypes(html)).toEqual(["Oil change"]);
    expect(html).toContain(registration("A"));
    expect(html).not.toContain(b.entryId);
    expect(html).not.toContain(registration("B"));
    expect(html).not.toContain('role="alert"');
  });
});

describe("mechanic dashboard", () => {
  it("lists the mechanic's own client and not the other pair's", async () => {
    const { status, html } = await getPage(mechanicA, "/dashboard/mechanic");
    expect(status).toBe(200);
    assertCompletePage(html);
    const ids = clientIds(html);
    expect(ids).toContain(a.clientRowId);
    expect(ids).not.toContain(b.clientRowId);
  });

  it("renders the own client's page with its entry and Edit link", async () => {
    const { status, html } = await getPage(mechanicA, clientPage(a));
    expect(status).toBe(200);
    assertCompletePage(html);
    expect(entryIds(html)).toEqual([a.entryId]);
    expect(html).toContain(`href="${editPage(a)}"`);
  });

  it("returns a complete 404 for the other pair's client (RLS miss)", async () => {
    const { status, html } = await getPage(mechanicA, clientPage(b));
    expect(status).toBe(404);
    assertCompletePage(html);
  });

  it("renders the edit form prefilled with the seeded entry", async () => {
    const { status, html } = await getPage(mechanicA, editPage(a));
    expect(status).toBe(200);
    assertCompletePage(html);
    expect(inputValue(html, "serviceType")).toBe("Oil change");
  });
});
