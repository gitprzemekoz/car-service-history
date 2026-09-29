import { beforeAll, describe, expect, it } from "vitest";
import { createWorkshopPair, RUN_ID, type Actor, type WorkshopPair } from "./fixtures";

let a: WorkshopPair;
let b: WorkshopPair;

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
