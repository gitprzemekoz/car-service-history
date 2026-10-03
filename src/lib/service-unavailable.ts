// Static on purpose: returned during a Supabase outage, so it must not depend on Supabase,
// layouts or external assets — nothing here can fail.
const BODY = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Service unavailable</title>
</head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;padding:16px;box-sizing:border-box">
<main style="max-width:24rem;text-align:center">
<h1 style="font-size:1.5rem;margin:0 0 0.75rem">Service temporarily unavailable</h1>
<p role="alert" style="margin:0 0 1.5rem;color:#475569">We can't load this page right now. Please try again in a moment.</p>
<a href="/" style="color:#2563eb">Go to home page</a>
</main>
</body>
</html>`;

export function serviceUnavailableResponse(): Response {
  return new Response(BODY, {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "retry-after": "30",
    },
  });
}
