/**
 * Extract text from an uploaded reference file (brief attachments).
 * Accepts pdf, docx, txt, md, csv. Returns { name, text, truncated }.
 * Reuses the KB extraction pipeline (pdf-parse / mammoth).
 */
import { withRoute, json, BadRequestError } from "@/lib/api/http";
import { requireCapability } from "@/lib/auth/guard";
import { rateLimit, tooMany } from "@/lib/ratelimit";
import { extractText } from "@/lib/kb/extract";

export const runtime = "nodejs";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const MAX_CHARS = 150_000; // per attachment, keeps prompts sane

export const POST = withRoute(async (req: Request) => {
  const user = await requireCapability("use_ai_write");
  const rl = await rateLimit(`content-agent:extract:${user.id}`, {
    limit: 30,
    windowSec: 3600,
  });
  if (!rl.ok) return tooMany(rl.resetSec);

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    throw new BadRequestError("Upload a file in the 'file' field.");
  }
  if (file.size > MAX_BYTES) {
    throw new BadRequestError("File too large (max 15 MB).");
  }

  const name = file.name || "attachment";
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const buffer = Buffer.from(await file.arrayBuffer());

  let text: string;
  if (ext === "pdf") {
    text = await extractText("PDF", "", buffer);
  } else if (ext === "docx" || ext === "doc") {
    text = await extractText("DOC", "", buffer);
  } else if (["txt", "md", "markdown", "csv", "json", "html"].includes(ext)) {
    text = buffer.toString("utf8");
  } else {
    throw new BadRequestError(
      `Unsupported file type ".${ext}" — use PDF, DOCX, TXT, MD, or CSV.`
    );
  }

  text = text.trim();
  if (!text) throw new BadRequestError(`Couldn't extract any text from "${name}".`);
  const truncated = text.length > MAX_CHARS;
  return json({
    data: { name, text: text.slice(0, MAX_CHARS), truncated },
  });
});
