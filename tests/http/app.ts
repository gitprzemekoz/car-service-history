import { PASSWORD, type Actor } from "../db/fixtures";

const GUIDANCE =
  "Start the built app with `npm run build && npm run preview` (and local Supabase with `npx supabase start`).";

function resolveBaseUrl(): string {
  const raw = process.env.BASE_URL ?? "http://localhost:4321";
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch (cause) {
    throw new Error(`BASE_URL "${raw}" is not a valid URL.`, { cause });
  }
  // The suite seeds users and writes data; never point it at a hosted deployment.
  if (parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new Error(`HTTP tests only run against localhost or 127.0.0.1, got BASE_URL "${raw}".`);
  }
  return parsed.origin;
}

export const BASE_URL = resolveBaseUrl();

async function checkHealth(): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/`, { redirect: "manual" });
  } catch (cause) {
    throw new Error(`The app is unreachable at ${BASE_URL}. ${GUIDANCE}`, { cause });
  }
  await response.body?.cancel();
  if (response.status !== 200) {
    throw new Error(`App health check GET ${BASE_URL}/ returned ${response.status}. ${GUIDANCE}`);
  }
}

// Top-level await: a stopped preview fails the importing test file instead of timing out per case.
await checkHealth();

/** Path plus query of a redirect target, resolved against BASE_URL; "" when there is no `location`. */
export function locationOf(response: Response): string {
  const location = response.headers.get("location");
  if (!location) return "";
  const url = new URL(location, BASE_URL);
  return url.pathname + url.search;
}

interface RequestOptions {
  method?: "GET" | "POST";
  form?: Record<string, string>;
}

// Browser-like client with its own cookie jar (ported from scripts/smoke.mjs). Redirects are never followed.
export class Session {
  private readonly jar = new Map<string, string>();

  async request(path: string, { method = "GET", form }: RequestOptions = {}): Promise<Response> {
    const response = await fetch(BASE_URL + path, {
      method,
      redirect: "manual",
      headers: {
        Cookie: this.cookieHeader(),
        Origin: BASE_URL,
        // Uncompressed, so a regression that truncates the stream shows a partial body instead of 0 bytes.
        "accept-encoding": "identity",
        ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      body: form ? new URLSearchParams(form).toString() : undefined,
    });
    this.storeCookies(response);
    return response;
  }

  private cookieHeader(): string {
    return [...this.jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  private storeCookies(response: Response): void {
    for (const raw of response.headers.getSetCookie()) {
      const [pair = "", ...attrs] = raw.split(";");
      const [name = "", ...rest] = pair.split("=");
      const expired = attrs.some((attr) => /max-age=0/i.test(attr.trim()));
      if (expired) this.jar.delete(name.trim());
      else this.jar.set(name.trim(), rest.join("="));
    }
  }
}

export function anonymous(): Session {
  return new Session();
}

// Signs in through the app's own form endpoint, so the session cookies are the ones a browser would get.
export async function signInAs(actor: Actor): Promise<Session> {
  const session = new Session();
  const response = await session.request("/api/auth/signin", {
    method: "POST",
    form: { email: actor.email, password: PASSWORD },
  });
  await response.body?.cancel();
  const location = locationOf(response);
  if (response.status !== 302 || location !== "/") {
    throw new Error(`Sign-in as ${actor.email} expected 302 to "/", got ${response.status} to "${location}".`);
  }
  return session;
}
