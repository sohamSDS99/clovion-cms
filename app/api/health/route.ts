/**
 * Liveness/readiness probe for the platform (Railway healthcheck).
 * Public (no auth). Returns 200 when the server is up; includes a best-effort
 * DB check that never fails the probe on a transient blip.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let db = "unknown";
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = "ok";
  } catch {
    db = "error";
  }
  return NextResponse.json({ status: "ok", db, ts: new Date().toISOString() });
}
