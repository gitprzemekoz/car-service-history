import type { APIRoute } from "astro";
import { checkDbHealth } from "@/lib/db-health";
import { logError, safePath } from "@/lib/log-error";
import { createClient } from "@/lib/supabase";

// Polled by the main page's database warning; "unconfigured" is left to the layout banner.
export const GET: APIRoute = async (context) => {
  const { health, error } = await checkDbHealth(createClient(context.request.headers, context.cookies));

  if (health === "unavailable") {
    logError("supabase.unavailable", error, {
      route: context.routePattern,
      path: safePath(context.url.pathname),
      method: context.request.method,
      stage: "health",
    });
  }

  return Response.json(
    { database: health },
    { status: health === "unavailable" ? 503 : 200, headers: { "cache-control": "no-store" } },
  );
};
