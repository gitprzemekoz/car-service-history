import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";
import type { Role } from "@/lib/types";

const PROTECTED_ROUTES = ["/dashboard"];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);
  const pathname = context.url.pathname.replace(/\/+$/, "") || "/";
  const isProtected = PROTECTED_ROUTES.some((route) => pathname.startsWith(route));

  context.locals.user = null;
  context.locals.profile = null;

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;

    // Profile is only consumed by the dashboard gates below — skip the round-trip elsewhere.
    if (user && isProtected) {
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      context.locals.profile = profile ? { role: profile.role as Role } : null;
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

  return next();
});
