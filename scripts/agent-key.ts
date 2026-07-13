/**
 * Agent API key management CLI.
 *
 *   pnpm agent:key create --name "blog-writer" --admin admin@clovion.ai \
 *     [--author-slug some-profile | --ghost-author "Clovion Agents"] [--expires-days 365]
 *   pnpm agent:key list
 *   pnpm agent:key revoke <keyPrefix|id>
 *
 * The plaintext key is printed ONCE at create time and never stored.
 */
import { prisma } from "@/lib/db/prisma";
import { generateAgentKey, SCOPE_DRAFT_CREATE } from "@/lib/agent/keys";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function createKey() {
  const name = arg("--name");
  const adminEmail = arg("--admin");
  if (!name || !adminEmail) {
    console.error('Usage: pnpm agent:key create --name "<name>" --admin <admin-email> [--author-slug <slug> | --ghost-author "<display name>"] [--expires-days N]');
    process.exit(1);
  }
  const admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!admin || admin.role !== "ADMIN") {
    console.error(`No ADMIN user found with email ${adminEmail}.`);
    process.exit(1);
  }

  let authorProfileId: string | null = null;
  const authorSlug = arg("--author-slug");
  const ghostName = arg("--ghost-author");
  if (authorSlug) {
    const profile = await prisma.authorProfile.findUnique({ where: { slug: authorSlug } });
    if (!profile) {
      console.error(`No author profile with slug "${authorSlug}".`);
      process.exit(1);
    }
    authorProfileId = profile.id;
  } else if (ghostName) {
    const slug = ghostName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const profile = await prisma.authorProfile.upsert({
      where: { slug },
      update: {},
      create: { displayName: ghostName, slug, isGhost: true, isPublic: false, createdById: admin.id },
    });
    authorProfileId = profile.id;
    console.log(`Byline: ghost author profile "${ghostName}" (${slug})`);
  }

  const expiresDays = arg("--expires-days");
  const expiresAt = expiresDays ? new Date(Date.now() + Number(expiresDays) * 86_400_000) : null;

  const { plaintext, keyHash, keyPrefix } = generateAgentKey();
  const key = await prisma.apiKey.create({
    data: {
      name,
      keyHash,
      keyPrefix,
      scopes: [SCOPE_DRAFT_CREATE],
      authorProfileId,
      createdById: admin.id,
      expiresAt,
    },
  });

  console.log(`\nCreated API key "${name}" (${key.id})`);
  console.log(`Scopes: ${key.scopes.join(", ")}`);
  if (expiresAt) console.log(`Expires: ${expiresAt.toISOString()}`);
  console.log(`\n  ${plaintext}\n`);
  console.log("Store this key now — it will not be shown again.");
}

async function listKeys() {
  const keys = await prisma.apiKey.findMany({ orderBy: { createdAt: "desc" } });
  for (const k of keys) {
    const state = k.revokedAt ? "REVOKED" : k.expiresAt && k.expiresAt < new Date() ? "EXPIRED" : "active";
    console.log(`${k.keyPrefix}…  ${k.name}  [${state}]  scopes=${k.scopes.join(",")}  lastUsed=${k.lastUsedAt?.toISOString() ?? "never"}`);
  }
  if (keys.length === 0) console.log("No API keys.");
}

async function revokeKey() {
  const ident = process.argv[3];
  if (!ident) { console.error("Usage: pnpm agent:key revoke <keyPrefix|id>"); process.exit(1); }
  const key = await prisma.apiKey.findFirst({
    where: { OR: [{ id: ident.length === 36 ? ident : undefined }, { keyPrefix: ident }].filter(Boolean) as object[] },
  });
  if (!key) { console.error(`No key matching "${ident}".`); process.exit(1); }
  await prisma.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
  console.log(`Revoked "${key.name}" (${key.keyPrefix}…).`);
}

const cmd = process.argv[2];
const run = cmd === "create" ? createKey : cmd === "list" ? listKeys : cmd === "revoke" ? revokeKey : null;
if (!run) { console.error("Usage: pnpm agent:key <create|list|revoke>"); process.exit(1); }
run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
