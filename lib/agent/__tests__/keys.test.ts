import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
const update = vi.fn().mockResolvedValue({});
vi.mock("@/lib/db/prisma", () => ({
  prisma: { apiKey: { findUnique: (...a: unknown[]) => findUnique(...a), update: (...a: unknown[]) => update(...a) } },
}));

import {
  generateAgentKey,
  hashAgentKey,
  extractKeyFromRequest,
  requireAgentKey,
  SCOPE_DRAFT_CREATE,
} from "@/lib/agent/keys";
import { AuthzError } from "@/lib/auth/rbac";

function reqWith(headers: Record<string, string>): Request {
  return new Request("http://test/api/agent/v1/content", { method: "POST", headers });
}

describe("generateAgentKey", () => {
  it("produces an agk_-prefixed key whose hash and prefix match", () => {
    const { plaintext, keyHash, keyPrefix } = generateAgentKey();
    expect(plaintext.startsWith("agk_")).toBe(true);
    expect(plaintext.length).toBeGreaterThan(60);
    expect(keyHash).toBe(hashAgentKey(plaintext));
    expect(plaintext.startsWith(keyPrefix)).toBe(true);
    expect(keyPrefix.length).toBe(12);
  });

  it("never produces the same key twice", () => {
    expect(generateAgentKey().plaintext).not.toBe(generateAgentKey().plaintext);
  });
});

describe("extractKeyFromRequest", () => {
  it("reads Authorization: Bearer", () => {
    expect(extractKeyFromRequest(reqWith({ authorization: "Bearer agk_abc" }))).toBe("agk_abc");
  });
  it("reads x-api-key", () => {
    expect(extractKeyFromRequest(reqWith({ "x-api-key": "agk_xyz" }))).toBe("agk_xyz");
  });
  it("returns null when absent", () => {
    expect(extractKeyFromRequest(reqWith({}))).toBeNull();
  });
});

describe("requireAgentKey", () => {
  const validKey = generateAgentKey();
  const dbRow = {
    id: "11111111-1111-1111-1111-111111111111",
    name: "test-key",
    keyHash: validKey.keyHash,
    scopes: [SCOPE_DRAFT_CREATE],
    authorProfileId: null,
    createdById: "22222222-2222-2222-2222-222222222222",
    expiresAt: null,
    revokedAt: null,
  };

  beforeEach(() => {
    findUnique.mockReset();
    update.mockClear();
  });

  it("401 when no key supplied", async () => {
    await expect(requireAgentKey(reqWith({}), SCOPE_DRAFT_CREATE)).rejects.toMatchObject({ status: 401 });
  });

  it("401 when key is unknown", async () => {
    findUnique.mockResolvedValue(null);
    await expect(
      requireAgentKey(reqWith({ authorization: `Bearer ${validKey.plaintext}` }), SCOPE_DRAFT_CREATE)
    ).rejects.toMatchObject({ status: 401 });
  });

  it("401 when revoked", async () => {
    findUnique.mockResolvedValue({ ...dbRow, revokedAt: new Date() });
    await expect(
      requireAgentKey(reqWith({ authorization: `Bearer ${validKey.plaintext}` }), SCOPE_DRAFT_CREATE)
    ).rejects.toMatchObject({ status: 401 });
  });

  it("401 when expired", async () => {
    findUnique.mockResolvedValue({ ...dbRow, expiresAt: new Date(Date.now() - 1000) });
    await expect(
      requireAgentKey(reqWith({ authorization: `Bearer ${validKey.plaintext}` }), SCOPE_DRAFT_CREATE)
    ).rejects.toMatchObject({ status: 401 });
  });

  it("403 when scope is missing", async () => {
    findUnique.mockResolvedValue({ ...dbRow, scopes: ["something:else"] });
    await expect(
      requireAgentKey(reqWith({ authorization: `Bearer ${validKey.plaintext}` }), SCOPE_DRAFT_CREATE)
    ).rejects.toMatchObject({ status: 403 });
  });

  it("resolves a principal on the happy path and looks up by hash (never plaintext)", async () => {
    findUnique.mockResolvedValue(dbRow);
    const p = await requireAgentKey(
      reqWith({ authorization: `Bearer ${validKey.plaintext}` }),
      SCOPE_DRAFT_CREATE
    );
    expect(p).toMatchObject({ keyId: dbRow.id, keyName: "test-key", mintedById: dbRow.createdById });
    expect(findUnique).toHaveBeenCalledWith({ where: { keyHash: validKey.keyHash } });
    const serialized = JSON.stringify(findUnique.mock.calls);
    expect(serialized.includes(validKey.plaintext)).toBe(false);
  });

  it("throws AuthzError instances", async () => {
    findUnique.mockResolvedValue(null);
    await expect(
      requireAgentKey(reqWith({ authorization: `Bearer ${validKey.plaintext}` }), SCOPE_DRAFT_CREATE)
    ).rejects.toBeInstanceOf(AuthzError);
  });
});
