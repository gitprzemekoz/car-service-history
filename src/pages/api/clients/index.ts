import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { parseNewClient } from "@/lib/validation";

const UNIQUE_VIOLATION = "23505";

export const POST: APIRoute = async (context) => {
  const { user } = context.locals;
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/dashboard/mechanic?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  // Middleware does not load profiles for /api/*. RLS is the real boundary;
  // this check only turns a policy violation into a readable redirect.
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "mechanic") {
    return context.redirect("/dashboard");
  }

  const parsed = parseNewClient(await context.request.formData());
  if (!parsed.ok) {
    return context.redirect(`/dashboard/mechanic?error=${encodeURIComponent(parsed.error)}`);
  }

  const { name, email, make, model, registrationNumber } = parsed.data;
  const result = await supabase.rpc("create_client_with_vehicle", {
    p_name: name,
    p_email: email,
    p_make: make,
    p_model: model,
    p_registration_number: registrationNumber,
  });

  if (result.error) {
    const { code, message: dbMessage } = result.error;
    const message = code === UNIQUE_VIOLATION ? "A client with this email already exists" : dbMessage;
    return context.redirect(`/dashboard/mechanic?error=${encodeURIComponent(message)}`);
  }

  // Untyped client (no generated Database types): the RPC returns the new clients.id.
  const clientId = result.data as string;
  return context.redirect(`/dashboard/mechanic/clients/${clientId}`);
};
