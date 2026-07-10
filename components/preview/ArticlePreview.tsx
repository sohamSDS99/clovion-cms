import type { PublicContent } from "@/lib/public/serialize";

interface Faq {
  question: string;
  answer: string;
}

/**
 * Full-page article preview. Presentational only — renders the SAME public
 * payload the website consumes (bodyHtml is the server-sanitized allow-listed
 * HTML), wrapped in a clean article template using the CMS design tokens.
 *
 * This is an APPROXIMATION: the public site is a separate codebase with its own
 * theme, so a preview here can only show structure + content, not the live look.
 */
export function ArticlePreview({
  data,
  status,
}: {
  data: PublicContent;
  status: string;
}) {
  const faqItems: Faq[] = Array.isArray(data.typeData?.faqItems)
    ? (data.typeData.faqItems as Faq[])
    : [];
  const gated = data.type === "RESOURCE" && data.typeData?.gated === true;
  const cover = data.coverImage?.url ?? data.coverImageUrl ?? null;

  return (
    <div className="min-h-screen bg-paper">
      <div className="sticky top-0 z-10 border-b border-warn/30 bg-warn-soft px-4 py-2 text-center text-xs text-warn">
        Preview — status: <strong>{status}</strong>. Reflects the last saved
        version; the live site theme will differ.
      </div>

      <article className="mx-auto max-w-3xl px-6 py-10">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt=""
            className="mb-8 w-full rounded-lg border border-line object-cover"
          />
        ) : null}

        <h1 className="font-display text-4xl font-bold leading-tight text-ink">
          {data.title || "Untitled"}
        </h1>

        {(data.author || data.publishedAt) && (
          <p className="mt-3 text-sm text-ink-mute">
            {data.author ? <span>{data.author.displayName}</span> : null}
            {data.author && data.publishedAt ? " · " : null}
            {data.publishedAt
              ? new Date(data.publishedAt).toLocaleDateString()
              : null}
          </p>
        )}

        {data.excerpt ? (
          <p className="mt-5 text-lg text-ink-soft">{data.excerpt}</p>
        ) : null}

        {gated ? (
          <p className="mt-6 rounded-sm border border-line bg-paper-sunken px-4 py-3 text-sm text-ink-mute">
            This resource is gated — on the live site the file downloads only
            after a reader submits the lead form.
          </p>
        ) : null}

        {data.bodyHtml ? (
          <div
            className="tiptap prose-preview mt-8"
            dangerouslySetInnerHTML={{ __html: data.bodyHtml }}
          />
        ) : (
          <p className="mt-8 text-ink-faint">No body content yet.</p>
        )}

        {faqItems.length > 0 ? (
          <section className="mt-14 border-t border-line pt-8">
            <h2 className="font-display text-2xl font-semibold text-ink">
              Frequently Asked Questions
            </h2>
            <dl className="mt-6 space-y-6">
              {faqItems.map((f, i) => (
                <div key={i}>
                  <dt className="font-display text-lg font-semibold text-ink">
                    {f.question}
                  </dt>
                  <dd className="mt-1.5 whitespace-pre-line text-ink-soft">
                    {f.answer}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
      </article>
    </div>
  );
}
