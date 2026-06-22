/**
 * Shared HTTP plumbing for all API routes.
 *
 * Provides a small error taxonomy, a uniform error -> HTTP mapping, JSON
 * response helpers, a `withRoute` wrapper that catches errors, and zod
 * body/query parsers. Every route handler should go through `withRoute` so
 * error shapes and status codes stay consistent across the API.
 */
import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";
import { AuthzError } from "@/lib/auth/rbac";

export { AuthzError };

/** 422 — request body/params failed validation. */
export class ValidationError extends Error {
  status = 422 as const;
  details?: unknown;
  constructor(message: string, details?: unknown) {
    super(message);
    this.name = "ValidationError";
    this.details = details;
  }
}

/** 404 — entity not found (or soft-deleted). */
export class NotFoundError extends Error {
  status = 404 as const;
  constructor(message = "Not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}

/** 409 — request conflicts with current state (e.g. illegal lifecycle move). */
export class ConflictError extends Error {
  status = 409 as const;
  details?: unknown;
  constructor(message: string, details?: unknown) {
    super(message);
    this.name = "ConflictError";
    this.details = details;
  }
}

/** 400 — malformed request that isn't a field-validation issue. */
export class BadRequestError extends Error {
  status = 400 as const;
  constructor(message = "Bad request.") {
    super(message);
    this.name = "BadRequestError";
  }
}

type KnownError =
  | AuthzError
  | ValidationError
  | NotFoundError
  | ConflictError
  | BadRequestError;

function isKnownError(e: unknown): e is KnownError {
  return (
    e instanceof AuthzError ||
    e instanceof ValidationError ||
    e instanceof NotFoundError ||
    e instanceof ConflictError ||
    e instanceof BadRequestError
  );
}

/** JSON success response. */
export function json<T>(data: T, init?: number | ResponseInit): NextResponse {
  const responseInit = typeof init === "number" ? { status: init } : init;
  return NextResponse.json(data as object, responseInit);
}

export const created = <T>(data: T) => json(data, 201);
export const noContent = () => new NextResponse(null, { status: 204 });

/** Maps any thrown value to a consistent JSON error response. */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return json(
      { error: { message: "Validation failed.", code: "validation_error", details: error.flatten() } },
      422
    );
  }
  if (isKnownError(error)) {
    const details = "details" in error ? error.details : undefined;
    return json(
      {
        error: {
          message: error.message,
          code: error.name
            .replace(/Error$/, "")
            .replace(/([a-z])([A-Z])/g, "$1_$2")
            .toLowerCase(),
          ...(details ? { details } : {}),
        },
      },
      error.status
    );
  }
  // Unknown / unexpected — don't leak internals.
  console.error("[api] unhandled error:", error);
  return json({ error: { message: "Internal server error.", code: "internal_error" } }, 500);
}

/**
 * Wraps a route handler so thrown errors become uniform responses.
 * Usage: `export const GET = withRoute(async (req) => { ... return json(x) })`
 */
export function withRoute<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/** Parse + validate a JSON request body; throws ValidationError on failure. */
export async function parseBody<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new BadRequestError("Request body must be valid JSON.");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError("Validation failed.", result.error.flatten());
  }
  return result.data;
}

/** Parse + validate URLSearchParams; throws ValidationError on failure. */
export function parseQuery<T>(searchParams: URLSearchParams, schema: ZodSchema<T>): T {
  const obj = Object.fromEntries(searchParams.entries());
  const result = schema.safeParse(obj);
  if (!result.success) {
    throw new ValidationError("Invalid query parameters.", result.error.flatten());
  }
  return result.data;
}
