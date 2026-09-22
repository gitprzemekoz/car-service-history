import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";
import type { Role } from "@/lib/types";

const PROTECTED_ROUTES = ["/dashboard", "/dashboard/mechanic"];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;

    if (user) {
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      context.locals.profile = profile ? { role: profile.role as Role } : null;
    } else {
      context.locals.profile = null;
    }
  } else {
    context.locals.user = null;
    context.locals.profile = null;
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  if (context.locals.profile?.role === "mechanic" && context.url.pathname === "/dashboard") {
    return context.redirect("/dashboard/mechanic");
  }

  if (context.locals.profile?.role === "client" && context.url.pathname === "/dashboard/mechanic") {
    return context.redirect("/dashboard");
  }

  return next();
});
