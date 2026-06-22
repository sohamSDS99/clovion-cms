import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/**
 * Seeds the first Admin user + author profile so the system is usable
 * (invites/user management require an existing Admin). Idempotent: re-running
 * updates the password rather than creating duplicates.
 *
 * Override via env: SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME.
 */
async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@clovion.ai";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const name = process.env.SEED_ADMIN_NAME ?? "Clovion Admin";
  const passwordHash = await bcrypt.hash(password, 12);

  const profile = await prisma.authorProfile.upsert({
    where: { slug: "clovion-admin" },
    update: { displayName: name },
    create: {
      displayName: name,
      slug: "clovion-admin",
      bio: "Content operations lead.",
      isPublic: true,
    },
  });

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, status: "ACTIVE", role: "ADMIN" },
    create: {
      email,
      name,
      role: "ADMIN",
      status: "ACTIVE",
      passwordHash,
      authorProfileId: profile.id,
    },
  });

  // A couple of starter taxonomy rows so the editor has something to pick.
  await prisma.category.upsert({
    where: { slug: "product" },
    update: {},
    create: { name: "Product", slug: "product" },
  });
  await prisma.tag.upsert({
    where: { slug: "ai" },
    update: {},
    create: { name: "AI", slug: "ai" },
  });

  console.log(`Seeded admin: ${user.email} (password: ${password})`);
  console.log("⚠️  Change this password immediately in any shared environment.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
