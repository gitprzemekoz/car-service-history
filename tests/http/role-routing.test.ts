import { beforeAll, describe, expect, it } from "vitest";
import { createWorkshopPair, RUN_ID, type WorkshopPair } from "../db/fixtures";
import { anonymous, locationOf, signInAs, type Session } from "./app";
import { assertCompletePage, clientIds, entryIds } from "./page";

// Own label, so this file's users never collide with dashboard-render.test.ts or the DB suite.
const runId = `${RUN_ID}-routing`;
const MAX_HOPS = 5;

let a: WorkshopPair;
let clientA: Session;
let mechanicA: Session;
const anon = anonymous();

beforeAll(async () => {
  a = await createWorkshopPair("a", runId);
  clientA = await signInAs(a.client);
  mechanicA = await signInAs(a.mechanic);
});

const clientPage = () => `/dashboard/mechanic/clients/${a.clientRowId}`;
const editPage = () => `${clientPage()}/entries/${a.entryId}/edit`;

async function expectRedirect(
  session: Session,
  path: string,
  target: string,
  init?: Parameters<Session["request"]>[1],
) {
  const response = await session.request(path, init);
  const body = await response.text();
  expect(response.status, `${init?.method ?? "GET"} ${path}`).toBe(302);
  expect(locationOf(response), `${init?.method ?? "GET"} ${path}`).toBe(target);
  return body;
}

async function mechanicListIds(): Promise<string[]> {
  const response = await mechanicA.request("/dashboard/mechanic");
  const html = await response.text();
  expect(response.status).toBe(200);
  assertCompletePage(html);
  return clientIds(html);
}

async function clientEntryIds(): Promise<string[]> {
  const response = await clientA.request("/dashboard");
  const html = await response.text();
  expect(response.status).toBe(200);
  assertCompletePage(html);
  return entryIds(html);
}

describe("anonymous", () => {
  for (const path of ["/dashboard", "/dashboard/mechanic"]) {
    it(`GET ${path} redirects to /auth/signin`, async () => {
      await expectRedirect(anon, path, "/auth/signin");
    });
  }
});

describe("client A on mechanic pages", () => {
  const paths: [string, () => string][] = [
    ["mechanic dashboard", () => "/dashboard/mechanic"],
    ["own clients row page", clientPage],
    ["own entry edit page", editPage],
  ];
  for (const [name, path] of paths) {
    it(`GET ${name} redirects to /dashboard without mechanic data`, async () => {
      const body = await expectRedirect(clientA, path(), "/dashboard");
      expect(body).not.toContain("data-client-id");
    });
  }
});

describe("client A on mechanic API writes", () => {
  it("POST /api/clients and POST /api/clients/<id>/entries redirect to /dashboard and write nothing", async () => {
    const clientsBefore = await mechanicListIds();

    await expectRedirect(clientA, "/api/clients", "/dashboard", {
      method: "POST",
      form: {
        name: `Intruder ${runId}`,
        email: `rls-${runId}-intruder@example.test`.toLowerCase(),
        make: "Skoda",
        model: "Octavia",
        registrationNumber: `RLS-X-${runId}`,
      },
    });
    await expectRedirect(clientA, `/api/clients/${a.clientRowId}/entries`, "/dashboard", {
      method: "POST",
      form: {
        serviceType: "Brake pads",
        serviceDate: "2026-09-01",
        mileage: "130000",
        cost: "400",
        nextDueMileage: "140000",
      },
    });

    expect(await mechanicListIds()).toEqual(clientsBefore);
    expect(await clientEntryIds()).toEqual([a.entryId]);
  });
});

describe("mechanic A", () => {
  it("GET /dashboard redirects to /dashboard/mechanic", async () => {
    await expectRedirect(mechanicA, "/dashboard", "/dashboard/mechanic");
  });
});

// Follows `location` by hand from `start` until a non-redirect, failing past MAX_HOPS.
async function follow(session: Session, start: string): Promise<{ path: string; status: number; html: string }> {
  let path = start;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const response = await session.request(path);
    const html = await response.text();
    if (response.status < 300 || response.status >= 400) return { path, status: response.status, html };
    const next = locationOf(response);
    expect(next, `redirect from ${path} has no location`).not.toBe("");
    path = next;
  }
  throw new Error(`Redirect chain from ${start} exceeded ${MAX_HOPS} hops (last: ${path})`);
}

describe("no redirect loops", () => {
  const actors: [string, () => Session, string][] = [
    ["anonymous", () => anon, "/auth/signin"],
    ["client A", () => clientA, "/dashboard"],
    ["mechanic A", () => mechanicA, "/dashboard/mechanic"],
  ];
  for (const [name, session, end] of actors) {
    for (const start of ["/dashboard", "/dashboard/mechanic"]) {
      it(`${name} from ${start} settles on a complete ${end} within ${MAX_HOPS} hops`, async () => {
        const result = await follow(session(), start);
        expect(result.status).toBe(200);
        expect(result.path).toBe(end);
        assertCompletePage(result.html);
      });
    }
  }
});
