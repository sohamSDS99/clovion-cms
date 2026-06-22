/**
 * Knowledge Base text chunking (§7.1 ingestion).
 *
 * PURE + dependency-free so it stays trivially unit-testable. Splits a document
 * into overlapping chunks for embedding. We have no real tokenizer dependency
 * available, so token counts are a rough estimate of `chars / 4` (a common
 * heuristic for English text with OpenAI-family BPE tokenizers).
 *
 * Strategy:
 *  - Prefer splitting on paragraph boundaries (blank lines), then sentence
 *    boundaries, then hard character cuts — so chunks land on natural breaks.
 *  - Each chunk targets `maxTokens` and carries `overlap` tokens of tail context
 *    from the previous chunk so retrieval doesn't lose meaning across a cut.
 *  - The base-segment budget reserves room for the overlap prefix so that a
 *    full segment plus its overlap prefix still fits inside `maxTokens`.
 */

/** Rough chars-per-token ratio used for the token estimate. */
const CHARS_PER_TOKEN = 4;

export interface ChunkOptions {
  /** Soft upper bound of tokens per chunk. */
  maxTokens?: number;
  /** Tokens of trailing context to repeat at the start of the next chunk. */
  overlap?: number;
}

export interface TextChunk {
  text: string;
  tokenCount: number;
}

/** Rough token estimate (chars / 4), never below 0. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Splits text into smaller "segments" on the strongest available boundary that
 * keeps each piece under `maxChars`. Order of preference: paragraphs, sentences,
 * whitespace, then a hard character cut. Returns trimmed, non-empty segments.
 */
function splitIntoSegments(text: string, maxChars: number): string[] {
  // 1) Paragraphs first (blank-line separated).
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const out: string[] = [];
  for (const para of paragraphs) {
    if (para.length <= maxChars) {
      out.push(para);
      continue;
    }
    // 2) Paragraph too big — split on sentence boundaries.
    const sentences = para.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [para];
    let buffer = "";
    for (const rawSentence of sentences) {
      const sentence = rawSentence.trim();
      if (!sentence) continue;
      if (sentence.length > maxChars) {
        // Flush whatever we have, then hard-cut the oversize sentence.
        if (buffer) {
          out.push(buffer.trim());
          buffer = "";
        }
        for (const piece of hardCut(sentence, maxChars)) out.push(piece);
        continue;
      }
      if ((buffer + " " + sentence).trim().length > maxChars) {
        if (buffer) out.push(buffer.trim());
        buffer = sentence;
      } else {
        buffer = buffer ? `${buffer} ${sentence}` : sentence;
      }
    }
    if (buffer.trim()) out.push(buffer.trim());
  }
  return out;
}

/** Hard character cut, preferring whitespace boundaries near the limit. */
function hardCut(text: string, maxChars: number): string[] {
  const pieces: string[] = [];
  let rest = text;
  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf(" ", maxChars);
    if (cut <= 0) cut = maxChars; // no space found — cut mid-word.
    pieces.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) pieces.push(rest);
  return pieces;
}

/** Builds the overlap prefix: the trailing `overlapChars` of `prev`, on a word boundary. */
function overlapTail(prev: string, overlapChars: number): string {
  if (overlapChars <= 0 || !prev) return "";
  if (prev.length <= overlapChars) return prev;
  const tail = prev.slice(prev.length - overlapChars);
  const spaceIdx = tail.indexOf(" ");
  // Start the tail at the first word boundary so we don't begin mid-word.
  return spaceIdx > 0 ? tail.slice(spaceIdx + 1) : tail;
}

/**
 * Chunk `text` into `{text, tokenCount}` pieces. Pure & deterministic.
 *
 * - Respects `maxTokens` as a HARD cap on chunk size (`tokenCount <= maxTokens`).
 * - Prepends up to `overlap` tokens of context from the previous chunk.
 * - Returns `[]` for empty/whitespace-only input.
 */
export function chunkText(text: string, options: ChunkOptions = {}): TextChunk[] {
  const maxTokens = options.maxTokens ?? 500;
  const overlap = options.overlap ?? 50;

  const normalized = (text ?? "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const maxChars = Math.max(1, maxTokens * CHARS_PER_TOKEN);
  // Overlap must be strictly smaller than the chunk so a chunk = overlap + new
  // content always makes forward progress. Cap it at half the budget so the
  // base segment always has at least as much room as the overlap prefix.
  const overlapChars = Math.max(
    0,
    Math.min(overlap * CHARS_PER_TOKEN, Math.floor(maxChars / 2))
  );
  // Reserve room for the overlap prefix when sizing base segments.
  const segmentBudget = Math.max(1, maxChars - overlapChars);

  const segments = splitIntoSegments(normalized, segmentBudget);

  const chunks: TextChunk[] = [];
  let buffer = "";

  // Emits the buffer, hard-cutting as a safety net so no chunk ever exceeds the
  // hard cap (covers the overlap-prefix + segment composition).
  const flush = () => {
    const trimmed = buffer.trim();
    if (!trimmed) return;
    if (trimmed.length <= maxChars) {
      chunks.push({ text: trimmed, tokenCount: estimateTokens(trimmed) });
    } else {
      for (const piece of hardCut(trimmed, maxChars)) {
        chunks.push({ text: piece, tokenCount: estimateTokens(piece) });
      }
    }
  };

  for (const segment of segments) {
    const candidate = buffer ? `${buffer}\n\n${segment}` : segment;
    if (candidate.length > maxChars && buffer) {
      // Current buffer is full — emit it, then seed the next chunk with overlap.
      flush();
      const tail = overlapTail(buffer.trim(), overlapChars);
      buffer = tail ? `${tail}\n\n${segment}` : segment;
    } else {
      buffer = candidate;
    }
  }
  flush();

  return chunks;
}
