import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";

/**
 * Edge-safe base Auth.js config.
 *
 * IMPORTANT: this file must never import Prisma, bcrypt, or the adapter so it
 * can be bundled into the edge middleware. Node-only providers (Credentials)
 * and the adapter are layered on in auth.ts.
 */

const oauthProviders: NextAuthConfig["providers"] = [];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  oauthProviders.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    })
  );
}

if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) {
  oauthProviders.push(
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
    })
  );
}

/** Path prefixes that never require authentication. */
const PUBLIC_PREFIXES = ["/login", "/api/auth", "/api/public"];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true;
  }
  // Next internals + common static assets.
  if (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/static")
  ) {
    return true;
  }
  return false;
}

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  // OAuth providers only here (edge-safe). Credentials is added in auth.ts.
  providers: oauthProviders,
  callbacks: {
    /**
     * Used by middleware to gate routes. Edge-safe: only reads auth + URL.
     */
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      // API routes authorize themselves in-handler (requireUser /
      // requireCapability) and must return JSON 401/403 — never an HTML login
      // redirect. Let them through the edge gate. (Headless CMS: FR-USER-03.)
      if (pathname.startsWith("/api/")) return true;
      if (isPublicPath(pathname)) return true;
      return !!auth?.user;
    },

    /**
     * On sign-in, copy our custom fields off the user record onto the token.
     * On subsequent calls `user` is undefined and the token is returned as-is.
     */
    jwt({ token, user }) {
      if (user) {
        token.id = user.id ?? token.id;
        token.role = user.role;
        token.status = user.status;
        token.authorProfileId = user.authorProfileId ?? null;
      }
      return token;
    },

    /**
     * Expose the custom token fields on session.user.
     *
     * The reads off `token` are cast against the augmented `session.user`
     * field types: next-auth beta pulls two @auth/core versions, so the
     * `next-auth/jwt` augmentation does not always merge onto the JWT type
     * seen here. The casts keep the values strongly typed at the session.
     */
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as typeof session.user.id;
        session.user.role = token.role as typeof session.user.role;
        session.user.status = token.status as typeof session.user.status;
        session.user.authorProfileId =
          (token.authorProfileId as string | null | undefined) ?? null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

export default authConfig;
