import type { Role } from "@/lib/types";

declare global {
  namespace App {
    interface Locals {
      user: import("@supabase/supabase-js").User | null;
      profile: { role: Role } | null;
    }
  }
}
