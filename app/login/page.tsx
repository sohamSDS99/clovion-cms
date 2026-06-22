import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";

async function login(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
  } catch (error) {
    // AuthError = bad credentials/inactive user. Anything else (notably the
    // NEXT_REDIRECT thrown on success) must propagate.
    if (error instanceof AuthError) {
      redirect("/login?error=1");
    }
    throw error;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-6">
      <div className="w-full max-w-sm rounded border border-line bg-paper-raised p-8 shadow-raised">
        <div className="mb-6 flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded bg-accent text-sm font-bold text-white">
            C
          </span>
          <h1 className="font-display text-xl font-semibold tracking-tight text-ink">
            Clovion CMS
          </h1>
        </div>
        <p className="text-sm text-ink-mute">Sign in to continue.</p>

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-sm border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger"
          >
            Invalid email or password, or your account is not active.
          </p>
        ) : null}

        <form action={login} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[13px] font-medium text-ink-soft">Email</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className="h-10 rounded-sm border border-line-strong bg-paper-raised px-3 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[13px] font-medium text-ink-soft">Password</span>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className="h-10 rounded-sm border border-line-strong bg-paper-raised px-3 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
            />
          </label>
          <button
            type="submit"
            className="mt-2 h-10 rounded-sm bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
}
