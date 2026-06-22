import NextAuth from "next-auth";

import authConfig from "./auth.config";

// Edge-safe middleware. Uses only the base config (no Prisma/bcrypt). The
// `authorized` callback in auth.config.ts decides what is gated.
export const { auth: middleware } = NextAuth(authConfig);

export default middleware((req) => {
  // Authorization is handled entirely by the `authorized` callback; when it
  // returns false for a protected path, Auth.js redirects to `pages.signIn`.
  return;
});

export const config = {
  /**
   * Run on everything except Next internals, static assets, favicon, and the
   * public/auth API surfaces. Those remain reachable without a session.
   */
  matcher: [
    "/((?!api/public|api/auth|login|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|css|js|woff2?)$).*)",
  ],
};
