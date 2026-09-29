import { newClient, type DbClient } from "./clients";

export interface Actor {
  client: DbClient;
  userId: string;
}

export interface WorkshopPair {
  mechanic: Actor;
  client: Actor;
  clientRowId: string;
  vehicleId: string;
  entryId: string;
  shareLinkId: string;
}

const PASSWORD = "Rls-Test-Passw0rd!";

// Unique per process, so repeated runs on the same local DB never collide on emails.
export const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function fail(step: string, error: { message: string }): never {
  throw new Error(`Fixture step "${step}" failed: ${error.message}`);
}

async function signUp(email: string): Promise<Actor> {
  const client = newClient();
  const { data, error } = await client.auth.signUp({ email, password: PASSWORD });
  if (error) fail(`sign up ${email}`, error);
  if (!data.user || !data.session) fail(`sign up ${email}`, { message: "no user or session returned" });
  return { client, userId: data.user.id };
}

// Builds one mechanic + client pair entirely through the anon key under RLS.
// Order matters: the clients row must exist before the client signs up, or handle_new_user() makes them a mechanic.
export async function createWorkshopPair(label: "a" | "b", runId: string): Promise<WorkshopPair> {
  const prefix = `rls-${runId}-${label}`.toLowerCase();
  const clientEmail = `${prefix}-client@example.test`;

  // 1. Mechanic signs up (no pending clients row -> role mechanic).
  const mechanic = await signUp(`${prefix}-mechanic@example.test`);

  // 2. Mechanic creates the client row and its vehicle.
  const created = await mechanic.client.rpc("create_client_with_vehicle", {
    p_name: `Client ${label.toUpperCase()} ${runId}`,
    p_email: clientEmail,
    p_make: "Toyota",
    p_model: "Corolla",
    p_registration_number: `RLS-${label.toUpperCase()}-${runId}`,
  });
  if (created.error) fail("create_client_with_vehicle", created.error);
  const clientRowId = created.data as string;

  // 3. Mechanic reads its vehicle id.
  const vehicle = await mechanic.client
    .from("vehicles")
    .select("id")
    .eq("client_id", clientRowId)
    .single<{ id: string }>();
  if (vehicle.error) fail("select vehicle", vehicle.error);
  const vehicleId = vehicle.data.id;

  // 4. Client signs up with the pending email (-> role client, clients row claimed).
  const client = await signUp(clientEmail);

  // 5. Mechanic records one service entry.
  const entry = await mechanic.client
    .from("service_entries")
    .insert({
      mechanic_id: mechanic.userId,
      vehicle_id: vehicleId,
      service_type: "Oil change",
      service_date: "2026-09-01",
      mileage: 120000,
      cost: 250,
    })
    .select("id")
    .single<{ id: string }>();
  if (entry.error) fail("insert service entry", entry.error);
  const entryId = entry.data.id;

  // 6. Mechanic edits the entry. A non-null updated_at shows the edit trigger ran (it also writes the revision).
  const edited = await mechanic.client
    .from("service_entries")
    .update({ notes: `Edited in run ${runId}` })
    .eq("id", entryId)
    .select("id, updated_at")
    .overrideTypes<{ id: string; updated_at: string | null }[], { merge: false }>();
  if (edited.error) fail("update service entry", edited.error);
  if (edited.data.length !== 1 || edited.data[0]?.updated_at == null) {
    fail("update service entry", {
      message: `expected one row with non-null updated_at, got ${JSON.stringify(edited.data)}`,
    });
  }

  // 7. Client publishes a share link.
  const link = await client.client.rpc("create_share_link");
  if (link.error) fail("create_share_link", link.error);

  // 8. Client reads its share link id.
  const shareLink = await client.client
    .from("share_links")
    .select("id")
    .eq("vehicle_id", vehicleId)
    .single<{ id: string }>();
  if (shareLink.error) fail("select share link", shareLink.error);
  const shareLinkId = shareLink.data.id;

  return { mechanic, client, clientRowId, vehicleId, entryId, shareLinkId };
}
