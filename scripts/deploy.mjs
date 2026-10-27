// Production deploy: apply pending Supabase migrations, then deploy the Worker. Workers Builds runs this as its
// deploy command, so the schema always lands before code that depends on it (see context/changes/deploy-db-push).
// Usage: SUPABASE_DB_URL=<session pooler connection string> npm run deploy [-- <extra wrangler deploy args>]

import { spawnSync } from "node:child_process";

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("SUPABASE_DB_URL is not set — refusing to deploy without applying migrations first.");
  process.exit(1);
}

// The DB URL carries the database password: never print the command line.
function run(label, args) {
  console.log(`> ${label}`);
  const { status, error } = spawnSync("npx", args, { stdio: "inherit", shell: process.platform === "win32" });
  if (error || status !== 0) {
    console.error(`${label} failed${error ? `: ${error.message}` : ` with exit code ${status}`}`);
    process.exit(status || 1);
  }
}

run("supabase db push", ["supabase", "db", "push", "--db-url", dbUrl]);
run("wrangler deploy", ["wrangler", "deploy", ...process.argv.slice(2)]);
