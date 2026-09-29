import { beforeAll, describe, expect, it } from "vitest";
import { newClient, type DbClient } from "./clients";
import { createWorkshopPair, RUN_ID, type Actor, type WorkshopPair } from "./fixtures";

let a: WorkshopPair;
let b: WorkshopPair;
const anon = newClient();

beforeAll(async () => {
  // Sequential on purpose: keeps sign-ups ordered and well under the auth rate limit.
  a = await createWorkshopPair("a", RUN_ID);
  b = await createWorkshopPair("b", RUN_ID);
});

function signedInActors(): [string, Actor, "mechanic" | "client"][] {
  return [
    ["mechanic A", a.mechanic, "mechanic"],
    ["client A", a.client, "client"],
    ["mechanic B", b.mechanic, "mechanic"],
    ["client B", b.client, "client"],
  ];
}

describe("fixture sanity", () => {
  it("gives every actor the expected profiles role", async () => {
    for (const [name, actor, role] of signedInActors()) {
      const { data, error } = await actor.client
        .from("profiles")
        .select("id, role")
        .eq("id", actor.userId)
        .overrideTypes<{ id: string; role: string }[], { merge: false }>();
      expect(error, name).toBeNull();
      expect(data, name).toEqual([{ id: actor.userId, role }]);
    }
  });

  it("signs each actor in as the fixture's user", async () => {
    for (const [name, actor] of signedInActors()) {
      const { data, error } = await actor.client.auth.getUser();
      expect(error, name).toBeNull();
      expect(data.user?.id, name).toBe(actor.userId);
    }
  });

  it("returns non-null ids that differ between pairs A and B", () => {
    const ids = (pair: WorkshopPair) => [
      pair.mechanic.userId,
      pair.client.userId,
      pair.clientRowId,
      pair.vehicleId,
      pair.entryId,
      pair.shareLinkId,
    ];
    const all = [...ids(a), ...ids(b)];
    for (const id of all) expect(id).toEqual(expect.any(String));
    expect(new Set(all).size).toBe(all.length);
  });
});

// --- Visibility matrix -------------------------------------------------------
// Expected sets come from the SELECT policies in supabase/migrations/, not from running the queries.
// Actors are fresh users from this run, so leftover rows from earlier runs or the seed never match.

type PairKey = "A" | "B";
type Role = "mechanic" | "client";
type ActorKey = "anon" | `${Role} ${PairKey}`;
type Table = "profiles" | "clients" | "vehicles" | "service_entries" | "share_links" | "service_entry_revisions";

const ACTOR_KEYS: ActorKey[] = ["anon", "mechanic A", "client A", "mechanic B", "client B"];
const TABLES: Table[] = [
  "profiles",
  "clients",
  "vehicles",
  "service_entries",
  "share_links",
  "service_entry_revisions",
];

interface Cell {
  label: string;
  ids: (pair: WorkshopPair, role: Role) => string[];
}

const none: Cell = { label: "none", ids: () => [] };

// Signed-in expectations per (table, role); anon expects none everywhere (auth.uid() is null in every policy).
const EXPECTED: Record<Table, Record<Role, Cell>> = {
  // profiles_select_own: id = auth.uid(). A mechanic does not see its clients' profiles.
  profiles: {
    mechanic: { label: "own user id", ids: (p, role) => [p[role].userId] },
    client: { label: "own user id", ids: (p, role) => [p[role].userId] },
  },
  // clients_select_mechanic (mechanic_id) / clients_select_own (user_id).
  clients: {
    mechanic: { label: "own pair's clients row", ids: (p) => [p.clientRowId] },
    client: { label: "own pair's clients row", ids: (p) => [p.clientRowId] },
  },
  // vehicles_select_mechanic / vehicles_select_client, both via clients.
  vehicles: {
    mechanic: { label: "own pair's vehicle", ids: (p) => [p.vehicleId] },
    client: { label: "own pair's vehicle", ids: (p) => [p.vehicleId] },
  },
  // service_entries_select_mechanic / _client, keyed on the vehicle's client row.
  service_entries: {
    mechanic: { label: "own pair's entry", ids: (p) => [p.entryId] },
    client: { label: "own pair's entry", ids: (p) => [p.entryId] },
  },
  // share_links_select_client only; no mechanic policy, so the owning mechanic sees none by design.
  share_links: {
    mechanic: { label: "none (by design, own client's link included)", ids: () => [] },
    client: { label: "own share link", ids: (p) => [p.shareLinkId] },
  },
  // RLS on with no policies: unreachable through the API for every role.
  service_entry_revisions: { mechanic: none, client: none },
};

