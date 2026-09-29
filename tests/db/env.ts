import { existsSync } from "node:fs";

// Anon key only. The service-role key is deliberately absent from tests/db/.
const GUIDANCE =
  "Start local Supabase with `npx supabase start` and set SUPABASE_URL and SUPABASE_KEY (the anon key) in .env or the environment.";

async function loadDbEnv(): Promise<{ url: string; anonKey: string }> {
  // loadEnvFile does not overwrite variables already set in the environment.
  if (existsSync(".env")) process.loadEnvFile(".env");

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_KEY;
  if (!url || !anonKey) {
    throw new Error(`DB tests need SUPABASE_URL and SUPABASE_KEY. ${GUIDANCE}`);
  }

  let response: Response;
  try {
    response = await fetch(`${url}/auth/v1/health`, { headers: { apikey: anonKey } });
  } catch (cause) {
    throw new Error(`Supabase is unreachable at ${url}. ${GUIDANCE}`, { cause });
  }
  if (!response.ok) {
    throw new Error(`Supabase auth health check at ${url} returned ${response.status}. ${GUIDANCE}`);
  }

  return { url, anonKey };
}

// Top-level await: a missing env or a stopped stack fails the importing test file instead of skipping it.
export const { url, anonKey } = await loadDbEnv();
