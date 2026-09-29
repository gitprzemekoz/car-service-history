// Page-completeness oracle. Status alone passes on a blank or truncated 200, so every page assertion runs this.
// Both checks are needed: `</html>` alone passes a short page, the marker alone passes a page cut after the layout.
export function assertCompletePage(html: string): void {
  const body = html.trim();
  if (!body.endsWith("</html>")) {
    throw new Error(
      `Incomplete page: body does not end with </html> (${body.length} chars, tail: ${JSON.stringify(body.slice(-120))})`,
    );
  }
  if (!body.includes('data-testid="page-end"')) {
    throw new Error('Incomplete page: missing the data-testid="page-end" marker rendered by Layout.astro.');
  }
}

function attributeValues(html: string, pattern: RegExp): string[] {
  return Array.from(html.matchAll(pattern), (match) => match[1]);
}

/** `data-entry-id` values in document order (ServiceHistory.astro rows). */
export function entryIds(html: string): string[] {
  return attributeValues(html, /\sdata-entry-id="([^"]*)"/g);
}

/** `data-client-id` values in document order (mechanic client list rows). */
export function clientIds(html: string): string[] {
  return attributeValues(html, /\sdata-client-id="([^"]*)"/g);
}