function pairOf(key: PairKey): WorkshopPair {
  return key === "A" ? a : b;
}

function otherPair(key: PairKey): PairKey {
  return key === "A" ? "B" : "A";
}

function parseActor(key: Exclude<ActorKey, "anon">): { role: Role; pairKey: PairKey } {
  const [role, pairKey] = key.split(" ") as [Role, PairKey];
  return { role, pairKey };
}

function cellFor(actor: ActorKey, table: Table): Cell {
  return actor === "anon" ? none : EXPECTED[table][parseActor(actor).role];
}

// Resolved lazily: pairs only exist after beforeAll, but it() names are built at collection time.
function clientOf(actor: ActorKey): DbClient {
  if (actor === "anon") return anon;
  const { role, pairKey } = parseActor(actor);
  return pairOf(pairKey)[role].client;
}

function expectedIds(actor: ActorKey, table: Table): string[] {
  if (actor === "anon") return [];
  const { role, pairKey } = parseActor(actor);
  return EXPECTED[table][role].ids(pairOf(pairKey), role);
}

// Every id of `table` that belongs to a pair, whoever may read it.
function pairIds(table: Exclude<Table, "service_entry_revisions">, pair: WorkshopPair): string[] {
  switch (table) {
    case "profiles":
      return [pair.mechanic.userId, pair.client.userId];
    case "clients":
      return [pair.clientRowId];
    case "vehicles":
      return [pair.vehicleId];
    case "service_entries":
      return [pair.entryId];
    case "share_links":
      return [pair.shareLinkId];
  }
}

const sorted = (ids: string[]) => [...ids].sort((x, y) => x.localeCompare(y));

async function readIds(actor: ActorKey, table: Table, filterIds?: string[]) {
  const query = clientOf(actor).from(table).select("id");
  const { data, error } = await (filterIds ? query.in("id", filterIds) : query).overrideTypes<
    { id: string }[],
    { merge: false }
  >();
  return { ids: data ? sorted(data.map((row) => row.id)) : null, error };
}

// Positive control: the pair's own actors read `ids` by id and together see all of them,
// each exactly its expected share. Proves the ids exist, so a later empty read means denial.
async function assertOwnersSee(table: Exclude<Table, "service_entry_revisions">, pairKey: PairKey) {
  const ids = pairIds(table, pairOf(pairKey));
  const seen = new Set<string>();
  for (const role of ["mechanic", "client"] as const) {
    const owner: ActorKey = `${role} ${pairKey}`;
    const share = expectedIds(owner, table).filter((id) => ids.includes(id));
    const { ids: got, error } = await readIds(owner, table, ids);
    expect(error, `${owner} (owner control)`).toBeNull();
    expect(got, `${owner} (owner control)`).toEqual(sorted(share));
    share.forEach((id) => seen.add(id));
  }
  expect(sorted([...seen]), `pair ${pairKey} ${table} ids visible to some owner`).toEqual(sorted(ids));
  return ids;
}

describe("visibility matrix: exact unfiltered sets", () => {
  for (const actor of ACTOR_KEYS) {
    for (const table of TABLES) {
      it(`${actor} reads ${table}: ${cellFor(actor, table).label}`, async () => {
        const { ids, error } = await readIds(actor, table);
        expect(error).toBeNull();
        expect(ids).toEqual(sorted(expectedIds(actor, table)));
      });
    }
  }
});

const FOREIGN_TABLES = ["profiles", "clients", "vehicles", "service_entries", "share_links"] as const;

// service_entry_revisions is left out: no actor can see any revision id, so there is no positive control;
// the exact-set cells above already pin it to none for everyone.
describe("visibility matrix: foreign ids return no rows", () => {
  for (const actor of ACTOR_KEYS.filter((key) => key !== "anon")) {
    const foreign = otherPair(parseActor(actor).pairKey);
    for (const table of FOREIGN_TABLES) {
      it(`${actor} reads pair ${foreign} ${table} by id: none`, async () => {
        const foreignIds = await assertOwnersSee(table, foreign);
        const { ids, error } = await readIds(actor, table, foreignIds);
        expect(error).toBeNull();
        expect(ids).toEqual([]);
      });
    }
  }

  for (const table of FOREIGN_TABLES) {
    it(`anon reads pairs A and B ${table} by id: none`, async () => {
      const foreignIds = [...(await assertOwnersSee(table, "A")), ...(await assertOwnersSee(table, "B"))];
      const { ids, error } = await readIds("anon", table, foreignIds);
      expect(error).toBeNull();
      expect(ids).toEqual([]);
    });
  }
});
