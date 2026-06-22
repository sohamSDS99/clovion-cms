import { handlers } from "@/auth";

// bcrypt (via the Credentials provider) requires the Node.js runtime.
export const runtime = "nodejs";

export const { GET, POST } = handlers;
