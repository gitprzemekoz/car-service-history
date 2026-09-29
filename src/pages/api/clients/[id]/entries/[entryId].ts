import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { parseNewServiceEntry } from "@/lib/validation";

export const POST: APIRoute = async (context) => {
  const { user } = context.locals;
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const clientId = context.params.id ?? "";
  const entryId = context.params.entryId ?? "";
  const clientPage = `/dashboard/mechanic/clients/${encodeURIComponent(clientId)}`;
  const editPage = `${clientPage}/entries/${encodeURIComponent(entryId)}/edit`;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`${editPage}?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  // Middleware does not load profiles for /api/*. RLS is the real boundary;
  // this check only turns a policy violation into a readable redirect.
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "mechanic") {
    return context.redirect("/dashboard");
  }

  // RLS-scoped: another mechanic's entry, an entry of a different client, or a malformed id yields no row.
  const { data: existing } = await supabase
    .from("service_entries")
    .select("id, vehicles!inner(client_id)")
    .eq("id", entryId)
    .eq("vehicles.client_id", clientId)
    .maybeSingle();
  if (!existing) {
    return context.redirect(`/dashboard/mechanic?error=${encodeURIComponent("Entry not found")}`);
  }

  const parsed = parseNewServiceEntry(await context.request.formData(), new Date());
  if (!parsed.ok) {
    return context.redirect(`${editPage}?error=${encodeURIComponent(parsed.error)}`);
  }

  // Editable columns only: the BEFORE UPDATE trigger raises on vehicle_id / mechanic_id / created_at changes.
  const entry = parsed.data;
  const { data: updated, error } = await supabase
    .from("service_entries")
    .update({
      service_type: entry.serviceType,
      service_date: entry.serviceDate,
      mileage: entry.mileage,
      cost: entry.cost,
      notes: entry.notes ?? null,
      next_due_mileage: entry.nextDueMileage ?? null,
      next_due_date: entry.nextDueDate ?? null,
    })
    .eq("id", entryId)
    .select("id");

  if (error) {
    return context.redirect(`${editPage}?error=${encodeURIComponent(error.message)}`);
  }

  // An update blocked by RLS returns no error and 0 rows.
  if (updated.length === 0) {
    return context.redirect(`${editPage}?error=${encodeURIComponent("Entry not found")}`);
  }

  return context.redirect(clientPage);
};
