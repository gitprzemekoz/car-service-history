export interface SerializedError {
  name: string;
  message: string;
  code?: string;
  status?: number;
  details?: string;
  hint?: string;
  stack?: string;
  cause?: SerializedError;
}

export interface LogContext {
  route?: string;
  path?: string;
  method?: string;
  userId?: string;
  stage?: string;
  [key: string]: string | number | undefined;
}

// Guards against cyclic or runaway cause chains bloating a single log line.
const MAX_CAUSE_DEPTH = 3;

function serializeAt(err: unknown, depth: number): SerializedError {
  if (typeof err !== "object" || err === null || !("message" in err) || typeof err.message !== "string") {
    return { name: "NonError", message: String(err) };
  }

  // Covers Error subclasses (AuthError, PostgrestError) and PostgREST-style plain objects alike.
  const source = err as Record<string, unknown>;
  const serialized: SerializedError = {
    name: typeof source.name === "string" ? source.name : "Error",
    message: err.message,
  };
  if (typeof source.code === "string") serialized.code = source.code;
  if (typeof source.status === "number") serialized.status = source.status;
  if (typeof source.details === "string") serialized.details = source.details;
  if (typeof source.hint === "string") serialized.hint = source.hint;
  if (typeof source.stack === "string") serialized.stack = source.stack;
  if (source.cause !== undefined && depth < MAX_CAUSE_DEPTH) {
    serialized.cause = serializeAt(source.cause, depth + 1);
  }
  return serialized;
}

export function serializeError(err: unknown): SerializedError {
  return serializeAt(err, 0);
}

// Share tokens grant read access to a vehicle's history, so they must never reach logs.
export function safePath(pathname: string): string {
  return pathname.replace(/^\/share\/[^/]+/, "/share/***");
}

export function logError(event: string, err: unknown, context?: LogContext): void {
  // eslint-disable-next-line no-console -- single sanctioned log sink for src/
  console.error(JSON.stringify({ level: "error", event, ...context, error: serializeError(err) }));
}

export function logWarn(event: string, context?: LogContext, err?: unknown): void {
  const error = err === undefined ? undefined : serializeError(err);
  // eslint-disable-next-line no-console -- single sanctioned log sink for src/
  console.warn(JSON.stringify({ level: "warn", event, ...context, error }));
}
