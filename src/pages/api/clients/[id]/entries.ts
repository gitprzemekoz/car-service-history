import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { parseNewServiceEntry } from "@/lib/validation";

export const POST: APIRoute = async (context) => {
  const { user } = context.locals;
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const clientId = context.params.id ?? "";
  const clientPage = `/dashboard/mechanic/clients/${encodeURIComponent(clientId)}`;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`${clientPage}?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  // Middleware does not load profiles for /api/*. RLS is the real boundary;
  // this check only turns a policy violation into a readable redirect.
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "mechanic") {
    return context.redirect("/dashboard");
  }

  // RLS-scoped: another mechanic's client (or a malformed id) yields no row.
  const { data: vehicle } = await supabase.from("vehicles").select("id").eq("client_id", clientId).maybeSingle();
  if (!vehicle) {
    return context.redirect(`/dashboard/mechanic?error=${encodeURIComponent("Client not found")}`);
  }

  const parsed = parseNewServiceEntry(await context.request.formData(), new Date());
  if (!parsed.ok) {
    return context.redirect(`${clientPage}?error=${encodeURIComponent(parsed.error)}`);
  }

  const entry = parsed.data;
  const { error } = await supabase.from("service_entries").insert({
    vehicle_id: vehicle.id,
    mechanic_id: user.id,
    service_type: entry.serviceType,
    service_date: entry.serviceDate,
    mileage: entry.mileage,
    cost: entry.cost,
    notes: entry.notes ?? null,
    next_due_mileage: entry.nextDueMileage ?? null,
    next_due_date: entry.nextDueDate ?? null,
  });

  if (error) {
    return context.redirect(`${clientPage}?error=${encodeURIComponent(error.message)}`);
  }

  return context.redirect(clientPage);
};
