import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import {
  errorResponse,
  ValidationError,
  NotFoundError,
  ConflictError,
  BadRequestError,
  AuthzError,
} from "@/lib/api/http";

const prismaErr = (code: string) =>
  new Prisma.PrismaClientKnownRequestError(`prisma ${code}`, {
    code,
    clientVersion: "6.x",
  });

describe("errorResponse status mapping", () => {
  it("maps known app errors to their status", () => {
    expect(errorResponse(new AuthzError("nope", 401)).status).toBe(401);
    expect(errorResponse(new AuthzError("denied", 403)).status).toBe(403);
    expect(errorResponse(new ValidationError("bad")).status).toBe(422);
    expect(errorResponse(new NotFoundError()).status).toBe(404);
    expect(errorResponse(new ConflictError("conflict")).status).toBe(409);
    expect(errorResponse(new BadRequestError()).status).toBe(400);
  });

  it("maps Prisma known-request errors to clean statuses (not 500)", () => {
    // P2023 = inconsistent column data (e.g. malformed UUID path param)
    expect(errorResponse(prismaErr("P2023")).status).toBe(400);
    // P2025 = required record not found
    expect(errorResponse(prismaErr("P2025")).status).toBe(404);
    // P2002 = unique constraint violation
    expect(errorResponse(prismaErr("P2002")).status).toBe(409);
  });

  it("falls back to 500 for genuinely unexpected errors", () => {
    expect(errorResponse(new Error("boom")).status).toBe(500);
    expect(errorResponse(prismaErr("P1234")).status).toBe(500);
  });
});
