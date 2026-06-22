/**
 * Typed fetch wrapper for the admin UI.
 *
 * Every API route returns JSON; errors come back as
 *   { error: { message, code, details? } }
 * with the proper HTTP status. `ApiError` surfaces all three so callers can
 * branch on `code`/`status` (e.g. the 422 publish gate carries
 * `details.errors[]`, a 409 in-use delete carries `details.references[]`).
 */

export interface ApiErrorEnvelope {
  message: string;
  code: string;
  details?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, envelope: ApiErrorEnvelope) {
    super(envelope.message);
    this.name = "ApiError";
    this.status = status;
    this.code = envelope.code;
    this.details = envelope.details;
  }
}

type Json = Record<string, unknown> | unknown[];

interface RequestOptions {
  /** JSON body — serialized automatically. Omit for GET/DELETE. */
  body?: Json;
  /** Raw body (e.g. FormData) used as-is; skips JSON content-type. */
  raw?: BodyInit;
  signal?: AbortSignal;
  query?: Record<string, string | number | boolean | undefined | null>;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

async function request<T>(
  method: string,
  path: string,
  opts: RequestOptions = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;

  if (opts.raw !== undefined) {
    body = opts.raw; // FormData sets its own content-type/boundary.
  } else if (opts.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  const res = await fetch(buildUrl(path, opts.query), {
    method,
    headers,
    body,
    credentials: "same-origin",
    signal: opts.signal,
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const envelope: ApiErrorEnvelope =
      data?.error ?? { message: res.statusText, code: "unknown" };
    throw new ApiError(res.status, envelope);
  }

  return data as T;
}

export const api = {
  get: <T>(path: string, query?: RequestOptions["query"], signal?: AbortSignal) =>
    request<T>("GET", path, { query, signal }),
  post: <T>(path: string, body?: Json, signal?: AbortSignal) =>
    request<T>("POST", path, { body, signal }),
  patch: <T>(path: string, body?: Json, signal?: AbortSignal) =>
    request<T>("PATCH", path, { body, signal }),
  put: <T>(path: string, body?: Json, signal?: AbortSignal) =>
    request<T>("PUT", path, { body, signal }),
  delete: <T>(path: string, signal?: AbortSignal) =>
    request<T>("DELETE", path, { signal }),
  /** Multipart upload (FormData). */
  upload: <T>(path: string, form: FormData, signal?: AbortSignal) =>
    request<T>("POST", path, { raw: form, signal }),
};

/** Convenience: extract a readable message from any thrown value. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}
