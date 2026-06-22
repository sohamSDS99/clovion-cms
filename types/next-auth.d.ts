import type { DefaultSession } from "next-auth";

type AppRole = "ADMIN" | "EDITOR" | "AUTHOR" | "CONTRIBUTOR" | "VIEWER";
type AppUserStatus = "INVITED" | "ACTIVE" | "SUSPENDED";

declare module "next-auth" {
  /** Extra fields carried on the authenticated user / session. */
  interface User {
    role: AppRole;
    status: AppUserStatus;
    authorProfileId?: string | null;
  }

  interface Session {
    user: {
      id: string;
      role: AppRole;
      status: AppUserStatus;
      authorProfileId?: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: AppRole;
    status: AppUserStatus;
    authorProfileId?: string | null;
  }
}
