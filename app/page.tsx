export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6">
      <h1 className="text-3xl font-bold tracking-tight">Clovion CMS</h1>
      <p className="text-neutral-600">
        Standalone headless content engine for the Clovion AI marketing site.
      </p>
      <p className="text-sm text-neutral-500">
        Phase 1 foundation. Admin UI lives under <code>/(admin)</code>; the
        public read API under <code>/api/public/v1</code>.
      </p>
    </main>
  );
}
