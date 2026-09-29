/**
 * Reads an HTML response fully and returns an equivalent non-streamed Response.
 * A body stream error rejects, so the caller (middleware) surfaces it as a 500
 * instead of a 200 with a truncated body. Non-HTML or bodyless responses are
 * returned unchanged.
 */
export async function bufferHtmlResponse(response: Response): Promise<Response> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("text/html") || response.body === null) {
    return response;
  }

  const body = await response.text();
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
