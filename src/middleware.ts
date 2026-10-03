import { defineMiddleware } from "astro:middleware";
import { bufferHtmlResponse } from "@/lib/buffer-html";
import { logError, logWarn, safePath, type LogContext } from "@/lib/log-error";
import { serviceUnavailableResponse } from "@/lib/service-unavailable";
import { classifyAuth, classifyProfile } from "@/lib/session-state";
import { createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = ["/dashboard"];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);
  const pathname = context.url.pathname.replace(/\/+$/, "") || "/";
  const isProtected = PROTECTED_ROUTES.some((route) => pathname.startsWith(route));

  // Never log the query string: `?error=` can carry raw DB messages.
  const ctx: LogContext = {
    route: context.routePattern || undefined,
    path: safePath(pathname),
    method: context.request.method,
  };

  context.locals.user = null;
  context.locals.profile = null;

  if (supabase) {
    const { data, error } = await supabase.auth.getUser();
    const auth = classifyAuth({ user: data.user, error });

    if (auth.kind === "unavailable") {
      logError("supabase.unavailable", auth.error, { ...ctx, stage: "auth.getUser" });
      // An outage is not a sign-out — answer 503 rather than a misleading redirect to sign-in.
      if (isProtected) return serviceUnavailableResponse();
    }

    const user = auth.kind === "signed-in" ? auth.user : null;
    context.locals.user = user;
    if (user) ctx.userId = user.id;

    // Profile is only consumed by the dashboard gates below — skip the round-trip elsewhere.
    if (user && isProtected) {
      const profile = classifyProfile(await supabase.from("profiles").select("role").eq("id", user.id).single());

      if (profile.kind === "unavailable") {
        logError("supabase.unavailable", profile.error, { ...ctx, stage: "profiles.select" });
        return serviceUnavailableResponse();
      }
      if (profile.kind === "missing") {
        logWarn("profile.missing", { ...ctx, userId: user.id });
      }
      context.locals.profile = profile.kind === "found" ? { role: profile.role } : null;
    }
  }

  if (isProtected && !context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const role = context.locals.profile?.role;

  if (role === "mechanic" && pathname === "/dashboard") {
    return context.redirect("/dashboard/mechanic");
  }

  // Fail closed: a missing or failed profile lookup must not reach the mechanic dashboard.
  if (role !== "mechanic" && pathname.startsWith("/dashboard/mechanic")) {
    return context.redirect("/dashboard");
  }

  // Buffer HTML so a mid-render throw becomes a logged 500, not a blank 200 (see f763bdb).
  try {
    return await bufferHtmlResponse(await next());
  } catch (err) {
    // Rethrow so Astro still renders 500.astro (which re-enters this middleware).
    logError("render.failed", err, ctx);
    throw err;
  }
});
